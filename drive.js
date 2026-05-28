// drive.js — Sync ledger state to Google Drive appDataFolder
(function () {
  const FILE_NAME = 'ledger-state.json';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

  function token() {
    const t = window.LedgerCal && window.LedgerCal.getAccessToken();
    if (!t) throw new Error('ยังไม่ได้เชื่อม Google');
    return t;
  }

  async function api(url, opts = {}) {
    const resp = await fetch(url, {
      ...opts,
      headers: { Authorization: 'Bearer ' + token(), ...(opts.headers || {}) },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Drive ${resp.status}: ${text || resp.statusText}`);
    }
    return resp;
  }

  async function findFile() {
    const url = `${API}/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${encodeURIComponent(`name='${FILE_NAME}' and trashed=false`)}`;
    const resp = await api(url);
    const data = await resp.json();
    const f = (data.files || [])[0];
    return f ? { id: f.id, modifiedTime: f.modifiedTime } : null;
  }

  async function read(fileId) {
    const meta = await api(`${API}/files/${fileId}?fields=id,modifiedTime`).then((r) => r.json());
    const content = await api(`${API}/files/${fileId}?alt=media`).then((r) => r.text());
    return { state: JSON.parse(content), modifiedTime: meta.modifiedTime };
  }

  async function create(state) {
    const metadata = { name: FILE_NAME, parents: ['appDataFolder'] };
    const boundary = '-------ledger' + Math.random().toString(36).slice(2);
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      JSON.stringify(state) +
      `\r\n--${boundary}--`;
    const resp = await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body,
    });
    const data = await resp.json();
    return data.id;
  }

  async function update(fileId, state) {
    const resp = await api(`${UPLOAD}/files/${fileId}?uploadType=media&fields=id,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    return resp.json();
  }

  async function backup(state, knownFileId) {
    let fileId = knownFileId;
    if (!fileId) { const found = await findFile(); fileId = found?.id || null; }
    if (fileId) {
      try {
        const meta = await update(fileId, state);
        return { fileId, modifiedTime: meta.modifiedTime };
      } catch (e) {
        if (String(e.message).includes('404')) {
          fileId = await create(state);
          return { fileId, modifiedTime: new Date().toISOString() };
        }
        throw e;
      }
    }
    fileId = await create(state);
    return { fileId, modifiedTime: new Date().toISOString() };
  }

  async function restore(knownFileId) {
    let fileId = knownFileId;
    if (!fileId) { const found = await findFile(); if (!found) return null; fileId = found.id; }
    try {
      const { state, modifiedTime } = await read(fileId);
      return { fileId, state, modifiedTime };
    } catch (e) {
      if (String(e.message).includes('404')) {
        const found = await findFile();
        if (!found) return null;
        const { state, modifiedTime } = await read(found.id);
        return { fileId: found.id, state, modifiedTime };
      }
      throw e;
    }
  }

  async function peek(knownFileId) {
    let fileId = knownFileId;
    if (!fileId) { const found = await findFile(); if (!found) return null; return found; }
    try {
      const meta = await api(`${API}/files/${fileId}?fields=id,modifiedTime`).then((r) => r.json());
      return { id: meta.id, modifiedTime: meta.modifiedTime };
    } catch {
      const found = await findFile();
      return found;
    }
  }

  window.LedgerDrive = { backup, restore, peek, findFile };
})();
