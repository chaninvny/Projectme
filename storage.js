// storage.js — localStorage wrapper + default state shape

(function () {
  const KEY = 'ledger.v1.state';
  const VERSION = 1;

  const defaultState = () => ({
    version: VERSION,
    onboarded: false,
    settings: {
      currency: '฿',
      locale: 'th-TH',
      startingBalance: 0,
      notifyDaysBefore: 1,
      notifyEndOfMonth: true,
      notifyEnabled: false,
      // Google
      googleClientId: '',
      googleConnected: false,
      googleCalendarId: '',   // when connected, we create/use a calendar named 'รายรับ-รายจ่าย'
      googleCalendarName: 'รายรับ-รายจ่าย',
    },
    income: null,
    // income: { id, label, amount, day, account }
    recurring: [],
    // { id, label, amount, day, category, icon, type: 'out'|'in', startDate?, endDate?, calendarSeriesId?, notify }
    transactions: [],
    // { id, date(YYYY-MM-DD), label, amount(positive), type: 'in'|'out', category, account, notes, recurringId?, calendarEventId? }
    paidMonths: [],
    // ['YYYY-MM', ...] — months the user marked as fully paid
  });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      // simple migration shim
      return Object.assign(defaultState(), parsed, {
        settings: Object.assign(defaultState().settings, parsed.settings || {}),
      });
    } catch (e) {
      console.warn('Failed to load state, resetting', e);
      return defaultState();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state', e);
    }
  }

  function reset() {
    localStorage.removeItem(KEY);
  }

  function exportJson(state) {
    return JSON.stringify(state, null, 2);
  }

  function importJson(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('ไฟล์ไม่ถูกต้อง');
    return Object.assign(defaultState(), parsed, {
      settings: Object.assign(defaultState().settings, parsed.settings || {}),
    });
  }

  window.LedgerStore = { load, save, reset, exportJson, importJson, defaultState };
})();
