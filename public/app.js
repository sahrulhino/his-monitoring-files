const BASE = window.__APP_BASE_PATH__ === "/" ? "" : window.__APP_BASE_PATH__;

function qs(sel) {
  return document.querySelector(sel);
}

function fmtBytes(n) {
  if (n == null) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtTime(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleString();
}

async function api(path, opts) {
  const o = opts || {};
  const headers = { "Content-Type": "application/json" };
  if (o.headers) {
    Object.keys(o.headers).forEach((k) => {
      headers[k] = o.headers[k];
    });
  }
  const sep = path.indexOf("?") >= 0 ? "&" : "?";
  const url = `${BASE}${path}${sep}_t=${Date.now()}`;
  const res = await fetch(
    url,
    Object.assign({}, o, { credentials: "include", headers, cache: "no-store" }),
  );
  const isJson = String(res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ? (data.message || data.error) : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function apiForm(path, formData) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ? (data.message || data.error) : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function joinPosix(a, b) {
  if (!a) return b || "/";
  if (!b) return a || "/";
  if (a.endsWith("/")) return a + b.replace(/^\/+/, "");
  return `${a}/${b.replace(/^\/+/, "")}`;
}

function dirnamePosix(p) {
  if (!p || p === "/") return "/";
  const parts = p.split("/").filter(Boolean);
  parts.pop();
  return "/" + parts.join("/");
}

function ensureLeadingSlash(p) {
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

const ui = {
  loginView: qs("#loginView"),
  engineView: qs("#engineView"),
  loginForm: qs("#loginForm"),
  loginUsername: qs("#loginUsername"),
  loginPassword: qs("#loginPassword"),
  loginError: qs("#loginError"),
  sessionInfo: qs("#sessionInfo"),
  logoutBtn: qs("#logoutBtn"),
  toRightBtn: qs("#toRightBtn"),
  toLeftBtn: qs("#toLeftBtn"),
  bulkUploadBtn: qs("#bulkUploadBtn"),

  localRootHint: qs("#localRootHint"),
  localPath: qs("#localPath"),
  localList: qs("#localList"),
  localUpBtn: qs("#localUpBtn"),
  localRefreshBtn: qs("#localRefreshBtn"),
  localLimit: qs("#localLimit"),
  localSearch: qs("#localSearch"),
  localSearchBtn: qs("#localSearchBtn"),
  localPrevBtn: qs("#localPrevBtn"),
  localNextBtn: qs("#localNextBtn"),
  localPageInfo: qs("#localPageInfo"),
  localNewFolderBtn: qs("#localNewFolderBtn"),
  localNewFileBtn: qs("#localNewFileBtn"),
  localUploadBtn: qs("#localUploadBtn"),
  localUploadInput: qs("#localUploadInput"),
  localEditBtn: qs("#localEditBtn"),
  localRenameBtn: qs("#localRenameBtn"),
  localDownloadBtn: qs("#localDownloadBtn"),
  localDeleteBtn: qs("#localDeleteBtn"),

  remoteHostHint: qs("#remoteHostHint"),
  remotePath: qs("#remotePath"),
  remoteList: qs("#remoteList"),
  remoteUpBtn: qs("#remoteUpBtn"),
  remoteRefreshBtn: qs("#remoteRefreshBtn"),
  remoteLimit: qs("#remoteLimit"),
  remoteSearch: qs("#remoteSearch"),
  remoteSearchBtn: qs("#remoteSearchBtn"),
  remotePrevBtn: qs("#remotePrevBtn"),
  remoteNextBtn: qs("#remoteNextBtn"),
  remotePageInfo: qs("#remotePageInfo"),
  remoteNewFolderBtn: qs("#remoteNewFolderBtn"),
  remoteNewFileBtn: qs("#remoteNewFileBtn"),
  remoteUploadBtn: qs("#remoteUploadBtn"),
  remoteUploadInput: qs("#remoteUploadInput"),
  remoteEditBtn: qs("#remoteEditBtn"),
  remoteRenameBtn: qs("#remoteRenameBtn"),
  remoteDownloadBtn: qs("#remoteDownloadBtn"),
  remoteDeleteBtn: qs("#remoteDeleteBtn"),

  editorModal: qs("#editorModal"),
  editorTitle: qs("#editorTitle"),
  editorArea: qs("#editorArea"),
  editorStatus: qs("#editorStatus"),
  editorCloseBtn: qs("#editorCloseBtn"),
  editorSaveBtn: qs("#editorSaveBtn"),

  bulkModal: qs("#bulkModal"),
  bulkCloseBtn: qs("#bulkCloseBtn"),
  bulkLocalDir: qs("#bulkLocalDir"),
  bulkRemoteDir: qs("#bulkRemoteDir"),
  bulkListInput: qs("#bulkListInput"),
  bulkCheckBtn: qs("#bulkCheckBtn"),
  bulkConfirmBtn: qs("#bulkConfirmBtn"),
  bulkSummary: qs("#bulkSummary"),
  bulkStatus: qs("#bulkStatus"),
  bulkResultList: qs("#bulkResultList"),

  previewModal: qs("#previewModal"),
  previewTitle: qs("#previewTitle"),
  previewArea: qs("#previewArea"),
  previewStatus: qs("#previewStatus"),
  previewCloseBtn: qs("#previewCloseBtn"),
  previewCloseBtn2: qs("#previewCloseBtn2"),
};

const state = {
  me: null,
  localPath: "/",
  remotePath: "/",
  localPage: 1,
  localLimit: 200,
  localTotal: 0,
  localQuery: "",
  remotePage: 1,
  remoteLimit: 200,
  remoteTotal: 0,
  remoteQuery: "",
  localItems: [],
  remoteItems: [],
  localSelected: null,
  remoteSelected: null,
  editor: { side: null, path: null },
  bulk: {
    rows: [],
    checked: false,
    uploading: false,
  },
};

function showLogin() {
  ui.loginView.classList.remove("hidden");
  ui.engineView.classList.add("hidden");
  ui.logoutBtn.classList.add("hidden");
  ui.sessionInfo.textContent = "";
  ui.loginError.textContent = "";
}

function showEngine() {
  ui.loginView.classList.add("hidden");
  ui.engineView.classList.remove("hidden");
  ui.logoutBtn.classList.remove("hidden");
}

function setButtonsEnabled() {
  ui.localEditBtn.disabled = !(state.localSelected && state.localSelected.type === "file");
  ui.localRenameBtn.disabled = !state.localSelected;
  ui.localDeleteBtn.disabled = !state.localSelected;
  ui.localDownloadBtn.disabled = !(state.localSelected && state.localSelected.type === "file");

  ui.remoteEditBtn.disabled = !(state.remoteSelected && state.remoteSelected.type === "file");
  ui.remoteRenameBtn.disabled = !state.remoteSelected;
  ui.remoteDeleteBtn.disabled = !state.remoteSelected;
  ui.remoteDownloadBtn.disabled = !(state.remoteSelected && state.remoteSelected.type === "file");

  ui.toRightBtn.disabled = !(state.localSelected && state.localSelected.type === "file");
  ui.toLeftBtn.disabled = !(state.remoteSelected && state.remoteSelected.type === "file");
  if (ui.bulkUploadBtn) ui.bulkUploadBtn.disabled = false;
}

function parseBulkListText(text) {
  const rows = [];
  const seen = new Set();
  const lines = String(text || "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;
    let bds = "";
    let filename = "";
    if (line.includes("\t")) {
      const parts = line.split("\t").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        bds = parts[0];
        filename = parts[parts.length - 1];
      } else if (parts.length === 1) {
        filename = parts[0];
      }
    } else {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length >= 2 && /^BDS\//i.test(parts[0])) {
        bds = parts[0];
        filename = parts[parts.length - 1];
      } else {
        filename = parts[parts.length - 1];
      }
    }
    filename = String(filename || "").replace(/^.*[\\/]/, "").trim();
    if (!filename) continue;
    const key = filename.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      bds,
      filename,
      exists: null,
      size: null,
      mtimeMs: null,
      path: null,
      message: null,
      uploadOk: null,
      uploadMessage: null,
    });
  }
  return rows;
}

function openBulkModal() {
  state.bulk.rows = [];
  state.bulk.checked = false;
  state.bulk.uploading = false;
  ui.bulkLocalDir.textContent = state.localPath || "/";
  ui.bulkRemoteDir.textContent = state.remotePath || "/";
  ui.bulkSummary.textContent = "";
  ui.bulkStatus.textContent =
    "Paste daftar gagal upload, lalu klik Check Files sebelum Confirm Upload.";
  ui.bulkConfirmBtn.disabled = true;
  ui.bulkResultList.innerHTML = "";
  ui.bulkModal.classList.remove("hidden");
  ui.bulkListInput.focus();
}

function closeBulkModal() {
  if (state.bulk.uploading) return;
  ui.bulkModal.classList.add("hidden");
}

function openPreviewModal(title, content, statusText) {
  ui.previewTitle.textContent = title || "Preview";
  ui.previewArea.textContent = content === undefined || content === null ? "" : String(content);
  ui.previewStatus.textContent = statusText || "";
  ui.previewModal.classList.remove("hidden");
}

function closePreviewModal() {
  ui.previewModal.classList.add("hidden");
  ui.previewArea.textContent = "";
  ui.previewStatus.textContent = "";
}

function statusPill(label, className) {
  const span = document.createElement("span");
  span.className = `bulk-status-pill ${className}`;
  span.textContent = label;
  return span;
}

function renderBulkResults() {
  ui.bulkResultList.innerHTML = "";
  for (const row of state.bulk.rows) {
    const tr = document.createElement("tr");

    const tdStatus = document.createElement("td");
    if (row.uploadOk === true) {
      tdStatus.appendChild(statusPill("Uploaded", "bulk-status-ok"));
    } else if (row.uploadOk === false) {
      tdStatus.appendChild(statusPill("Fail", "bulk-status-fail"));
      tdStatus.title = row.uploadMessage || "";
    } else if (row.exists === true) {
      tdStatus.appendChild(statusPill("Ready", "bulk-status-ready"));
    } else if (row.exists === false) {
      tdStatus.appendChild(statusPill("Missing", "bulk-status-missing"));
      tdStatus.title = row.message || "";
    } else {
      tdStatus.textContent = "-";
    }
    tr.appendChild(tdStatus);

    const tdBds = document.createElement("td");
    tdBds.textContent = row.bds || "-";
    tr.appendChild(tdBds);

    const tdFile = document.createElement("td");
    tdFile.textContent = row.filename;
    tr.appendChild(tdFile);

    const tdSize = document.createElement("td");
    tdSize.textContent = row.exists ? fmtBytes(row.size) : "-";
    tr.appendChild(tdSize);

    const tdAction = document.createElement("td");
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn btn-secondary";
    viewBtn.textContent = "View";
    viewBtn.disabled = row.exists !== true;
    viewBtn.addEventListener("click", async () => {
      viewBtn.disabled = true;
      try {
        const localPath = ensureLeadingSlash(joinPosix(state.localPath, row.filename));
        const data = await api(`/api/local/file?path=${encodeURIComponent(localPath)}`);
        openPreviewModal(
          `${row.filename}${row.bds ? ` • ${row.bds}` : ""}`,
          data && data.content != null ? data.content : "",
          `Path: ${localPath}`,
        );
      } catch (err) {
        openPreviewModal(row.filename, "", `Error: ${err.message}`);
      } finally {
        viewBtn.disabled = row.exists !== true;
      }
    });
    tdAction.appendChild(viewBtn);
    tr.appendChild(tdAction);

    ui.bulkResultList.appendChild(tr);
  }

  const readyCount = state.bulk.rows.filter((r) => r.exists === true).length;
  const missingCount = state.bulk.rows.filter((r) => r.exists === false).length;
  ui.bulkSummary.textContent = state.bulk.checked
    ? `Parsed ${state.bulk.rows.length} • Ready ${readyCount} • Missing ${missingCount}`
    : `Parsed ${state.bulk.rows.length}`;
  ui.bulkConfirmBtn.disabled = !(state.bulk.checked && readyCount > 0 && !state.bulk.uploading);
}

function renderTable(tbody, items, selectedName, onSelect, onOpenDir) {
  tbody.innerHTML = "";
  for (const item of items) {
    const tr = document.createElement("tr");
    if (selectedName && selectedName === item.name) tr.classList.add("selected");

    const tdName = document.createElement("td");
    tdName.className = "name";
    const typeBadge = document.createElement("span");
    typeBadge.className = "filetype";
    typeBadge.textContent = item.type === "dir" ? "DIR" : "FILE";
    tdName.appendChild(typeBadge);
    const nameText = document.createElement("span");
    nameText.textContent = item.name;
    tdName.appendChild(nameText);

    const tdSize = document.createElement("td");
    tdSize.className = "size";
    tdSize.textContent = item.type === "dir" ? "" : fmtBytes(item.size);

    const tdTime = document.createElement("td");
    tdTime.className = "mtime";
    tdTime.textContent = fmtTime(item.mtimeMs);

    tr.appendChild(tdName);
    tr.appendChild(tdSize);
    tr.appendChild(tdTime);

    tr.addEventListener("click", () => onSelect(item));
    tr.addEventListener("dblclick", () => {
      if (item.type === "dir") onOpenDir(item.name);
    });

    tbody.appendChild(tr);
  }
}

function updatePager(side, page, limit, total) {
  const safeTotal = typeof total === "number" && total >= 0 ? total : 0;
  const safeLimit = typeof limit === "number" && limit > 0 ? limit : 200;
  const pageCount = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const safePage = typeof page === "number" && page > 0 ? Math.min(page, pageCount) : 1;
  const q = side === "local" ? String(state.localQuery || "") : String(state.remoteQuery || "");
  const qText = q ? ` • Filter "${q.length > 40 ? `${q.slice(0, 40)}...` : q}"` : "";

  if (side === "local") {
    if (ui.localLimit) ui.localLimit.value = String(safeLimit);
    if (ui.localPageInfo) ui.localPageInfo.textContent = `Page ${safePage}/${pageCount} • Total ${safeTotal}${qText}`;
    if (ui.localPrevBtn) ui.localPrevBtn.disabled = safePage <= 1;
    if (ui.localNextBtn) ui.localNextBtn.disabled = safePage >= pageCount;
  } else {
    if (ui.remoteLimit) ui.remoteLimit.value = String(safeLimit);
    if (ui.remotePageInfo) ui.remotePageInfo.textContent = `Page ${safePage}/${pageCount} • Total ${safeTotal}${qText}`;
    if (ui.remotePrevBtn) ui.remotePrevBtn.disabled = safePage <= 1;
    if (ui.remoteNextBtn) ui.remoteNextBtn.disabled = safePage >= pageCount;
  }
}

async function refreshAll() {
  const local = await api(
    `/api/local/list?path=${encodeURIComponent(state.localPath)}&page=${encodeURIComponent(
      state.localPage,
    )}&limit=${encodeURIComponent(state.localLimit)}&q=${encodeURIComponent(state.localQuery || "")}`,
  );
  state.localItems = (local && local.items) ? local.items : [];
  ui.localPath.textContent = (local && local.displayPath) ? local.displayPath : state.localPath;
  state.localTotal = local && typeof local.total === "number" ? local.total : 0;
  state.localPage = local && typeof local.page === "number" ? local.page : state.localPage;
  state.localLimit = local && typeof local.limit === "number" ? local.limit : state.localLimit;
  if (state.localSelected && !state.localItems.find((it) => it.name === state.localSelected.name)) {
    state.localSelected = null;
  }
  updatePager("local", state.localPage, state.localLimit, state.localTotal);
  if (state.localItems.length === 0 && state.localTotal > 0 && state.localPage > 1) {
    state.localPage = 1;
    await refreshAll();
    return;
  }

  const remote = await api(
    `/api/remote/list?path=${encodeURIComponent(state.remotePath)}&page=${encodeURIComponent(
      state.remotePage,
    )}&limit=${encodeURIComponent(state.remoteLimit)}&q=${encodeURIComponent(state.remoteQuery || "")}`,
  );
  state.remoteItems = (remote && remote.items) ? remote.items : [];
  ui.remotePath.textContent = (remote && remote.path) ? remote.path : state.remotePath;
  state.remoteTotal = remote && typeof remote.total === "number" ? remote.total : 0;
  state.remotePage = remote && typeof remote.page === "number" ? remote.page : state.remotePage;
  state.remoteLimit = remote && typeof remote.limit === "number" ? remote.limit : state.remoteLimit;
  if (state.remoteSelected && !state.remoteItems.find((it) => it.name === state.remoteSelected.name)) {
    state.remoteSelected = null;
  }
  updatePager("remote", state.remotePage, state.remoteLimit, state.remoteTotal);
  if (state.remoteItems.length === 0 && state.remoteTotal > 0 && state.remotePage > 1) {
    state.remotePage = 1;
    await refreshAll();
    return;
  }

  renderTable(
    ui.localList,
    state.localItems,
    state.localSelected ? state.localSelected.name : null,
    (it) => {
      state.localSelected = it;
      state.remoteSelected = null;
      setButtonsEnabled();
      refreshSelectionHighlight();
    },
    async (dirName) => {
      state.localPath = ensureLeadingSlash(joinPosix(state.localPath, dirName));
      state.localPage = 1;
      state.localSelected = null;
      await refreshAll();
      setButtonsEnabled();
    },
  );

  renderTable(
    ui.remoteList,
    state.remoteItems,
    state.remoteSelected ? state.remoteSelected.name : null,
    (it) => {
      state.remoteSelected = it;
      state.localSelected = null;
      setButtonsEnabled();
      refreshSelectionHighlight();
    },
    async (dirName) => {
      state.remotePath = ensureLeadingSlash(joinPosix(state.remotePath, dirName));
      state.remotePage = 1;
      state.remoteSelected = null;
      await refreshAll();
      setButtonsEnabled();
    },
  );

  setButtonsEnabled();
}

function refreshSelectionHighlight() {
  const localSelectedName = state.localSelected ? state.localSelected.name : null;
  const remoteSelectedName = state.remoteSelected ? state.remoteSelected.name : null;
  renderTable(
    ui.localList,
    state.localItems,
    localSelectedName,
    (it) => {
      state.localSelected = it;
      state.remoteSelected = null;
      setButtonsEnabled();
      refreshSelectionHighlight();
    },
    async (dirName) => {
      state.localPath = ensureLeadingSlash(joinPosix(state.localPath, dirName));
      state.localPage = 1;
      state.localSelected = null;
      await refreshAll();
      setButtonsEnabled();
    },
  );
  renderTable(
    ui.remoteList,
    state.remoteItems,
    remoteSelectedName,
    (it) => {
      state.remoteSelected = it;
      state.localSelected = null;
      setButtonsEnabled();
      refreshSelectionHighlight();
    },
    async (dirName) => {
      state.remotePath = ensureLeadingSlash(joinPosix(state.remotePath, dirName));
      state.remotePage = 1;
      state.remoteSelected = null;
      await refreshAll();
      setButtonsEnabled();
    },
  );
}

function openEditor(title, side, fullPath, content) {
  state.editor.side = side;
  state.editor.path = fullPath;
  ui.editorTitle.textContent = title;
  ui.editorArea.value = content === undefined || content === null ? "" : content;
  ui.editorStatus.textContent = "";
  ui.editorModal.classList.remove("hidden");
  ui.editorArea.focus();
}

function closeEditor() {
  ui.editorModal.classList.add("hidden");
  state.editor.side = null;
  state.editor.path = null;
}

async function initSession() {
  try {
    state.me = await api("/api/me");
    ui.sessionInfo.textContent = `Login: ${state.me.username}`;
    ui.localRootHint.textContent = `(${state.me.local.root})`;
    ui.remoteHostHint.textContent = `(${state.me.ids.host})`;
    state.localPath = (state.me.local && state.me.local.defaultPath) ? state.me.local.defaultPath : "/";
    state.remotePath = (state.me.ids && state.me.ids.defaultPath) ? state.me.ids.defaultPath : "/";
    state.localPage = 1;
    state.remotePage = 1;
    state.localQuery = ui.localSearch ? String(ui.localSearch.value || "").trim() : "";
    state.remoteQuery = ui.remoteSearch ? String(ui.remoteSearch.value || "").trim() : "";
    if (ui.localLimit) {
      const n = parseInt(ui.localLimit.value, 10);
      if (n) state.localLimit = n;
    }
    if (ui.remoteLimit) {
      const n = parseInt(ui.remoteLimit.value, 10);
      if (n) state.remoteLimit = n;
    }
    showEngine();
    await refreshAll();
  } catch (err) {
    if (err.status === 401) {
      showLogin();
      return;
    }
    showLogin();
    ui.loginError.textContent = err.message;
  }
}

ui.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  ui.loginError.textContent = "";
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: ui.loginUsername.value,
        password: ui.loginPassword.value,
      }),
    });
    ui.loginUsername.value = "";
    ui.loginPassword.value = "";
    await initSession();
  } catch (err) {
    ui.loginError.textContent = "Username / password salah";
  }
});

ui.logoutBtn.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {}
  showLogin();
});

if (ui.localRefreshBtn) {
  ui.localRefreshBtn.addEventListener("click", async () => {
    await refreshAll();
  });
}

if (ui.remoteRefreshBtn) {
  ui.remoteRefreshBtn.addEventListener("click", async () => {
    await refreshAll();
  });
}

async function applyLocalSearch() {
  state.localQuery = ui.localSearch ? String(ui.localSearch.value || "").trim() : "";
  state.localPage = 1;
  state.localSelected = null;
  await refreshAll();
}

async function applyRemoteSearch() {
  state.remoteQuery = ui.remoteSearch ? String(ui.remoteSearch.value || "").trim() : "";
  state.remotePage = 1;
  state.remoteSelected = null;
  await refreshAll();
}

let localSearchTimer = null;
let remoteSearchTimer = null;

if (ui.localSearch) {
  ui.localSearch.addEventListener("input", () => {
    if (localSearchTimer) clearTimeout(localSearchTimer);
    localSearchTimer = setTimeout(async () => {
      await applyLocalSearch();
    }, 250);
  });
  ui.localSearch.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      if (localSearchTimer) clearTimeout(localSearchTimer);
      await applyLocalSearch();
      return;
    }
    if (e.key !== "Escape") return;
    ui.localSearch.value = "";
    if (localSearchTimer) clearTimeout(localSearchTimer);
    await applyLocalSearch();
  });
}

if (ui.localSearchBtn) {
  ui.localSearchBtn.addEventListener("click", async () => {
    if (localSearchTimer) clearTimeout(localSearchTimer);
    await applyLocalSearch();
  });
}

if (ui.remoteSearch) {
  ui.remoteSearch.addEventListener("input", () => {
    if (remoteSearchTimer) clearTimeout(remoteSearchTimer);
    remoteSearchTimer = setTimeout(async () => {
      await applyRemoteSearch();
    }, 250);
  });
  ui.remoteSearch.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      if (remoteSearchTimer) clearTimeout(remoteSearchTimer);
      await applyRemoteSearch();
      return;
    }
    if (e.key !== "Escape") return;
    ui.remoteSearch.value = "";
    if (remoteSearchTimer) clearTimeout(remoteSearchTimer);
    await applyRemoteSearch();
  });
}

if (ui.remoteSearchBtn) {
  ui.remoteSearchBtn.addEventListener("click", async () => {
    if (remoteSearchTimer) clearTimeout(remoteSearchTimer);
    await applyRemoteSearch();
  });
}

if (ui.localPrevBtn) {
  ui.localPrevBtn.addEventListener("click", async () => {
    if (state.localPage <= 1) return;
    state.localPage -= 1;
    state.localSelected = null;
    await refreshAll();
  });
}

if (ui.localNextBtn) {
  ui.localNextBtn.addEventListener("click", async () => {
    const pageCount = Math.max(1, Math.ceil(state.localTotal / state.localLimit));
    if (state.localPage >= pageCount) return;
    state.localPage += 1;
    state.localSelected = null;
    await refreshAll();
  });
}

if (ui.localLimit) {
  ui.localLimit.addEventListener("change", async () => {
    const n = parseInt(ui.localLimit.value, 10);
    if (!n) return;
    state.localLimit = n;
    state.localPage = 1;
    state.localSelected = null;
    await refreshAll();
  });
}

if (ui.remotePrevBtn) {
  ui.remotePrevBtn.addEventListener("click", async () => {
    if (state.remotePage <= 1) return;
    state.remotePage -= 1;
    state.remoteSelected = null;
    await refreshAll();
  });
}

if (ui.remoteNextBtn) {
  ui.remoteNextBtn.addEventListener("click", async () => {
    const pageCount = Math.max(1, Math.ceil(state.remoteTotal / state.remoteLimit));
    if (state.remotePage >= pageCount) return;
    state.remotePage += 1;
    state.remoteSelected = null;
    await refreshAll();
  });
}

if (ui.remoteLimit) {
  ui.remoteLimit.addEventListener("change", async () => {
    const n = parseInt(ui.remoteLimit.value, 10);
    if (!n) return;
    state.remoteLimit = n;
    state.remotePage = 1;
    state.remoteSelected = null;
    await refreshAll();
  });
}

ui.localUpBtn.addEventListener("click", async () => {
  state.localPath = dirnamePosix(state.localPath);
  state.localPage = 1;
  state.localSelected = null;
  await refreshAll();
});

ui.remoteUpBtn.addEventListener("click", async () => {
  state.remotePath = dirnamePosix(state.remotePath);
  state.remotePage = 1;
  state.remoteSelected = null;
  await refreshAll();
});

ui.localNewFolderBtn.addEventListener("click", async () => {
  const name = prompt("Nama folder:");
  if (!name) return;
  await api("/api/local/mkdir", {
    method: "POST",
    body: JSON.stringify({ dir: state.localPath, name }),
  });
  await refreshAll();
});

ui.remoteNewFolderBtn.addEventListener("click", async () => {
  const name = prompt("Nama folder:");
  if (!name) return;
  await api("/api/remote/mkdir", {
    method: "POST",
    body: JSON.stringify({ dir: state.remotePath, name }),
  });
  await refreshAll();
});

ui.localNewFileBtn.addEventListener("click", async () => {
  const name = prompt("Nama file:");
  if (!name) return;
  const target = ensureLeadingSlash(joinPosix(state.localPath, name));
  await api("/api/local/save", { method: "POST", body: JSON.stringify({ path: target, content: "" }) });
  await refreshAll();
});

ui.remoteNewFileBtn.addEventListener("click", async () => {
  const name = prompt("Nama file:");
  if (!name) return;
  const target = ensureLeadingSlash(joinPosix(state.remotePath, name));
  await api("/api/remote/save", { method: "POST", body: JSON.stringify({ path: target, content: "" }) });
  await refreshAll();
});

ui.localRenameBtn.addEventListener("click", async () => {
  if (!state.localSelected) return;
  const newName = prompt("Nama baru:", state.localSelected.name);
  if (!newName) return;
  const target = ensureLeadingSlash(joinPosix(state.localPath, state.localSelected.name));
  await api("/api/local/rename", {
    method: "POST",
    body: JSON.stringify({ path: target, newName }),
  });
  state.localSelected = null;
  await refreshAll();
});

ui.remoteRenameBtn.addEventListener("click", async () => {
  if (!state.remoteSelected) return;
  const newName = prompt("Nama baru:", state.remoteSelected.name);
  if (!newName) return;
  const target = ensureLeadingSlash(joinPosix(state.remotePath, state.remoteSelected.name));
  await api("/api/remote/rename", {
    method: "POST",
    body: JSON.stringify({ path: target, newName }),
  });
  state.remoteSelected = null;
  await refreshAll();
});

ui.localDeleteBtn.addEventListener("click", async () => {
  if (!state.localSelected) return;
  const ok = confirm(`Delete ${state.localSelected.name}?`);
  if (!ok) return;
  const target = ensureLeadingSlash(joinPosix(state.localPath, state.localSelected.name));
  await api("/api/local/delete", { method: "POST", body: JSON.stringify({ path: target }) });
  state.localSelected = null;
  await refreshAll();
});

ui.remoteDeleteBtn.addEventListener("click", async () => {
  if (!state.remoteSelected) return;
  const ok = confirm(`Delete ${state.remoteSelected.name}?`);
  if (!ok) return;
  const target = ensureLeadingSlash(joinPosix(state.remotePath, state.remoteSelected.name));
  await api("/api/remote/delete", { method: "POST", body: JSON.stringify({ path: target }) });
  state.remoteSelected = null;
  await refreshAll();
});

ui.localUploadBtn.addEventListener("click", () => {
  ui.localUploadInput.value = "";
  ui.localUploadInput.click();
});

ui.remoteUploadBtn.addEventListener("click", () => {
  ui.remoteUploadInput.value = "";
  ui.remoteUploadInput.click();
});

ui.localUploadInput.addEventListener("change", async () => {
  const file = ui.localUploadInput.files && ui.localUploadInput.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("dir", state.localPath);
  fd.append("file", file, file.name);
  await apiForm("/api/local/upload", fd);
  await refreshAll();
});

ui.remoteUploadInput.addEventListener("change", async () => {
  const file = ui.remoteUploadInput.files && ui.remoteUploadInput.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("dir", state.remotePath);
  fd.append("file", file, file.name);
  await apiForm("/api/remote/upload", fd);
  await refreshAll();
});

ui.localDownloadBtn.addEventListener("click", () => {
  if (!state.localSelected || state.localSelected.type !== "file") return;
  const p = ensureLeadingSlash(joinPosix(state.localPath, state.localSelected.name));
  window.open(`${BASE}/api/local/download?path=${encodeURIComponent(p)}`, "_blank");
});

ui.remoteDownloadBtn.addEventListener("click", () => {
  if (!state.remoteSelected || state.remoteSelected.type !== "file") return;
  const p = ensureLeadingSlash(joinPosix(state.remotePath, state.remoteSelected.name));
  window.open(`${BASE}/api/remote/download?path=${encodeURIComponent(p)}`, "_blank");
});

ui.localEditBtn.addEventListener("click", async () => {
  if (!state.localSelected || state.localSelected.type !== "file") return;
  const p = ensureLeadingSlash(joinPosix(state.localPath, state.localSelected.name));
  const file = await api(`/api/local/file?path=${encodeURIComponent(p)}`);
  openEditor(`Edit (Local): ${p}`, "local", p, file.content);
});

ui.remoteEditBtn.addEventListener("click", async () => {
  if (!state.remoteSelected || state.remoteSelected.type !== "file") return;
  const p = ensureLeadingSlash(joinPosix(state.remotePath, state.remoteSelected.name));
  const file = await api(`/api/remote/file?path=${encodeURIComponent(p)}`);
  openEditor(`Edit (IDS): ${p}`, "remote", p, file.content);
});

ui.editorCloseBtn.addEventListener("click", () => closeEditor());
ui.editorModal.addEventListener("click", (e) => {
  if (e.target === ui.editorModal) closeEditor();
});

ui.editorSaveBtn.addEventListener("click", async () => {
  if (!state.editor.side || !state.editor.path) return;
  ui.editorSaveBtn.disabled = true;
  ui.editorStatus.textContent = "Saving...";
  try {
    if (state.editor.side === "local") {
      await api("/api/local/save", {
        method: "POST",
        body: JSON.stringify({ path: state.editor.path, content: ui.editorArea.value }),
      });
    } else {
      await api("/api/remote/save", {
        method: "POST",
        body: JSON.stringify({ path: state.editor.path, content: ui.editorArea.value }),
      });
    }
    ui.editorStatus.textContent = "Saved";
    await refreshAll();
  } catch (err) {
    ui.editorStatus.textContent = `Error: ${err.message}`;
  } finally {
    ui.editorSaveBtn.disabled = false;
  }
});

ui.toRightBtn.addEventListener("click", async () => {
  if (!state.localSelected || state.localSelected.type !== "file") return;
  ui.toRightBtn.disabled = true;
  try {
    const localPath = ensureLeadingSlash(joinPosix(state.localPath, state.localSelected.name));
    await api("/api/transfer/local-to-remote", {
      method: "POST",
      body: JSON.stringify({ localPath, remoteDir: state.remotePath }),
    });
    await refreshAll();
  } finally {
    ui.toRightBtn.disabled = false;
  }
});

ui.toLeftBtn.addEventListener("click", async () => {
  if (!state.remoteSelected || state.remoteSelected.type !== "file") return;
  ui.toLeftBtn.disabled = true;
  try {
    const remotePath = ensureLeadingSlash(joinPosix(state.remotePath, state.remoteSelected.name));
    await api("/api/transfer/remote-to-local", {
      method: "POST",
      body: JSON.stringify({ remotePath, localDir: state.localPath }),
    });
    await refreshAll();
  } finally {
    ui.toLeftBtn.disabled = false;
  }
});

if (ui.bulkUploadBtn) {
  ui.bulkUploadBtn.addEventListener("click", () => {
    openBulkModal();
  });
}

if (ui.bulkCloseBtn) {
  ui.bulkCloseBtn.addEventListener("click", () => {
    closeBulkModal();
  });
}

if (ui.bulkListInput) {
  ui.bulkListInput.addEventListener("input", () => {
    state.bulk.checked = false;
    ui.bulkConfirmBtn.disabled = true;
    ui.bulkStatus.textContent = "List berubah. Klik Check Files lagi sebelum upload.";
  });
}

if (ui.bulkCheckBtn) {
  ui.bulkCheckBtn.addEventListener("click", async () => {
    const parsed = parseBulkListText(ui.bulkListInput.value);
    state.bulk.rows = parsed;
    state.bulk.checked = false;
    renderBulkResults();
    if (parsed.length === 0) {
      ui.bulkStatus.textContent = "List kosong / format tidak dikenali.";
      ui.bulkConfirmBtn.disabled = true;
      return;
    }

    ui.bulkCheckBtn.disabled = true;
    ui.bulkConfirmBtn.disabled = true;
    ui.bulkStatus.textContent = "Checking files...";
    try {
      const data = await api("/api/local/check-files", {
        method: "POST",
        body: JSON.stringify({
          dir: state.localPath,
          files: parsed.map((r) => r.filename),
        }),
      });
      const byName = new Map();
      for (const item of (data && data.results) || []) {
        byName.set(String(item.name || "").toLowerCase(), item);
      }
      for (const row of state.bulk.rows) {
        const found = byName.get(row.filename.toLowerCase());
        if (!found) {
          row.exists = false;
          row.message = "missing";
          continue;
        }
        row.exists = !!found.exists;
        row.size = found.size;
        row.mtimeMs = found.mtimeMs;
        row.path = found.path;
        row.message = found.message;
        row.uploadOk = null;
        row.uploadMessage = null;
      }
      state.bulk.checked = true;
      renderBulkResults();
      const readyCount = state.bulk.rows.filter((r) => r.exists).length;
      const missingCount = state.bulk.rows.length - readyCount;
      ui.bulkStatus.textContent =
        missingCount > 0
          ? `Check selesai. ${readyCount} ready, ${missingCount} missing. Preview dulu, lalu Confirm Upload untuk file yang ready.`
          : `Check selesai. Semua ${readyCount} file ready. Bisa preview, lalu Confirm Upload.`;
    } catch (err) {
      ui.bulkStatus.textContent = `Check gagal: ${err.message}`;
      ui.bulkConfirmBtn.disabled = true;
    } finally {
      ui.bulkCheckBtn.disabled = false;
    }
  });
}

if (ui.bulkConfirmBtn) {
  ui.bulkConfirmBtn.addEventListener("click", async () => {
    const readyRows = state.bulk.rows.filter((r) => r.exists === true);
    if (!state.bulk.checked || readyRows.length === 0) return;

    const missingCount = state.bulk.rows.filter((r) => r.exists === false).length;
    const confirmMsg =
      missingCount > 0
        ? `Upload ${readyRows.length} file ready ke IDS?\n(${missingCount} missing akan dilewati)`
        : `Upload ${readyRows.length} file ke IDS folder:\n${state.remotePath}`;
    if (!window.confirm(confirmMsg)) return;

    state.bulk.uploading = true;
    ui.bulkConfirmBtn.disabled = true;
    ui.bulkCheckBtn.disabled = true;
    ui.bulkCloseBtn.disabled = true;
    ui.bulkStatus.textContent = `Uploading 0/${readyRows.length}...`;

    try {
      const data = await api("/api/transfer/local-to-remote-bulk", {
        method: "POST",
        body: JSON.stringify({
          localDir: state.localPath,
          remoteDir: state.remotePath,
          files: readyRows.map((r) => r.filename),
        }),
      });
      const byName = new Map();
      for (const item of (data && data.results) || []) {
        byName.set(String(item.name || "").toLowerCase(), item);
      }
      for (const row of state.bulk.rows) {
        if (row.exists !== true) continue;
        const result = byName.get(row.filename.toLowerCase());
        if (!result) {
          row.uploadOk = false;
          row.uploadMessage = "no_result";
          continue;
        }
        row.uploadOk = !!result.ok;
        row.uploadMessage = result.message;
      }
      renderBulkResults();
      const okCount = data && typeof data.okCount === "number" ? data.okCount : 0;
      const failCount = data && typeof data.failCount === "number" ? data.failCount : 0;
      ui.bulkStatus.textContent = `Upload selesai. Success ${okCount}, failed ${failCount}.`;
      await refreshAll();
    } catch (err) {
      ui.bulkStatus.textContent = `Upload gagal: ${err.message}`;
    } finally {
      state.bulk.uploading = false;
      ui.bulkCheckBtn.disabled = false;
      ui.bulkCloseBtn.disabled = false;
      const readyCount = state.bulk.rows.filter((r) => r.exists === true).length;
      ui.bulkConfirmBtn.disabled = !(state.bulk.checked && readyCount > 0);
    }
  });
}

if (ui.previewCloseBtn) {
  ui.previewCloseBtn.addEventListener("click", () => closePreviewModal());
}
if (ui.previewCloseBtn2) {
  ui.previewCloseBtn2.addEventListener("click", () => closePreviewModal());
}

initSession();
