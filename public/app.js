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
  const res = await fetch(
    `${BASE}${path}`,
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

  if (side === "local") {
    if (ui.localLimit) ui.localLimit.value = String(safeLimit);
    if (ui.localPageInfo) ui.localPageInfo.textContent = `Page ${safePage}/${pageCount} • Total ${safeTotal}`;
    if (ui.localPrevBtn) ui.localPrevBtn.disabled = safePage <= 1;
    if (ui.localNextBtn) ui.localNextBtn.disabled = safePage >= pageCount;
  } else {
    if (ui.remoteLimit) ui.remoteLimit.value = String(safeLimit);
    if (ui.remotePageInfo) ui.remotePageInfo.textContent = `Page ${safePage}/${pageCount} • Total ${safeTotal}`;
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

initSession();
