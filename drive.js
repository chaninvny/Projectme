// drive.js — Sync ledger state JSON to user's Google Drive (appDataFolder)
//
// Uses the access token from LedgerCal (calendar.js) — same OAuth client, just
// an extra scope `drive.appdata`. Files in appDataFolder are PRIVATE to this
// app, hidden from the user's Drive UI, and only readable by this client.
//
// State shape on Drive: a single JSON file named `ledger-state.json`.
// We keep the fileId in settings for fast access; if it disappears we re-find.

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
      headers: {
        Authorization: 'Bearer ' + token(),
        ...(opts.headers || {}),
      },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Drive ${resp.status}: ${text || resp.statusText}`);
    }
    return resp;
  }

  // Locate existing file in appDataFolder, return fileId or null.
  async function findFile() {
    const url = `${API}/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${encodeURIComponent(`name='${FILE_NAME}' and trashed=false`)}`;
    const resp = await api(url);
    const data = await resp.json();
    const f = (data.files || [])[0];
    return f ? { id: f.id, modifiedTime: f.modifiedTime } : null;
  }

  // Read file content (parsed JSON) and its modifiedTime.
  async function read(fileId) {
    // metadata for modifiedTime
    const meta = await api(`${API}/files/${fileId}?fields=id,modifiedTime`).then((r) => r.json());
    const content = await api(`${API}/files/${fileId}?alt=media`).then((r) => r.text());
    return { state: JSON.parse(content), modifiedTime: meta.modifiedTime };
  }

  // Create a new file in appDataFolder; returns fileId.
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

  // Overwrite existing file with new state.
  async function update(fileId, state) {
    const resp = await api(`${UPLOAD}/files/${fileId}?uploadType=media&fields=id,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    return resp.json();
  }

  // High-level: push current state to Drive (create or update).
  // Returns { fileId, modifiedTime }.
  async function backup(state, knownFileId) {
    let fileId = knownFileId;
    if (!fileId) {
      const found = await findFile();
      fileId = found?.id || null;
    }
    if (fileId) {
      try {
        const meta = await update(fileId, state);
        return { fileId, modifiedTime: meta.modifiedTime };
      } catch (e) {
        // If 404 (file deleted), recreate.
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

  // High-level: pull latest state from Drive. Returns null if no file exists.
  async function restore(knownFileId) {
    let fileId = knownFileId;
    if (!fileId) {
      const found = await findFile();
      if (!found) return null;
      fileId = found.id;
    }
    try {
      const { state, modifiedTime } = await read(fileId);
      return { fileId, state, modifiedTime };
    } catch (e) {
      if (String(e.message).includes('404')) {
        // fileId stale — try fresh lookup once
        const found = await findFile();
        if (!found) return null;
        const { state, modifiedTime } = await read(found.id);
        return { fileId: found.id, state, modifiedTime };
      }
      throw e;
    }
  }

  // Check remote file's modifiedTime without downloading content.
  async function peek(knownFileId) {
    let fileId = knownFileId;
    if (!fileId) {
      const found = await findFile();
      if (!found) return null;
      return found;
    }
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
