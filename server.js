const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { PassThrough, Readable } = require("stream");

require("dotenv").config();

const express = require("express");
const Busboy = require("busboy");
const cookie = require("cookie");
const mime = require("mime-types");
const SftpClient = require("ssh2-sftp-client");
const { Client: FtpClient } = require("basic-ftp");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function envOrDefault(name, defaultValue) {
  const v = process.env[name];
  return v === undefined || v === null || v === "" ? defaultValue : v;
}

function parseIntOrNaN(value) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) ? n : Number.NaN;
}

function normalizeBasePath(value) {
  const raw = String(value === undefined || value === null ? "/" : value).trim();
  if (raw === "/" || raw === "") return "/";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "");
  return withoutTrailingSlash === "" ? "/" : withoutTrailingSlash;
}

const APP_PORT = parseIntOrNaN(envOrDefault("APP_PORT", "8099"));
const APP_BASE_PATH = normalizeBasePath(envOrDefault("APP_BASE_PATH", "/"));
const APP_COOKIE_NAME = envOrDefault("APP_COOKIE_NAME", "his_files_sid");
const APP_COOKIE_SECURE =
  String(envOrDefault("APP_COOKIE_SECURE", "")).toLowerCase() === "true" ||
  process.env.NODE_ENV === "production";
const APP_SESSION_TTL_MS = parseIntOrNaN(
  envOrDefault("APP_SESSION_TTL_MS", String(12 * 60 * 60 * 1000)),
);
const APP_UPLOAD_MAX_BYTES = parseIntOrNaN(
  envOrDefault("APP_UPLOAD_MAX_BYTES", String(200 * 1024 * 1024)),
);

const APP_LOGIN_USERNAME = requireEnv("APP_LOGIN_USERNAME");
const APP_LOGIN_PASSWORD = requireEnv("APP_LOGIN_PASSWORD");
const APP_SESSION_SECRET = requireEnv("APP_SESSION_SECRET");

const LOCAL_ROOT = envOrDefault("LOCAL_ROOT", "/var/www");
const LOCAL_DEFAULT_PATH = envOrDefault("LOCAL_DEFAULT_PATH", "/");

const IDS_PROTOCOL = String(envOrDefault("IDS_PROTOCOL", "sftp")).toLowerCase();
const IDS_HOST = requireEnv("IDS_HOST");
const IDS_PORT = parseIntOrNaN(envOrDefault("IDS_PORT", ""));
const IDS_USERNAME = requireEnv("IDS_USERNAME");
const IDS_PASSWORD = requireEnv("IDS_PASSWORD");
const IDS_DEFAULT_PATH = envOrDefault("IDS_DEFAULT_PATH", "/");

const SFTP_PORT_DEFAULT = 22;
const FTP_PORT_DEFAULT = 21;

function getIdsPort() {
  if (Number.isFinite(IDS_PORT)) return IDS_PORT;
  return IDS_PROTOCOL === "ftp" ? FTP_PORT_DEFAULT : SFTP_PORT_DEFAULT;
}

function createCookieHeader(sid) {
  return cookie.serialize(APP_COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: APP_COOKIE_SECURE,
    path: APP_BASE_PATH === "/" ? "/" : `${APP_BASE_PATH}/`,
    maxAge: Math.floor(APP_SESSION_TTL_MS / 1000),
  });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return cookie.parse(header);
}

function timingSafeEqualStr(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function createSessionId() {
  const random = crypto.randomBytes(32).toString("hex");
  const sig = crypto
    .createHmac("sha256", APP_SESSION_SECRET)
    .update(random)
    .digest("hex");
  return `${random}.${sig}`;
}

function verifySessionId(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 2) return false;
  const [random, sig] = parts;
  const expected = crypto
    .createHmac("sha256", APP_SESSION_SECRET)
    .update(random)
    .digest("hex");
  return timingSafeEqualStr(sig, expected);
}

const sessions = new Map();

function createSession(username) {
  const sid = createSessionId();
  sessions.set(sid, { username, expiresAt: Date.now() + APP_SESSION_TTL_MS });
  return sid;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies[APP_COOKIE_NAME];
  if (!sid || !verifySessionId(sid)) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  session.expiresAt = Date.now() + APP_SESSION_TTL_MS;
  return { sid, username: session.username };
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.user = session;
  res.setHeader("Set-Cookie", createCookieHeader(session.sid));
  next();
}

function normalizeRelPath(input) {
  const raw = String(input || "").trim();
  if (!raw || raw === "/") return "/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = path.posix.normalize(withLeading);
  if (!normalized.startsWith("/")) return "/";
  return normalized;
}

function resolveLocalPath(relPath) {
  const rel = normalizeRelPath(relPath);
  const full = path.resolve(LOCAL_ROOT, `.${rel}`);
  const rootResolved = path.resolve(LOCAL_ROOT);
  if (full === rootResolved) return full;
  if (!full.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error("Path is outside of local root");
  }
  return full;
}

async function safeStat(p) {
  try {
    return await fsp.stat(p);
  } catch {
    return null;
  }
}

async function listLocal(relPath) {
  const dirFsPath = resolveLocalPath(relPath);
  const entries = await fsp.readdir(dirFsPath, { withFileTypes: true });
  const items = [];
  for (const ent of entries) {
    const full = path.join(dirFsPath, ent.name);
    const st = await safeStat(full);
    items.push({
      name: ent.name,
      type: ent.isDirectory() ? "dir" : "file",
      size: st && st.isFile && st.isFile() ? st.size : null,
      mtimeMs: st ? st.mtimeMs : null,
    });
  }
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return items;
}

async function readLocalFile(relPath) {
  const full = resolveLocalPath(relPath);
  const st = await fsp.stat(full);
  if (!st.isFile()) throw new Error("Not a file");
  return await fsp.readFile(full, "utf8");
}

async function writeLocalFile(relPath, content) {
  const full = resolveLocalPath(relPath);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, content === undefined || content === null ? "" : content, "utf8");
}

async function deleteLocal(relPath) {
  const full = resolveLocalPath(relPath);
  const st = await fsp.stat(full);
  if (st.isDirectory()) {
    await fsp.rm(full, { recursive: true, force: true });
    return;
  }
  await fsp.unlink(full);
}

async function mkdirLocal(dirRelPath, name) {
  const parent = resolveLocalPath(dirRelPath);
  const target = path.join(parent, name);
  const rootResolved = path.resolve(LOCAL_ROOT);
  if (!target.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error("Path is outside of local root");
  }
  await fsp.mkdir(target, { recursive: true });
}

async function renameLocal(relPath, newName) {
  const full = resolveLocalPath(relPath);
  const dir = path.dirname(full);
  const target = path.join(dir, newName);
  const rootResolved = path.resolve(LOCAL_ROOT);
  if (!target.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error("Path is outside of local root");
  }
  await fsp.rename(full, target);
}

function posixJoin(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  if (!aa) return bb || "/";
  if (!bb) return aa || "/";
  if (aa.endsWith("/")) return aa + bb.replace(/^\/+/, "");
  return `${aa}/${bb.replace(/^\/+/, "")}`;
}

function normalizeRemotePath(input) {
  const raw = String(input || "").trim();
  if (!raw || raw === "/") return "/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = path.posix.normalize(withLeading);
  return normalized.startsWith("/") ? normalized : "/";
}

async function withRemoteClient(fn) {
  if (IDS_PROTOCOL === "ftp") {
    const client = new FtpClient();
    client.ftp.verbose = false;
    try {
      await client.access({
        host: IDS_HOST,
        port: getIdsPort(),
        user: IDS_USERNAME,
        password: IDS_PASSWORD,
        secure: false,
      });
      return await fn({ protocol: "ftp", client });
    } finally {
      client.close();
    }
  }

  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host: IDS_HOST,
      port: getIdsPort(),
      username: IDS_USERNAME,
      password: IDS_PASSWORD,
      readyTimeout: 20000,
    });
    return await fn({ protocol: "sftp", client: sftp });
  } finally {
    try {
      await sftp.end();
    } catch {}
  }
}

async function listRemote(remotePath) {
  const p = normalizeRemotePath(remotePath);
  return await withRemoteClient(async ({ protocol, client }) => {
    if (protocol === "sftp") {
      const rows = await client.list(p);
      const items = rows.map((r) => ({
        name: r.name,
        type: r.type === "d" ? "dir" : "file",
        size: r.type === "d" ? null : r.size === undefined || r.size === null ? null : r.size,
        mtimeMs: r.modifyTime ? Number(r.modifyTime) : null,
      }));
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return items;
    }

    const rows = await client.list(p);
    const items = rows.map((r) => ({
      name: r.name,
      type: r.isDirectory ? "dir" : "file",
      size: r.isDirectory ? null : r.size === undefined || r.size === null ? null : r.size,
      mtimeMs: r.modifiedAt ? r.modifiedAt.getTime() : null,
    }));
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return items;
  });
}

async function readRemoteFile(remotePath) {
  const p = normalizeRemotePath(remotePath);
  return await withRemoteClient(async ({ protocol, client }) => {
    if (protocol === "sftp") {
      const buf = await client.get(p);
      if (Buffer.isBuffer(buf)) return buf.toString("utf8");
      const chunks = [];
      await new Promise((resolve, reject) => {
        buf.on("data", (c) => chunks.push(c));
        buf.on("end", resolve);
        buf.on("error", reject);
      });
      return Buffer.concat(chunks).toString("utf8");
    }

    const pass = new PassThrough();
    const chunks = [];
    pass.on("data", (c) => chunks.push(Buffer.from(c)));
    await client.downloadTo(pass, p);
    return Buffer.concat(chunks).toString("utf8");
  });
}

async function writeRemoteFile(remotePath, content) {
  const p = normalizeRemotePath(remotePath);
  const buf = Buffer.from(String(content === undefined || content === null ? "" : content), "utf8");
  return await withRemoteClient(async ({ protocol, client }) => {
    if (protocol === "sftp") {
      await client.put(buf, p);
      return;
    }
    await client.uploadFrom(Readable.from(buf), p);
  });
}

async function mkdirRemote(remoteDirPath, name) {
  const dir = normalizeRemotePath(remoteDirPath);
  const target = normalizeRemotePath(posixJoin(dir, name));
  return await withRemoteClient(async ({ protocol, client }) => {
    if (protocol === "sftp") {
      await client.mkdir(target, true);
      return;
    }
    await client.ensureDir(target);
  });
}

async function deleteRemote(remotePath) {
  const p = normalizeRemotePath(remotePath);
  return await withRemoteClient(async ({ protocol, client }) => {
    if (protocol === "sftp") {
      try {
        const type = await client.exists(p);
        if (type === "d") {
          await client.rmdir(p, true);
          return;
        }
      } catch {}
      await client.delete(p);
      return;
    }

    try {
      await client.remove(p);
      return;
    } catch {}
    await client.removeDir(p);
  });
}

async function renameRemote(remotePath, newName) {
  const p = normalizeRemotePath(remotePath);
  const dir = path.posix.dirname(p);
  const target = normalizeRemotePath(posixJoin(dir, newName));
  return await withRemoteClient(async ({ protocol, client }) => {
    if (protocol === "sftp") {
      await client.rename(p, target);
      return;
    }
    await client.rename(p, target);
  });
}

async function streamRemoteToLocal(remotePath, localDirRel) {
  const remote = normalizeRemotePath(remotePath);
  const localDirFs = resolveLocalPath(localDirRel);
  const baseName = path.posix.basename(remote);
  const targetFs = path.join(localDirFs, baseName);

  await fsp.mkdir(path.dirname(targetFs), { recursive: true });

  return await withRemoteClient(async ({ protocol, client }) => {
    if (protocol === "sftp") {
      await client.fastGet(remote, targetFs);
      return { savedAs: baseName };
    }

    const out = fs.createWriteStream(targetFs);
    try {
      await client.downloadTo(out, remote);
    } finally {
      out.close();
    }
    return { savedAs: baseName };
  });
}

async function streamLocalToRemote(localPathRel, remoteDir) {
  const localFs = resolveLocalPath(localPathRel);
  const remoteD = normalizeRemotePath(remoteDir);
  const baseName = path.basename(localFs);
  const remoteTarget = normalizeRemotePath(posixJoin(remoteD, baseName));

  return await withRemoteClient(async ({ protocol, client }) => {
    if (protocol === "sftp") {
      await client.put(fs.createReadStream(localFs), remoteTarget);
      return { savedAs: baseName };
    }
    await client.uploadFrom(fs.createReadStream(localFs), remoteTarget);
    return { savedAs: baseName };
  });
}

function jsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function errMessage(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err && typeof err.message === "string") return err.message;
  return String(err);
}

function replaceAllLiteral(haystack, needle, replacement) {
  return String(haystack).split(String(needle)).join(String(replacement));
}

const app = express();
app.disable("x-powered-by");

const router = express.Router();

const publicDir = path.join(__dirname, "public");
const indexTemplatePath = path.join(publicDir, "index.html");
const indexTemplate = fs.existsSync(indexTemplatePath)
  ? fs.readFileSync(indexTemplatePath, "utf8")
  : "<html><body>Missing public/index.html</body></html>";

router.get("/", (req, res) => {
  const assetPrefix = APP_BASE_PATH === "/" ? "" : APP_BASE_PATH;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    replaceAllLiteral(
      replaceAllLiteral(
        replaceAllLiteral(
          replaceAllLiteral(indexTemplate, "__APP_BASE_PATH_VALUE__", APP_BASE_PATH),
          "__APP_ASSET_PREFIX__",
          assetPrefix,
        ),
        "__LOCAL_ROOT_VALUE__",
        LOCAL_ROOT,
      ),
      "__IDS_HOST_VALUE__",
      IDS_HOST,
    ),
  );
});

router.use("/assets", express.static(publicDir, { maxAge: "1h" }));

router.post("/api/login", async (req, res) => {
  try {
    const body = await jsonBody(req);
    const username = String((body && body.username) || "");
    const password = String((body && body.password) || "");

    const ok =
      timingSafeEqualStr(username, APP_LOGIN_USERNAME) &&
      timingSafeEqualStr(password, APP_LOGIN_PASSWORD);

    if (!ok) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const sid = createSession(username);
    res.setHeader("Set-Cookie", createCookieHeader(sid));
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "bad_request" });
  }
});

router.post("/api/logout", requireAuth, (req, res) => {
  sessions.delete(req.user.sid);
  res.setHeader(
    "Set-Cookie",
    cookie.serialize(APP_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: APP_COOKIE_SECURE,
      path: APP_BASE_PATH === "/" ? "/" : `${APP_BASE_PATH}/`,
      maxAge: 0,
    }),
  );
  res.json({ ok: true });
});

router.get("/api/me", requireAuth, (req, res) => {
  res.json({
    username: req.user.username,
    local: { root: LOCAL_ROOT, defaultPath: normalizeRelPath(LOCAL_DEFAULT_PATH) },
    ids: {
      host: IDS_HOST,
      protocol: IDS_PROTOCOL,
      port: getIdsPort(),
      defaultPath: normalizeRemotePath(IDS_DEFAULT_PATH),
    },
  });
});

router.get("/api/local/list", requireAuth, async (req, res) => {
  try {
    const relPath = normalizeRelPath(req.query.path);
    const items = await listLocal(relPath);
    res.json({ path: relPath, displayPath: `${LOCAL_ROOT}${relPath === "/" ? "" : relPath}`, items });
  } catch (err) {
    res.status(400).json({ error: "bad_path", message: errMessage(err) });
  }
});

router.get("/api/local/file", requireAuth, async (req, res) => {
  try {
    const relPath = normalizeRelPath(req.query.path);
    const content = await readLocalFile(relPath);
    res.json({ path: relPath, content });
  } catch (err) {
    res.status(400).json({ error: "read_failed", message: errMessage(err) });
  }
});

router.post("/api/local/save", requireAuth, async (req, res) => {
  try {
    const body = await jsonBody(req);
    const relPath = normalizeRelPath(body.path);
    await writeLocalFile(relPath, body.content);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "write_failed", message: errMessage(err) });
  }
});

router.post("/api/local/mkdir", requireAuth, async (req, res) => {
  try {
    const body = await jsonBody(req);
    const dir = normalizeRelPath(body.dir);
    const name = String((body && body.name) || "").trim();
    if (!name) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    await mkdirLocal(dir, name);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "mkdir_failed", message: errMessage(err) });
  }
});

router.post("/api/local/rename", requireAuth, async (req, res) => {
  try {
    const body = await jsonBody(req);
    const relPath = normalizeRelPath(body.path);
    const newName = String((body && body.newName) || "").trim();
    if (!newName) {
      res.status(400).json({ error: "new_name_required" });
      return;
    }
    await renameLocal(relPath, newName);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "rename_failed", message: errMessage(err) });
  }
});

router.post("/api/local/delete", requireAuth, async (req, res) => {
  try {
    const body = await jsonBody(req);
    const relPath = normalizeRelPath(body.path);
    if (relPath === "/") {
      res.status(400).json({ error: "refuse_root_delete" });
      return;
    }
    await deleteLocal(relPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "delete_failed", message: errMessage(err) });
  }
});

router.post("/api/local/upload", requireAuth, async (req, res) => {
  const bb = Busboy({
    headers: req.headers,
    limits: {
      fileSize: Number.isFinite(APP_UPLOAD_MAX_BYTES) ? APP_UPLOAD_MAX_BYTES : 200 * 1024 * 1024,
    },
  });

  let targetDirRel = "/";
  let saved = 0;
  let fileOps = [];
  let errored = false;

  bb.on("field", (name, val) => {
    if (name === "dir") targetDirRel = normalizeRelPath(val);
  });

  bb.on("file", (name, file, info) => {
    if (name !== "file") {
      file.resume();
      return;
    }
    const filename = String((info && info.filename) || "").trim();
    if (!filename) {
      file.resume();
      return;
    }
    try {
      const dirFs = resolveLocalPath(targetDirRel);
      const full = path.join(dirFs, filename);
      const rootResolved = path.resolve(LOCAL_ROOT);
      if (!full.startsWith(`${rootResolved}${path.sep}`)) {
        throw new Error("Path is outside of local root");
      }
      fileOps.push(
        (async () => {
          await fsp.mkdir(path.dirname(full), { recursive: true });
          await new Promise((resolve, reject) => {
            const out = fs.createWriteStream(full);
            file.pipe(out);
            out.on("finish", resolve);
            out.on("error", reject);
            file.on("error", reject);
          });
          saved += 1;
        })(),
      );
    } catch (err) {
      errored = true;
      file.resume();
      res.status(400).json({ error: "upload_failed", message: errMessage(err) });
    }
  });

  bb.on("error", () => {
    if (errored) return;
    res.status(400).json({ error: "upload_failed" });
  });

  bb.on("close", async () => {
    if (errored) return;
    try {
      await Promise.all(fileOps);
      res.json({ ok: true, saved });
    } catch (err) {
      res.status(400).json({ error: "upload_failed", message: errMessage(err) });
    }
  });

  req.pipe(bb);
});

router.get("/api/local/download", requireAuth, async (req, res) => {
  try {
    const relPath = normalizeRelPath(req.query.path);
    const full = resolveLocalPath(relPath);
    const st = await fsp.stat(full);
    if (!st.isFile()) {
      res.status(400).json({ error: "not_a_file" });
      return;
    }
    const filename = path.basename(full);
    const contentType = mime.contentType(filename) || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    fs.createReadStream(full).pipe(res);
  } catch (err) {
    res.status(400).json({ error: "download_failed", message: errMessage(err) });
  }
});

router.get("/api/remote/list", requireAuth, async (req, res) => {
  try {
    const remotePath = normalizeRemotePath(req.query.path);
    const items = await listRemote(remotePath);
    res.json({ path: remotePath, items });
  } catch (err) {
    res.status(400).json({ error: "remote_list_failed", message: errMessage(err) });
  }
});

router.get("/api/remote/file", requireAuth, async (req, res) => {
  try {
    const remotePath = normalizeRemotePath(req.query.path);
    const content = await readRemoteFile(remotePath);
    res.json({ path: remotePath, content });
  } catch (err) {
    res.status(400).json({ error: "remote_read_failed", message: errMessage(err) });
  }
});

router.post("/api/remote/save", requireAuth, async (req, res) => {
  try {
    const body = await jsonBody(req);
    const remotePath = normalizeRemotePath(body.path);
    await writeRemoteFile(remotePath, body.content);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "remote_write_failed", message: errMessage(err) });
  }
});

router.post("/api/remote/mkdir", requireAuth, async (req, res) => {
  try {
    const body = await jsonBody(req);
    const dir = normalizeRemotePath(body.dir);
    const name = String((body && body.name) || "").trim();
    if (!name) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    await mkdirRemote(dir, name);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "remote_mkdir_failed", message: errMessage(err) });
  }
});

router.post("/api/remote/rename", requireAuth, async (req, res) => {
  try {
    const body = await jsonBody(req);
    const remotePath = normalizeRemotePath(body.path);
    const newName = String((body && body.newName) || "").trim();
    if (!newName) {
      res.status(400).json({ error: "new_name_required" });
      return;
    }
    await renameRemote(remotePath, newName);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "remote_rename_failed", message: errMessage(err) });
  }
});

router.post("/api/remote/delete", requireAuth, async (req, res) => {
  try {
    const body = await jsonBody(req);
    const remotePath = normalizeRemotePath(body.path);
    if (remotePath === "/") {
      res.status(400).json({ error: "refuse_root_delete" });
      return;
    }
    await deleteRemote(remotePath);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: "remote_delete_failed", message: errMessage(err) });
  }
});

router.post("/api/remote/upload", requireAuth, async (req, res) => {
  const bb = Busboy({
    headers: req.headers,
    limits: {
      fileSize: Number.isFinite(APP_UPLOAD_MAX_BYTES) ? APP_UPLOAD_MAX_BYTES : 200 * 1024 * 1024,
    },
  });

  let targetDir = "/";
  let saved = 0;
  let fileOps = [];
  let errored = false;

  bb.on("field", (name, val) => {
    if (name === "dir") targetDir = normalizeRemotePath(val);
  });

  bb.on("file", (name, file, info) => {
    if (name !== "file") {
      file.resume();
      return;
    }
    const filename = String((info && info.filename) || "").trim();
    if (!filename) {
      file.resume();
      return;
    }
    const remoteTarget = normalizeRemotePath(posixJoin(targetDir, filename));
    fileOps.push(
      withRemoteClient(async ({ protocol, client }) => {
        if (protocol === "sftp") {
          await client.put(file, remoteTarget);
          saved += 1;
          return;
        }
        await client.uploadFrom(file, remoteTarget);
        saved += 1;
      }).catch((err) => {
        errored = true;
        res.status(400).json({ error: "remote_upload_failed", message: errMessage(err) });
      }),
    );
  });

  bb.on("error", () => {
    if (errored) return;
    res.status(400).json({ error: "remote_upload_failed" });
  });

  bb.on("close", async () => {
    if (errored) return;
    try {
      await Promise.all(fileOps);
      res.json({ ok: true, saved });
    } catch (err) {
      res.status(400).json({ error: "remote_upload_failed", message: errMessage(err) });
    }
  });

  req.pipe(bb);
});

router.get("/api/remote/download", requireAuth, async (req, res) => {
  try {
    const remotePath = normalizeRemotePath(req.query.path);
    const filename = path.posix.basename(remotePath);
    const contentType = mime.contentType(filename) || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await withRemoteClient(async ({ protocol, client }) => {
      if (protocol === "sftp") {
        const stream = await client.get(remotePath);
        if (Buffer.isBuffer(stream)) {
          res.end(stream);
          return;
        }
        stream.pipe(res);
        return;
      }
      await client.downloadTo(res, remotePath);
    });
  } catch (err) {
    res.status(400).json({ error: "remote_download_failed", message: errMessage(err) });
  }
});

router.post("/api/transfer/local-to-remote", requireAuth, async (req, res) => {
  try {
    const body = await jsonBody(req);
    const localPath = normalizeRelPath(body.localPath);
    const remoteDir = normalizeRemotePath(body.remoteDir);
    const result = await streamLocalToRemote(localPath, remoteDir);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: "transfer_failed", message: errMessage(err) });
  }
});

router.post("/api/transfer/remote-to-local", requireAuth, async (req, res) => {
  try {
    const body = await jsonBody(req);
    const remotePath = normalizeRemotePath(body.remotePath);
    const localDir = normalizeRelPath(body.localDir);
    const result = await streamRemoteToLocal(remotePath, localDir);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: "transfer_failed", message: errMessage(err) });
  }
});

app.use(APP_BASE_PATH, router);

app.listen(APP_PORT, "0.0.0.0", () => {
  process.stdout.write(
    `his-monitoring-files listening on http://0.0.0.0:${APP_PORT}${APP_BASE_PATH}\n`,
  );
});
