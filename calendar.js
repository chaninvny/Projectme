// calendar.js — Google Calendar integration (Google Identity Services + gapi)
//
// Flow:
//   1. User pastes their OAuth Client ID in Settings (created in Google Cloud Console)
//   2. connect() → loads gapi + GIS, requests access_token for calendar scope
//   3. ensureCalendar() → finds or creates a calendar named 'รายรับ-รายจ่าย'
//   4. pushEvent({ summary, date, amount, type }) → creates all-day event
//   5. updateEvent / deleteEvent / pullEvents — straightforward CRUD
//
// No backend, no API key needed for OAuth flow — only the client ID. All calls
// are made browser-side with the user's own token.

(function () {
  const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.appdata';
  const DISCOVERY = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

  let tokenClient = null;
  let accessToken = null;
  let gapiReady = false;
  let gisReady = false;

  function loadGapi() {
    return new Promise((resolve, reject) => {
      if (gapiReady) return resolve();
      function tryInit() {
        if (typeof gapi === 'undefined') return setTimeout(tryInit, 80);
        gapi.load('client', async () => {
          try {
            await gapi.client.init({ discoveryDocs: [DISCOVERY] });
            gapiReady = true;
            resolve();
          } catch (e) { reject(e); }
        });
      }
      tryInit();
    });
  }

  function waitForGIS() {
    return new Promise((resolve) => {
      function tryIt() {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
          gisReady = true; resolve();
        } else {
          setTimeout(tryIt, 80);
        }
      }
      tryIt();
    });
  }

  // Connect: request an access token using the user's OAuth client ID.
  async function connect(clientId) {
    if (!clientId) throw new Error('กรุณาใส่ Google OAuth Client ID ก่อน');
    await Promise.all([loadGapi(), waitForGIS()]);

    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        prompt: '',
        callback: (resp) => {
          if (resp.error) return reject(new Error(resp.error_description || resp.error));
          accessToken = resp.access_token;
          gapi.client.setToken({ access_token: accessToken });
          resolve(accessToken);
        },
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  function disconnect() {
    if (accessToken && window.google && google.accounts) {
      try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch {}
    }
    accessToken = null;
    if (gapiReady && gapi.client) gapi.client.setToken(null);
  }

  function isConnected() { return !!accessToken; }
  function getAccessToken() { return accessToken; }

  // Find or create the app's calendar by name.
  async function ensureCalendar(name = 'รายรับ-รายจ่าย') {
    const list = await gapi.client.calendar.calendarList.list({ maxResults: 250 });
    const found = (list.result.items || []).find((c) => c.summary === name);
    if (found) return found.id;
    const created = await gapi.client.calendar.calendars.insert({
      resource: { summary: name, description: 'สร้างโดย Ledger', timeZone: 'Asia/Bangkok' },
    });
    return created.result.id;
  }

  // Push a single event. `tx` shape: { date: 'YYYY-MM-DD', label, amount, type: 'in'|'out' }
  async function pushEvent(calendarId, tx) {
    const sign = tx.type === 'in' ? '+' : '−';
    const summary = `${sign}฿${Math.abs(tx.amount).toLocaleString('en-US')} · ${tx.label}`;
    const resp = await gapi.client.calendar.events.insert({
      calendarId,
      resource: {
        summary,
        description: `${tx.type === 'in' ? 'รายรับ' : 'รายจ่าย'} · ${tx.category || ''}`,
        start: { date: tx.date },
        end: { date: tx.date },
        reminders: tx.notify ? { useDefault: false, overrides: [{ method: 'popup', minutes: 24 * 60 }] } : { useDefault: false },
        extendedProperties: { private: { ledgerType: tx.type, ledgerAmount: String(tx.amount) } },
      },
    });
    return resp.result.id;
  }

  async function updateEvent(calendarId, eventId, tx) {
    const sign = tx.type === 'in' ? '+' : '−';
    const summary = `${sign}฿${Math.abs(tx.amount).toLocaleString('en-US')} · ${tx.label}`;
    const resp = await gapi.client.calendar.events.update({
      calendarId, eventId,
      resource: {
        summary,
        description: `${tx.type === 'in' ? 'รายรับ' : 'รายจ่าย'} · ${tx.category || ''}`,
        start: { date: tx.date },
        end: { date: tx.date },
        extendedProperties: { private: { ledgerType: tx.type, ledgerAmount: String(tx.amount) } },
      },
    });
    return resp.result.id;
  }

  async function deleteEvent(calendarId, eventId) {
    try {
      await gapi.client.calendar.events.delete({ calendarId, eventId });
    } catch (e) {
      // 410 Gone is fine
      if (e?.status !== 410 && e?.status !== 404) throw e;
    }
  }

  // Pull events in a date range from the linked calendar.
  // Returns events that look like ledger entries (have amount in title or extendedProperties).
  async function pullEvents(calendarId, fromDate, toDate) {
    const resp = await gapi.client.calendar.events.list({
      calendarId,
      timeMin: new Date(fromDate).toISOString(),
      timeMax: new Date(toDate).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 500,
    });
    return resp.result.items || [];
  }

  // Generate ICS text (fallback for users who don't want OAuth)
  function generateICS(state) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Ledger//TH//EN',
      'CALSCALE:GREGORIAN',
      `X-WR-CALNAME:${state.settings.googleCalendarName || 'รายรับ-รายจ่าย'}`,
    ];
    const stamp = formatICSDate(new Date());
    const fmtDate = (s) => s.replace(/-/g, '');
    // Recurring as RRULE
    (state.recurring || []).forEach((r) => {
      const sign = r.type === 'in' ? '+' : '−';
      const summary = `${sign}฿${Math.abs(r.amount).toLocaleString('en-US')} · ${r.label}`;
      // Start at current month's day or next; if day already passed in current month, start next month.
      const today = new Date();
      let start = new Date(today.getFullYear(), today.getMonth(), r.day);
      if (start < today) start = new Date(today.getFullYear(), today.getMonth() + 1, r.day);
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:rec-${r.id}@ledger`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${fmtDate(formatYMD(start))}`);
      lines.push(`DTEND;VALUE=DATE:${fmtDate(formatYMD(addDays(start, 1)))}`);
      lines.push(`SUMMARY:${escapeICS(summary)}`);
      lines.push(`DESCRIPTION:${escapeICS((r.type === 'in' ? 'รายรับ' : 'รายจ่าย') + ' · ' + (r.category || ''))}`);
      lines.push(`RRULE:FREQ=MONTHLY;BYMONTHDAY=${r.day}`);
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-P1D');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${escapeICS('แจ้งล่วงหน้า · ' + summary)}`);
      lines.push('END:VALARM');
      lines.push('END:VEVENT');
    });
    // Income
    if (state.income) {
      const r = state.income;
      const today = new Date();
      let start = new Date(today.getFullYear(), today.getMonth(), r.day);
      if (start < today) start = new Date(today.getFullYear(), today.getMonth() + 1, r.day);
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:income@ledger`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${fmtDate(formatYMD(start))}`);
      lines.push(`DTEND;VALUE=DATE:${fmtDate(formatYMD(addDays(start, 1)))}`);
      lines.push(`SUMMARY:${escapeICS('+฿' + r.amount.toLocaleString('en-US') + ' · ' + r.label)}`);
      lines.push(`RRULE:FREQ=MONTHLY;BYMONTHDAY=${r.day}`);
      lines.push('END:VEVENT');
    }
    // One-shot transactions
    (state.transactions || []).forEach((t) => {
      if (t.recurringId) return; // skip those auto-generated from recurring
      const sign = t.type === 'in' ? '+' : '−';
      const summary = `${sign}฿${Math.abs(t.amount).toLocaleString('en-US')} · ${t.label}`;
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:tx-${t.id}@ledger`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${fmtDate(t.date)}`);
      lines.push(`DTEND;VALUE=DATE:${fmtDate(formatYMD(addDays(new Date(t.date), 1)))}`);
      lines.push(`SUMMARY:${escapeICS(summary)}`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function formatICSDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }
  function formatYMD(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function escapeICS(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function downloadICS(state) {
    const text = generateICS(state);
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ledger-รายรับรายจ่าย.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.LedgerCal = {
    connect, disconnect, isConnected, getAccessToken,
    ensureCalendar, pushEvent, updateEvent, deleteEvent, pullEvents,
    generateICS, downloadICS,
  };
})();
