// app.js — Ledger main controller. Vanilla JS · no build step.

(function () {
  // =========================================================================
  // State
  // =========================================================================
  let state = window.LedgerStore.load();
  let view = state.onboarded ? 'home' : 'empty';
  let selectedDay = null; // Date object for calendar view

  function persist() { window.LedgerStore.save(state); }

  function set(updater) {
    state = typeof updater === 'function' ? updater(state) : updater;
    persist();
    render();
  }

  // =========================================================================
  // Helpers
  // =========================================================================
  const CCY = () => state.settings.currency || '฿';
  const fmt = (n) => Math.abs(Math.round(Number(n) || 0)).toLocaleString('en-US');
  const fmtMoney = (n) => CCY() + fmt(n);
  const signedMoney = (n, type) => (type === 'in' ? '+' : '−') + fmtMoney(n);

  const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const TH_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const TH_DAYS_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

  const thaiYear = (d) => d.getFullYear() + 543;
  const todayYMD = () => formatYMD(new Date());
  function formatYMD(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseYMD(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function addMonths(d, n) {
    const r = new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), daysInMonth(d.getFullYear(), d.getMonth() + n)));
    return r;
  }

  const uid = () => Math.random().toString(36).slice(2, 10);

  // Month key "YYYY-MM" used for paidMonths
  function monthKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function isMonthPaid(d) {
    return (state.paidMonths || []).includes(monthKey(d));
  }
  function toggleMonthPaid(d) {
    const k = monthKey(d);
    const list = state.paidMonths || [];
    const next = list.includes(k) ? list.filter((x) => x !== k) : [...list, k];
    set({ ...state, paidMonths: next });
    toast(next.includes(k) ? `บันทึก ${TH_MONTHS_SHORT[d.getMonth()]} ${thaiYear(d)} · จ่ายแล้ว` : `ยกเลิกสถานะ ${TH_MONTHS_SHORT[d.getMonth()]}`, next.includes(k) ? 'pos' : '');
  }

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v);
    });
    if (children != null) {
      const list = Array.isArray(children) ? children : [children];
      list.forEach((c) => {
        if (c == null || c === false) return;
        if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(String(c)));
        else e.appendChild(c);
      });
    }
    return e;
  }

  // =========================================================================
  // Toast
  // =========================================================================
  function toast(msg, kind = '') {
    const root = document.getElementById('toastRoot');
    const t = el('div', { class: 'toast ' + kind }, msg);
    root.appendChild(t);
    setTimeout(() => t.style.opacity = '0', 2200);
    setTimeout(() => t.remove(), 2600);
  }

  // =========================================================================
  // Computations
  // =========================================================================
  function monthRange(d) {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start, end };
  }

  // Expand recurring + income into virtual occurrences within [from, to]
  function expandRecurring(from, to) {
    const out = [];
    const items = [];
    if (state.income) items.push({ ...state.income, type: 'in', _kind: 'income' });
    (state.recurring || []).forEach((r) => items.push({ ...r, type: r.type || 'out', _kind: 'recurring' }));

    items.forEach((r) => {
      let y = from.getFullYear(), m = from.getMonth();
      const endY = to.getFullYear(), endM = to.getMonth();
      while (y < endY || (y === endY && m <= endM)) {
        const dim = daysInMonth(y, m);
        const day = Math.min(r.day, dim);
        const d = new Date(y, m, day);
        if (d >= from && d <= to) {
          out.push({
            id: `${r._kind}-${r.id || 'income'}-${formatYMD(d)}`,
            date: formatYMD(d),
            label: r.label,
            amount: r.amount,
            type: r.type,
            category: r.category,
            recurringId: r._kind === 'recurring' ? r.id : null,
            _kind: r._kind,
            _projected: true,
          });
        }
        m++;
        if (m > 11) { m = 0; y++; }
      }
    });
    return out;
  }

  // Get effective events on a given month (recurring projection + actual tx). actual tx
  // overrides matching recurring if recurringId matches in same month.
  function eventsInRange(from, to) {
    const projected = expandRecurring(from, to);
    const actual = (state.transactions || []).filter((t) => {
      const d = parseYMD(t.date);
      return d >= from && d <= to;
    });
    // Remove projected recurring/income where actual tx with same recurringId in same month exists
    const overrideKeys = new Set();
    actual.forEach((t) => {
      if (t.recurringId) {
        const d = parseYMD(t.date);
        overrideKeys.add(`recurring-${t.recurringId}-${d.getFullYear()}-${d.getMonth()}`);
      }
      if (t.fromIncome) {
        const d = parseYMD(t.date);
        overrideKeys.add(`income-${d.getFullYear()}-${d.getMonth()}`);
      }
    });
    const projFiltered = projected.filter((p) => {
      const d = parseYMD(p.date);
      const key = p._kind === 'income' ? `income-${d.getFullYear()}-${d.getMonth()}` : `recurring-${p.recurringId}-${d.getFullYear()}-${d.getMonth()}`;
      return !overrideKeys.has(key);
    });
    return [...projFiltered, ...actual].sort((a, b) => a.date.localeCompare(b.date));
  }

  function monthTotals(d) {
    const { start, end } = monthRange(d);
    const evs = eventsInRange(start, end);
    let inSum = 0, outSum = 0;
    evs.forEach((e) => {
      if (e.type === 'in') inSum += Number(e.amount) || 0;
      else outSum += Number(e.amount) || 0;
    });
    return { inSum, outSum, net: inSum - outSum, events: evs };
  }

  // Current month balance (logged + projected for the rest of month if income/recurring set)
  function dashboardNumbers() {
    const today = new Date();
    const { start, end } = monthRange(today);
    const evs = eventsInRange(start, end);
    let inSoFar = 0, inProjected = 0, outSoFar = 0, outProjected = 0;
    evs.forEach((e) => {
      const isPast = e.date <= todayYMD();
      const amt = Number(e.amount) || 0;
      if (e.type === 'in') {
        if (isPast && !e._projected) inSoFar += amt;
        else inProjected += amt;
      } else {
        if (isPast && !e._projected) outSoFar += amt;
        else outProjected += amt;
      }
    });
    const monthlyIn = inSoFar + inProjected;
    const monthlyOut = outSoFar + outProjected;
    const remaining = monthlyIn - (outSoFar + outProjected);
    return { monthlyIn, monthlyOut, remaining, outSoFar, outProjected, net: monthlyIn - monthlyOut, today, evs };
  }

  function forecast12() {
    const today = new Date();
    let bal = Number(state.settings.startingBalance || 0);
    // Add net so-far this month to starting balance? We'll let "this month" be first slot in forecast.
    const months = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const { inSum, outSum } = monthTotals(d);
      bal = bal + inSum - outSum;
      months.push({
        date: d, inSum, outSum, net: inSum - outSum, balance: bal,
        isCurrent: i === 0,
      });
    }
    return months;
  }

  // =========================================================================
  // Nav
  // =========================================================================
  const TABS = [
    { k: 'home',     l: 'หน้าหลัก',  i: '◐', title: 'หน้าหลัก' },
    { k: 'calendar', l: 'ปฏิทิน',    i: '▢', title: 'ปฏิทินรายเดือน' },
    { k: 'forecast', l: 'คาดการณ์',  i: '▦', title: 'คาดการณ์ 12 เดือน' },
    { k: 'bills',    l: 'บิลประจำ',  i: '◊', title: 'บิลประจำ' },
    { k: 'settings', l: 'ตั้งค่า',    i: '⚙', title: 'ตั้งค่า' },
  ];

  function go(k) {
    view = k;
    if (k === 'calendar' && !selectedDay) selectedDay = new Date();
    render();
    window.scrollTo({ top: 0 });
  }

  function renderTabs() {
    const wrap = document.getElementById('tabbar');
    wrap.innerHTML = '';
    TABS.slice(0, 4).forEach((t) => {
      wrap.appendChild(el('button', { class: 'tab' + (view === t.k ? ' active' : ''), onclick: () => go(t.k) }, [
        el('div', { class: 'tab-i' }, t.i),
        el('div', { class: 'tab-l' }, t.l),
      ]));
    });
    wrap.appendChild(el('button', { class: 'tab' + (view === 'settings' ? ' active' : ''), onclick: () => go('settings') }, [
      el('div', { class: 'tab-i' }, '⚙'),
      el('div', { class: 'tab-l' }, 'ตั้งค่า'),
    ]));

    const side = document.getElementById('navSide');
    side.innerHTML = '';
    TABS.forEach((t) => {
      side.appendChild(el('button', { class: 'nav-item' + (view === t.k ? ' active' : ''), onclick: () => go(t.k) }, [
        el('span', { class: 'nav-i' }, t.i), el('span', null, t.l),
      ]));
    });

    const foot = document.getElementById('sidebarFoot');
    foot.innerHTML = '';
    foot.appendChild(el('div', null, 'Ledger v1.0'));
    foot.appendChild(el('div', null, 'ข้อมูลเก็บใน Browser นี้เท่านั้น'));
  }

  function renderTopbar() {
    const tabMeta = TABS.find((t) => t.k === view);
    document.getElementById('topTitle').textContent = view === 'empty' ? 'ยินดีต้อนรับ' : (tabMeta ? tabMeta.title : 'Ledger');
    const today = new Date();
    document.getElementById('topDate').textContent = `วัน${TH_DAYS_FULL[today.getDay()]}ที่ ${today.getDate()} ${TH_MONTHS_FULL[today.getMonth()]} ${thaiYear(today)}`;
  }

  // =========================================================================
  // Views
  // =========================================================================
  function viewEmpty() {
    const tpl = document.getElementById('tpl-empty');
    const node = tpl.content.cloneNode(true);
    node.querySelectorAll('.step-btn').forEach((b) => {
      const action = b.dataset.action;
      b.addEventListener('click', () => {
        if (action === 'setup-income') openIncomeModal();
        else if (action === 'setup-bill') openRecurringModal();
        else if (action === 'setup-google') {
          view = 'settings'; render();
        }
      });
    });
    const skip = el('button', { class: 'btn wide', style: { marginTop: '14px' }, onclick: () => { set({ ...state, onboarded: true }); view = 'home'; } }, 'ข้ามไปก่อน · เริ่มใช้ทันที');
    const c = el('div', null, [node, skip]);
    return c;
  }

  function viewHome() {
    const wrap = el('div', null);

    // If empty, show empty state
    if (!state.income && (!state.recurring || state.recurring.length === 0) && (!state.transactions || state.transactions.length === 0)) {
      return viewEmpty();
    }

    const n = dashboardNumbers();
    const today = new Date();
    const dim = daysInMonth(today.getFullYear(), today.getMonth());
    const daysLeft = dim - today.getDate();

    // Hero balance
    const monthlyIn = n.monthlyIn || 0;
    const pct = monthlyIn > 0 ? Math.max(0, Math.min(1, n.remaining / monthlyIn)) : 0;
    const ringSize = 88, ringThick = 7;
    const r = (ringSize - ringThick) / 2;
    const circ = 2 * Math.PI * r;
    const ring = el('div', { class: 'hero-ring' }, [
      el('div', { html: `<svg width="${ringSize}" height="${ringSize}"><circle cx="${ringSize/2}" cy="${ringSize/2}" r="${r}" stroke="#e5e5ea" stroke-width="${ringThick}" fill="none"/><circle cx="${ringSize/2}" cy="${ringSize/2}" r="${r}" stroke="#0a0a0a" stroke-width="${ringThick}" fill="none" stroke-dasharray="${circ*pct} ${circ}" stroke-linecap="round"/></svg>` }),
      el('div', { class: 'hero-ring-text' }, [
        el('div', { class: 'hero-ring-pct' }, Math.round(pct * 100) + '%'),
        el('div', { class: 'hero-ring-lbl' }, 'เหลือ'),
      ]),
    ]);
    const hero = el('div', { class: 'hero' }, [
      ring,
      el('div', { class: 'hero-body' }, [
        el('div', { class: 'hero-cap' }, 'คงเหลือเดือนนี้'),
        el('div', { class: 'hero-amt mono' }, fmtMoney(n.remaining)),
        el('div', { class: 'hero-meta' }, monthlyIn > 0
          ? `ใช้แล้ว ${fmtMoney(n.outSoFar)} จาก ${fmtMoney(monthlyIn)} · เหลือ ${daysLeft} วัน`
          : `ยังไม่ได้ตั้งรายรับ · เหลือ ${daysLeft} วันในเดือนนี้`),
      ]),
    ]);
    wrap.appendChild(hero);

    // KPI grid
    const kpi = el('div', { class: 'kpi-grid' }, [
      kpiCard('รายรับ', fmtMoney(monthlyIn), state.income ? dayLabel(state.income.day) : 'ตั้งค่า', '#1f7a3a'),
      kpiCard('รายจ่าย', fmtMoney(n.monthlyOut), 'รวมประจำ + ผันแปร', '#c8312b'),
      kpiCard('คงเหลือสิ้นเดือน', signedMoney(n.net, n.net >= 0 ? 'in' : 'out'), 'คาดการณ์', '#0a0a0a'),
    ]);
    wrap.appendChild(kpi);

    // Upcoming (next 14 days)
    const upcomingCard = el('div', { class: 'card' });
    upcomingCard.appendChild(el('div', { class: 'card-head' }, [
      el('div', { class: 'card-title' }, 'ใกล้ถึงกำหนด · 14 วัน'),
      el('button', { class: 'card-action', onclick: () => go('calendar') }, 'ดูปฏิทิน'),
    ]));
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14);
    const upcoming = eventsInRange(from, to).filter((e) => e.date >= todayYMD()).slice(0, 5);
    if (upcoming.length === 0) {
      upcomingCard.appendChild(el('div', { class: 'row' }, [el('div', { class: 'row-body sub', style: { fontSize: '13px' } }, 'ยังไม่มีรายการในช่วงนี้')]));
    } else {
      upcoming.forEach((e) => {
        const d = parseYMD(e.date);
        const daysAway = Math.round((d - today) / 86400000);
        const awayLbl = daysAway === 0 ? 'วันนี้' : daysAway === 1 ? 'พรุ่งนี้' : `อีก ${daysAway} วัน`;
        upcomingCard.appendChild(el('div', { class: 'row' }, [
          el('div', { class: 'row-icon' }, e.type === 'in' ? '↓' : '↑'),
          el('div', { class: 'row-body' }, [
            el('div', { class: 'row-title' }, e.label),
            el('div', { class: 'row-sub' }, `${TH_DAYS_FULL[d.getDay()]} · ${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]}`),
          ]),
          el('div', null, [
            el('div', { class: 'row-amt', style: { color: e.type === 'in' ? '#1f7a3a' : '#c8312b' } }, signedMoney(e.amount, e.type)),
            el('div', { class: 'row-amt-sub' }, awayLbl),
          ]),
        ]));
      });
    }
    wrap.appendChild(upcomingCard);

    // Recent activity (last 5 logged transactions)
    const recent = (state.transactions || []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    if (recent.length > 0) {
      const recentCard = el('div', { class: 'card' });
      recentCard.appendChild(el('div', { class: 'card-head' }, [el('div', { class: 'card-title' }, 'ล่าสุด')]));
      recent.forEach((t) => {
        const d = parseYMD(t.date);
        recentCard.appendChild(el('div', { class: 'row clickable', onclick: () => openTxModal(t) }, [
          el('div', { class: 'row-icon' }, t.type === 'in' ? '↓' : '◍'),
          el('div', { class: 'row-body' }, [
            el('div', { class: 'row-title' }, t.label),
            el('div', { class: 'row-sub' }, `${t.category || '—'} · ${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]}`),
          ]),
          el('div', { class: 'row-amt', style: { color: t.type === 'in' ? '#1f7a3a' : '#c8312b' } }, signedMoney(t.amount, t.type)),
        ]));
      });
      wrap.appendChild(recentCard);
    }

    return wrap;
  }

  function kpiCard(lbl, val, sub, color) {
    return el('div', { class: 'kpi' }, [
      el('div', { class: 'kpi-lbl' }, lbl),
      el('div', { class: 'kpi-val mono', style: { color: color || '#0a0a0a' } }, val),
      el('div', { class: 'kpi-sub' }, sub),
    ]);
  }

  function viewCalendar() {
    const wrap = el('div', null);
    const d = selectedDay || new Date();
    const y = d.getFullYear(), m = d.getMonth();
    const dim = daysInMonth(y, m);
    const firstDow = new Date(y, m, 1).getDay();

    const events = {};
    const { start, end } = monthRange(d);
    eventsInRange(start, end).forEach((e) => {
      const dd = parseYMD(e.date).getDate();
      (events[dd] ||= []).push(e);
    });

    // Header / nav
    const head = el('div', { class: 'cal-nav' }, [
      el('div', { class: 'cal-nav-title' }, `${TH_MONTHS_FULL[m]} ${thaiYear(d)}`),
      el('div', { style: { display: 'flex', gap: '6px' } }, [
        el('button', { class: 'icon-btn', onclick: () => { selectedDay = new Date(y, m - 1, 1); render(); } }, '‹'),
        el('button', { class: 'icon-btn', onclick: () => { selectedDay = new Date(); render(); } }, '◯'),
        el('button', { class: 'icon-btn', onclick: () => { selectedDay = new Date(y, m + 1, 1); render(); } }, '›'),
      ]),
    ]);
    wrap.appendChild(head);

    const card = el('div', { class: 'card card-pad' });
    const headRow = el('div', { class: 'cal-grid-head' }, TH_DAYS_SHORT.map((d) => el('div', null, d)));
    card.appendChild(headRow);
    const grid = el('div', { class: 'cal-grid' });
    for (let i = 0; i < firstDow; i++) grid.appendChild(el('div', { class: 'cal-cell' }));
    const todayYMDstr = todayYMD();
    const selYMD = selectedDay ? formatYMD(selectedDay) : null;
    for (let day = 1; day <= dim; day++) {
      const cellDate = new Date(y, m, day);
      const ymd = formatYMD(cellDate);
      const ev = events[day] || [];
      const hasIn = ev.some((e) => e.type === 'in');
      const hasOut = ev.some((e) => e.type === 'out');
      const isToday = ymd === todayYMDstr;
      const isSel = ymd === selYMD;
      const cell = el('button', {
        class: 'cal-cell' + (isToday ? ' today' : '') + (isSel && !isToday ? ' selected' : ''),
        onclick: () => { selectedDay = cellDate; render(); },
      }, [
        el('div', { class: 'cal-day' }, day),
        el('div', { class: 'cal-dots' }, [
          hasOut ? el('div', { class: 'cal-dot out' }) : null,
          hasIn ? el('div', { class: 'cal-dot in' }) : null,
        ].filter(Boolean)),
      ]);
      grid.appendChild(cell);
    }
    card.appendChild(grid);
    wrap.appendChild(card);

    // Day detail
    const sel = selectedDay || new Date();
    const selDay = sel.getDate();
    const selEvents = events[selDay] || [];
    const detail = el('div', { class: 'card' });
    detail.appendChild(el('div', { class: 'card-head' }, [
      el('div', { class: 'card-title' }, `วันที่ ${selDay} ${TH_MONTHS_SHORT[sel.getMonth()]} · ${TH_DAYS_FULL[sel.getDay()]}`),
      el('button', { class: 'card-action', onclick: () => openTxModal({ date: formatYMD(sel) }) }, '+ เพิ่ม'),
    ]));
    if (selEvents.length === 0) {
      detail.appendChild(el('div', { class: 'row' }, [el('div', { class: 'row-body sub', style: { fontSize: '13px' } }, 'ไม่มีรายการในวันนี้')]));
    } else {
      selEvents.forEach((e) => {
        const isProjected = !!e._projected;
        detail.appendChild(el('div', { class: 'row' + (isProjected ? '' : ' clickable'), onclick: isProjected ? null : () => openTxModal(e) }, [
          el('div', { class: 'row-icon' }, e.type === 'in' ? '↓' : '↑'),
          el('div', { class: 'row-body' }, [
            el('div', { class: 'row-title' }, e.label),
            el('div', { class: 'row-sub' }, (e.category || '—') + (isProjected ? ' · คาดการณ์' : '')),
          ]),
          el('div', { class: 'row-amt', style: { color: e.type === 'in' ? '#1f7a3a' : '#c8312b' } }, signedMoney(e.amount, e.type)),
        ]));
      });
    }
    wrap.appendChild(detail);

    return wrap;
  }

  function viewForecast() {
    const wrap = el('div', null);
    const months = forecast12();
    if (months.every((m) => m.inSum === 0 && m.outSum === 0)) {
      const empty = el('div', { class: 'card card-pad' }, [
        el('h3', { style: { margin: '0 0 8px' } }, 'ยังไม่มีข้อมูลให้คาดการณ์'),
        el('p', { class: 'sub', style: { margin: 0, fontSize: '14px' } }, 'ตั้งรายรับและบิลประจำในตั้งค่า แล้วจะเห็นกราฟ 12 เดือนข้างหน้าทันที'),
        el('button', { class: 'btn primary wide lg', style: { marginTop: '14px' }, onclick: () => go('settings') }, 'ไปที่ตั้งค่า'),
      ]);
      wrap.appendChild(empty);
      return wrap;
    }

    const last = months[months.length - 1];
    const startBal = Number(state.settings.startingBalance || 0);
    const delta = last.balance - startBal;
    const maxBal = Math.max(...months.map((m) => m.balance), 0);

    const headCard = el('div', { class: 'card card-pad' });
    headCard.appendChild(el('div', { class: 'fc-headline' }, [
      el('div', null, [
        el('div', { class: 'fc-headline-lbl' }, `ยอดสะสมคาด · ${TH_MONTHS_SHORT[last.date.getMonth()]} ${thaiYear(last.date)}`),
        el('div', { class: 'fc-headline-amt mono' }, fmtMoney(last.balance)),
      ]),
      el('div', { class: 'fc-delta mono', style: { color: delta >= 0 ? '#1f7a3a' : '#c8312b' } }, (delta >= 0 ? '+' : '−') + fmtMoney(delta)),
    ]));

    // Bars
    const bars = el('div', { class: 'fc-bars' });
    months.forEach((mm) => {
      const safeMax = Math.max(maxBal, 1);
      const h = Math.max(2, (Math.max(mm.balance, 0) / safeMax) * 100);
      const col = el('div', { class: 'fc-bar-col' + (mm.isCurrent ? ' current' : '') });
      col.appendChild(el('div', { class: 'fc-bar' + (mm.isCurrent ? ' current' : ''), style: { height: h + '%' } }));
      col.appendChild(el('div', { class: 'fc-bar-lbl' }, TH_MONTHS_SHORT[mm.date.getMonth()]));
      bars.appendChild(col);
    });
    headCard.appendChild(bars);
    wrap.appendChild(headCard);

    // Table
    const table = el('div', { class: 'card' });
    table.appendChild(el('div', { class: 'card-head' }, [el('div', { class: 'card-title' }, 'รายเดือน')]));
    months.forEach((mm) => {
      const paid = isMonthPaid(mm.date);
      const row = el('div', { class: 'fc-row' + (paid ? ' paid' : '') }, [
        el('div', null, [
          el('div', { class: 'fc-month' }, TH_MONTHS_SHORT[mm.date.getMonth()]),
          el('div', { class: 'fc-month-sub' }, thaiYear(mm.date)),
        ]),
        el('div', null, [
          el('div', null, [
            el('span', { class: 'fc-flow pos' }, `+${fmt(mm.inSum/1000)}k`),
            el('span', null, ' '),
            el('span', { class: 'fc-flow neg' }, ` −${fmt(mm.outSum/1000)}k`),
          ]),
          paid
            ? el('span', { class: 'pay-status paid' }, '✓ จ่ายแล้ว')
            : null,
        ]),
        el('div', { class: 'fc-cell-right' }, [
          el('div', { class: 'fc-bal mono' }, fmtMoney(mm.balance)),
          paid
            ? el('button', { class: 'pay-btn paid', onclick: () => toggleMonthPaid(mm.date) }, 'ยกเลิก')
            : el('button', { class: 'pay-btn', onclick: () => toggleMonthPaid(mm.date) }, 'จ่ายแล้ว'),
        ]),
      ]);
      table.appendChild(row);
    });
    wrap.appendChild(table);

    return wrap;
  }

  function viewBills() {
    const wrap = el('div', null);
    const items = state.recurring || [];
    const fixedTotal = items.filter((r) => (r.type || 'out') === 'out').reduce((s, r) => s + Number(r.amount || 0), 0);
    const income = state.income;

    // Summary
    if (income || items.length) {
      const sum = el('div', { class: 'card' });
      sum.appendChild(el('div', { class: 'rc-summary' }, [
        el('div', null, [
          el('div', { class: 'kpi-lbl' }, 'รายจ่ายประจำ/เดือน'),
          el('div', { class: 'rc-summary-num mono' }, fmtMoney(fixedTotal)),
          el('div', { class: 'kpi-sub' }, income ? `${Math.round(fixedTotal / income.amount * 100)}% ของรายรับ` : 'ยังไม่ตั้งรายรับ'),
        ]),
      ]));
      wrap.appendChild(sum);
    }

    // Income card
    if (income) {
      const inc = el('div', { class: 'card' });
      inc.appendChild(el('div', { class: 'card-head' }, [
        el('div', { class: 'card-title' }, 'รายรับประจำ'),
        el('button', { class: 'card-action', onclick: () => openIncomeModal() }, 'แก้ไข'),
      ]));
      inc.appendChild(el('div', { class: 'row clickable', onclick: () => openIncomeModal() }, [
        el('div', { class: 'row-icon' }, '↓'),
        el('div', { class: 'row-body' }, [
          el('div', { class: 'row-title' }, income.label),
          el('div', { class: 'row-sub' }, `ทุก${dayLabel(income.day)} · ${income.account || ''}`),
        ]),
        el('div', { class: 'row-amt pos' }, '+' + fmtMoney(income.amount)),
      ]));
      wrap.appendChild(inc);
    } else {
      const card = el('div', { class: 'card' });
      card.appendChild(el('div', { class: 'row clickable', onclick: () => openIncomeModal() }, [
        el('div', { class: 'row-icon' }, '+'),
        el('div', { class: 'row-body' }, [
          el('div', { class: 'row-title accent', style: { color: '#0a84ff' } }, 'ตั้งรายรับประจำเดือน'),
          el('div', { class: 'row-sub' }, 'เงินเดือนหรือรายได้ประจำอื่น ๆ'),
        ]),
      ]));
      wrap.appendChild(card);
    }

    // Recurring list
    const rec = el('div', { class: 'card' });
    rec.appendChild(el('div', { class: 'card-head' }, [
      el('div', { class: 'card-title' }, `บิลประจำ · ${items.length} รายการ`),
      el('button', { class: 'card-action', onclick: () => openRecurringModal() }, '+ เพิ่ม'),
    ]));
    if (items.length === 0) {
      rec.appendChild(el('div', { class: 'row' }, [el('div', { class: 'row-body sub', style: { fontSize: '13px' } }, 'ยังไม่มีบิลประจำ · กด “เพิ่ม” เพื่อตั้งค่าตัวแรก')]));
    } else {
      items.slice().sort((a, b) => a.day - b.day).forEach((r) => {
        rec.appendChild(el('div', { class: 'row clickable', onclick: () => openRecurringModal(r) }, [
          el('div', { class: 'row-icon' }, r.icon || (r.type === 'in' ? '↓' : '◊')),
          el('div', { class: 'row-body' }, [
            el('div', { class: 'row-title' }, r.label),
            el('div', { class: 'row-sub' }, `ทุก${dayLabel(r.day)} · ${r.category || '—'}`),
          ]),
          el('div', { class: 'row-amt', style: { color: r.type === 'in' ? '#1f7a3a' : '#c8312b' } }, signedMoney(r.amount, r.type || 'out')),
        ]));
      });
    }
    wrap.appendChild(rec);

    return wrap;
  }

  function viewSettings() {
    const wrap = el('div', null);

    // Income
    const inc = el('div', null, [
      el('div', { class: 'set-grp-lbl' }, 'รายรับ'),
      el('div', { class: 'card' }, [
        el('div', { class: 'row clickable', onclick: () => openIncomeModal() }, [
          el('div', { class: 'row-body' }, [
            el('div', { class: 'row-title' }, state.income ? state.income.label : 'ยังไม่ได้ตั้ง'),
            el('div', { class: 'row-sub' }, state.income ? `${fmtMoney(state.income.amount)} · ทุก${dayLabel(state.income.day)}` : 'กดเพื่อเพิ่ม'),
          ]),
          el('div', { class: 'row-chev' }, '›'),
        ]),
      ]),
    ]);
    wrap.appendChild(inc);

    // Starting balance
    wrap.appendChild(el('div', { class: 'set-grp-lbl' }, 'ยอดตั้งต้น'));
    const balCard = el('div', { class: 'card' });
    balCard.appendChild(el('div', { class: 'row' }, [
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title' }, 'ยอดเริ่มต้นในบัญชี'),
        el('div', { class: 'row-sub' }, 'ใช้เป็นฐานในการคำนวณ Forecast'),
      ]),
      el('input', {
        type: 'number', value: state.settings.startingBalance || 0,
        style: { width: '120px', textAlign: 'right', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'IBM Plex Mono, monospace', fontSize: '15px' },
        oninput: (e) => set({ ...state, settings: { ...state.settings, startingBalance: Number(e.target.value) || 0 } }),
      }),
    ]));
    wrap.appendChild(balCard);

    // Notifications
    wrap.appendChild(el('div', { class: 'set-grp-lbl' }, 'การแจ้งเตือน'));
    const notifCard = el('div', { class: 'card' });
    [
      { l: 'แจ้งล่วงหน้าก่อนถึงกำหนด', s: `${state.settings.notifyDaysBefore} วัน`, kind: 'days' },
      { l: 'แจ้งทุกสิ้นเดือน', s: 'สรุปยอดและคาดสะสม', kind: 'eom', on: state.settings.notifyEndOfMonth },
    ].forEach((row, i) => {
      const r = el('div', { class: 'row' }, [
        el('div', { class: 'row-body' }, [
          el('div', { class: 'row-title' }, row.l),
          el('div', { class: 'row-sub' }, row.s),
        ]),
      ]);
      if (row.kind === 'days') {
        const sel = el('select', {
          style: { border: 'none', background: 'transparent', fontSize: '15px', color: '#0a84ff' },
          onchange: (e) => set({ ...state, settings: { ...state.settings, notifyDaysBefore: Number(e.target.value) } }),
        });
        [1, 3, 7].forEach((n) => {
          const o = el('option', { value: n }, `${n} วัน`);
          if (n === state.settings.notifyDaysBefore) o.selected = true;
          sel.appendChild(o);
        });
        r.appendChild(sel);
      } else if (row.kind === 'eom') {
        const t = el('button', { class: 'toggle' + (row.on ? ' on' : ''), onclick: (e) => {
          e.currentTarget.classList.toggle('on');
          set({ ...state, settings: { ...state.settings, notifyEndOfMonth: !state.settings.notifyEndOfMonth } });
        }});
        r.appendChild(t);
      }
      notifCard.appendChild(r);
    });
    wrap.appendChild(notifCard);
    wrap.appendChild(el('div', { class: 'section-hint', style: { marginTop: '6px' } }, 'การแจ้งเตือนจริงต้องใช้ปฏิทินที่เชื่อมไว้ — กดเปิดปฏิทินด้านล่าง'));

    // Google Calendar
    wrap.appendChild(el('div', { class: 'set-grp-lbl' }, 'เชื่อมต่อปฏิทิน'));
    const gcCard = el('div', { class: 'card' });

    const status = state.settings.googleConnected
      ? el('span', { class: 'pill pos' }, '● เชื่อมต่อแล้ว')
      : el('span', { class: 'pill' }, '○ ยังไม่ได้เชื่อม');

    gcCard.appendChild(el('div', { class: 'row' }, [
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title' }, 'Google Calendar'),
        el('div', { class: 'row-sub' }, [status, ' ', state.settings.googleConnected ? `· ปฏิทิน “${state.settings.googleCalendarName}”` : '· ซิงค์ 2 ทิศทาง']),
      ]),
    ]));

    gcCard.appendChild(el('div', { class: 'row' }, [
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title' }, 'OAuth Client ID'),
        el('div', { class: 'row-sub' }, 'จาก Google Cloud Console (อ่านวิธีใน README)'),
      ]),
    ]));
    const idInput = el('input', {
      type: 'text', placeholder: 'xxxxxxxxxx.apps.googleusercontent.com',
      value: state.settings.googleClientId || '',
      style: { width: '100%', padding: '10px 16px', border: 'none', borderTop: '1px solid rgba(60,60,67,0.12)', background: 'transparent', fontSize: '13px', fontFamily: 'IBM Plex Mono, monospace', outline: 'none' },
      oninput: (e) => { state.settings.googleClientId = e.target.value; persist(); },
    });
    gcCard.appendChild(idInput);

    const btnsRow = el('div', { style: { display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid rgba(60,60,67,0.12)' } }, [
      state.settings.googleConnected
        ? el('button', { class: 'btn danger', onclick: async () => { window.LedgerCal.disconnect(); set({ ...state, settings: { ...state.settings, googleConnected: false, googleCalendarId: '' } }); toast('ยกเลิกการเชื่อมต่อแล้ว'); } }, 'ยกเลิกการเชื่อม')
        : el('button', { class: 'btn primary', onclick: () => connectGoogle() }, 'เชื่อมต่อ Google'),
      state.settings.googleConnected
        ? el('button', { class: 'btn', onclick: () => syncAllToGoogle() }, 'ดันบิลทั้งหมดขึ้นปฏิทิน')
        : null,
    ].filter(Boolean));
    gcCard.appendChild(btnsRow);
    wrap.appendChild(gcCard);

    // .ics fallback
    wrap.appendChild(el('div', { class: 'set-grp-lbl' }, 'ส่งออกปฏิทินแบบไฟล์ (.ics)'));
    const icsCard = el('div', { class: 'card' });
    icsCard.appendChild(el('div', { class: 'row clickable', onclick: () => {
      try {
        window.LedgerCal.downloadICS(state);
        toast('ดาวน์โหลดไฟล์ .ics แล้ว · เปิดด้วยปฏิทินไอโฟนเพื่อนำเข้า');
      } catch (e) { toast('ไม่สามารถสร้างไฟล์ได้: ' + e.message, 'neg'); }
    }}, [
      el('div', { class: 'row-icon' }, '⬇'),
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title accent', style: { color: '#0a84ff' } }, 'ดาวน์โหลด .ics'),
        el('div', { class: 'row-sub' }, 'เปิดด้วยปฏิทิน เพื่อนำเข้าครั้งเดียว · ไม่ต้องตั้ง OAuth'),
      ]),
    ]));
    wrap.appendChild(icsCard);

    // Data management
    wrap.appendChild(el('div', { class: 'set-grp-lbl' }, 'ข้อมูล'));
    const dataCard = el('div', { class: 'card' });
    dataCard.appendChild(el('div', { class: 'row clickable', onclick: () => exportData() }, [
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title' }, 'สำรองข้อมูล (Export JSON)'),
        el('div', { class: 'row-sub' }, 'บันทึกไฟล์เก็บไว้เผื่อล้าง browser'),
      ]),
      el('div', { class: 'row-chev' }, '›'),
    ]));
    dataCard.appendChild(el('div', { class: 'row clickable', onclick: () => importData() }, [
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title' }, 'กู้คืนข้อมูล (Import JSON)'),
        el('div', { class: 'row-sub' }, 'โหลดไฟล์ที่เคย export ไว้'),
      ]),
      el('div', { class: 'row-chev' }, '›'),
    ]));
    dataCard.appendChild(el('div', { class: 'row clickable', onclick: () => {
      if (confirm('ลบข้อมูลทั้งหมด? การกระทำนี้ย้อนกลับไม่ได้')) {
        window.LedgerStore.reset();
        state = window.LedgerStore.load();
        view = 'empty';
        render();
        toast('ล้างข้อมูลแล้ว', 'neg');
      }
    }}, [
      el('div', { class: 'row-body' }, [
        el('div', { class: 'row-title danger', style: { color: '#c8312b' } }, 'ลบข้อมูลทั้งหมด'),
        el('div', { class: 'row-sub' }, 'รีเซ็ตเป็นค่าเริ่มต้น'),
      ]),
    ]));
    wrap.appendChild(dataCard);

    wrap.appendChild(el('div', { class: 'section-hint', style: { padding: '16px 4px' } }, 'ข้อมูลของคุณเก็บใน Browser นี้เท่านั้น · ไม่มีการส่งไปที่ไหน · ลบ history หรือเปลี่ยน browser จะหายไป (สำรองไฟล์ JSON ไว้กันลืม)'));

    return wrap;
  }

  // =========================================================================
  // Modals
  // =========================================================================
  function openModal(title, bodyEl, opts = {}) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = '';
    const bg = el('div', { class: 'modal-bg', onclick: closeModal });
    const head = el('div', { class: 'modal-head' }, [
      el('button', { class: 'modal-head-btn', onclick: closeModal }, opts.cancelLabel || 'ยกเลิก'),
      el('div', { class: 'modal-head-title' }, title),
      opts.save ? el('button', { class: 'modal-head-btn primary', onclick: () => { opts.save(); } }, opts.saveLabel || 'บันทึก') : el('div', { style: { width: 30 } }),
    ]);
    const body = el('div', { class: 'modal-body' }, bodyEl);
    const modal = el('div', { class: 'modal' }, [head, body]);
    root.appendChild(bg);
    root.appendChild(modal);
    root.setAttribute('aria-hidden', 'false');
  }
  function closeModal() {
    const root = document.getElementById('modalRoot');
    root.setAttribute('aria-hidden', 'true');
    setTimeout(() => { root.innerHTML = ''; }, 250);
  }

  // ----- Income modal -----
  function openIncomeModal() {
    const cur = state.income || { label: 'เงินเดือน', amount: 0, day: 28, account: '' };
    const draft = { ...cur };

    const body = el('div', null, [
      el('div', { class: 'amount-display in mono' }, [
        el('span', { class: 'ccy' }, CCY()),
        el('input', { class: 'amount-input', type: 'number', value: draft.amount || '', placeholder: '0',
          oninput: (e) => { draft.amount = Number(e.target.value) || 0; } }),
      ]),
      el('div', { class: 'field-grp' }, [
        field('ชื่อรายรับ', el('input', { type: 'text', value: draft.label, oninput: (e) => draft.label = e.target.value, placeholder: 'เช่น เงินเดือน' })),
        field('วันที่เข้าทุกเดือน', dayPicker(draft.day, (v) => draft.day = v)),
        field('บัญชี', el('input', { type: 'text', value: draft.account || '', oninput: (e) => draft.account = e.target.value, placeholder: 'ไม่บังคับ · เช่น KBank' })),
      ]),
      state.income ? el('button', { class: 'btn danger wide lg', onclick: () => {
        if (confirm('ลบรายรับประจำ?')) { set({ ...state, income: null }); closeModal(); toast('ลบแล้ว'); }
      } }, 'ลบรายรับ') : null,
    ].filter(Boolean));

    openModal('รายรับประจำ', body, {
      save: () => {
        if (!draft.amount || draft.amount <= 0) return toast('ใส่จำนวนเงินก่อน', 'neg');
        if (!draft.day || draft.day < 1 || draft.day > 31) return toast('วันที่ไม่ถูกต้อง', 'neg');
        const next = { ...state, income: { ...draft, id: state.income?.id || 'income' }, onboarded: true };
        set(next);
        closeModal();
        toast('บันทึกแล้ว', 'pos');
      },
    });
  }

  // ----- Recurring modal -----
  function openRecurringModal(existing) {
    const isNew = !existing;
    const draft = existing ? { ...existing } : { id: uid(), label: '', amount: 0, day: 1, category: '', type: 'out', icon: '◊' };
    const ICONS = ['◊', '⌂', '⌬', '⌒', '☏', '⚡', '▶', '♪', '◍', '☕', '↗', '◇'];
    const CATS = ['ที่อยู่', 'ยานพาหนะ', 'สาธารณูปโภค', 'สมัครสมาชิก', 'ประกัน', 'การศึกษา', 'อื่น ๆ'];

    const body = el('div', null);
    // Type segmented
    const seg = el('div', { class: 'segmented' });
    ['out', 'in'].forEach((t) => {
      const lbl = t === 'out' ? 'รายจ่าย' : 'รายรับ';
      const b = el('button', { class: 'seg ' + (draft.type === t ? 'active ' + t : ''), onclick: () => {
        draft.type = t;
        seg.querySelectorAll('.seg').forEach((s, i) => {
          s.className = 'seg' + (i === (t === 'out' ? 0 : 1) ? ' active ' + t : '');
        });
        amtDisp.className = 'amount-display mono ' + t;
      }}, lbl);
      seg.appendChild(b);
    });
    body.appendChild(seg);

    const amtDisp = el('div', { class: 'amount-display mono ' + draft.type }, [
      el('span', { class: 'ccy' }, CCY()),
      el('input', { class: 'amount-input', type: 'number', value: draft.amount || '', placeholder: '0', oninput: (e) => draft.amount = Number(e.target.value) || 0 }),
    ]);
    body.appendChild(amtDisp);

    body.appendChild(el('div', { class: 'field-grp' }, [
      field('ชื่อบิล', el('input', { type: 'text', value: draft.label, oninput: (e) => draft.label = e.target.value, placeholder: 'เช่น ค่าบ้าน' })),
      field('วันที่ทุกเดือน', dayPicker(draft.day, (v) => draft.day = v)),
      field('หมวด', (function () {
        const sel = el('select', { onchange: (e) => draft.category = e.target.value });
        sel.appendChild(el('option', { value: '' }, '— เลือก —'));
        CATS.forEach((c) => {
          const o = el('option', { value: c }, c);
          if (c === draft.category) o.selected = true;
          sel.appendChild(o);
        });
        return sel;
      })()),
    ]));

    // Icon picker
    body.appendChild(el('div', { class: 'set-grp-lbl', style: { padding: '0 4px' } }, 'ไอคอน'));
    const iconRow = el('div', { class: 'chip-row' });
    ICONS.forEach((ic) => {
      const c = el('button', { class: 'chip' + (draft.icon === ic ? ' active' : ''), style: { fontSize: '18px' }, onclick: () => {
        draft.icon = ic;
        iconRow.querySelectorAll('.chip').forEach((x, i) => x.classList.toggle('active', ICONS[i] === ic));
      }}, ic);
      iconRow.appendChild(c);
    });
    body.appendChild(iconRow);

    if (!isNew) {
      body.appendChild(el('button', { class: 'btn danger wide lg', onclick: () => {
        if (confirm(`ลบบิล "${draft.label}"?`)) {
          set({ ...state, recurring: state.recurring.filter((r) => r.id !== draft.id) });
          closeModal();
          toast('ลบบิลแล้ว');
        }
      }}, 'ลบบิลนี้'));
    }

    openModal(isNew ? 'เพิ่มบิลประจำ' : 'แก้ไขบิล', body, {
      save: () => {
        if (!draft.label) return toast('ใส่ชื่อบิลก่อน', 'neg');
        if (!draft.amount || draft.amount <= 0) return toast('ใส่จำนวนเงินก่อน', 'neg');
        const list = state.recurring || [];
        const next = isNew ? [...list, draft] : list.map((r) => r.id === draft.id ? draft : r);
        set({ ...state, recurring: next, onboarded: true });
        closeModal();
        toast('บันทึกแล้ว', 'pos');
      },
    });
  }

  // ----- Transaction modal -----
  function openTxModal(existing) {
    const isNew = !existing || !existing.id || existing._projected;
    const draft = existing && !existing._projected ? { ...existing } : {
      id: uid(), label: '', amount: 0,
      date: (existing && existing.date) || todayYMD(),
      type: 'out', category: '', account: '', notes: '',
    };
    if (existing && existing._projected) draft.label = existing.label;

    const CATS = ['อาหาร', 'คาเฟ่', 'เดินทาง', 'ช้อปปิ้ง', 'บันเทิง', 'สุขภาพ', 'ของใช้ในบ้าน', 'อื่น ๆ'];

    const body = el('div', null);

    const seg = el('div', { class: 'segmented' });
    ['out', 'in'].forEach((t) => {
      const lbl = t === 'out' ? 'รายจ่าย' : 'รายรับ';
      const b = el('button', { class: 'seg ' + (draft.type === t ? 'active ' + t : ''), onclick: () => {
        draft.type = t;
        seg.querySelectorAll('.seg').forEach((s, i) => s.className = 'seg' + (i === (t === 'out' ? 0 : 1) ? ' active ' + t : ''));
        amtDisp.className = 'amount-display mono ' + t;
      }}, lbl);
      seg.appendChild(b);
    });
    body.appendChild(seg);

    const amtDisp = el('div', { class: 'amount-display mono ' + draft.type }, [
      el('span', { class: 'ccy' }, CCY()),
      el('input', { class: 'amount-input', type: 'number', value: draft.amount || '', placeholder: '0', oninput: (e) => draft.amount = Number(e.target.value) || 0 }),
    ]);
    body.appendChild(amtDisp);

    body.appendChild(el('div', { class: 'field-grp' }, [
      field('รายละเอียด', el('input', { type: 'text', value: draft.label, oninput: (e) => draft.label = e.target.value, placeholder: 'เช่น Starbucks' })),
      field('วันที่', el('input', { type: 'date', value: draft.date, oninput: (e) => draft.date = e.target.value })),
      field('บัญชี', el('input', { type: 'text', value: draft.account || '', oninput: (e) => draft.account = e.target.value, placeholder: 'ไม่บังคับ' })),
    ]));

    body.appendChild(el('div', { class: 'set-grp-lbl', style: { padding: '0 4px' } }, 'หมวด'));
    const chipRow = el('div', { class: 'chip-row' });
    CATS.forEach((c) => {
      const b = el('button', { class: 'chip' + (draft.category === c ? ' active' : ''), onclick: () => {
        draft.category = c;
        chipRow.querySelectorAll('.chip').forEach((x, i) => x.classList.toggle('active', CATS[i] === c));
      }}, c);
      chipRow.appendChild(b);
    });
    body.appendChild(chipRow);

    if (!isNew) {
      body.appendChild(el('button', { class: 'btn danger wide lg', onclick: () => {
        if (confirm('ลบรายการนี้?')) {
          // also delete from google calendar if linked
          if (draft.calendarEventId && state.settings.googleConnected) {
            window.LedgerCal.deleteEvent(state.settings.googleCalendarId, draft.calendarEventId).catch(() => {});
          }
          set({ ...state, transactions: (state.transactions || []).filter((t) => t.id !== draft.id) });
          closeModal();
          toast('ลบแล้ว');
        }
      }}, 'ลบรายการ'));
    }

    openModal(isNew ? 'เพิ่มรายการ' : 'แก้ไขรายการ', body, {
      save: async () => {
        if (!draft.label) return toast('ใส่รายละเอียดก่อน', 'neg');
        if (!draft.amount || draft.amount <= 0) return toast('ใส่จำนวนเงินก่อน', 'neg');
        // push to google calendar?
        let evId = draft.calendarEventId;
        if (state.settings.googleConnected && state.settings.googleCalendarId) {
          try {
            if (evId) evId = await window.LedgerCal.updateEvent(state.settings.googleCalendarId, evId, draft);
            else evId = await window.LedgerCal.pushEvent(state.settings.googleCalendarId, { ...draft, notify: state.settings.notifyEnabled });
            draft.calendarEventId = evId;
          } catch (e) { console.warn('Calendar push failed', e); toast('เพิ่มในแอป แต่ส่งปฏิทินไม่สำเร็จ', 'neg'); }
        }
        const list = state.transactions || [];
        const next = isNew ? [...list, draft] : list.map((t) => t.id === draft.id ? draft : t);
        set({ ...state, transactions: next, onboarded: true });
        closeModal();
        toast('บันทึกแล้ว', 'pos');
      },
    });
  }

  // ----- helpers for modals -----
  function field(label, control) {
    return el('div', { class: 'field' }, [
      el('div', { class: 'field-label' }, label),
      control,
    ]);
  }
  function dayPicker(value, onChange) {
    const sel = el('select', { onchange: (e) => onChange(Number(e.target.value)) });
    // Special "end of month" option (stored as 31, auto-clamps in expandRecurring)
    const eom = el('option', { value: 31 }, 'สิ้นเดือน (ปรับอัตโนมัติ)');
    if (value === 31) eom.selected = true;
    sel.appendChild(eom);
    // Divider
    const div = el('option', { value: '', disabled: true }, '──────────');
    sel.appendChild(div);
    // Regular days 1..30
    for (let d = 1; d <= 30; d++) {
      const o = el('option', { value: d }, `วันที่ ${d}`);
      if (d === value) o.selected = true;
      sel.appendChild(o);
    }
    return sel;
  }

  // Human label for a day-of-month value (used in summaries)
  function dayLabel(d) {
    return d === 31 ? 'สิ้นเดือน' : `วันที่ ${d}`;
  }

  // =========================================================================
  // Google + ICS glue
  // =========================================================================
  async function connectGoogle() {
    const id = (state.settings.googleClientId || '').trim();
    if (!id) return toast('ใส่ Client ID ก่อน · อ่านวิธีใน README', 'neg');
    try {
      toast('กำลังเปิดหน้าต่างยืนยัน...');
      await window.LedgerCal.connect(id);
      const calId = await window.LedgerCal.ensureCalendar(state.settings.googleCalendarName);
      state.settings.googleConnected = true;
      state.settings.googleCalendarId = calId;
      persist();
      render();
      toast('เชื่อมต่อสำเร็จ!', 'pos');
    } catch (e) {
      console.error(e);
      toast('เชื่อมต่อล้มเหลว: ' + (e.message || e), 'neg');
    }
  }

  async function syncAllToGoogle() {
    if (!state.settings.googleConnected) return toast('เชื่อม Google ก่อน', 'neg');
    const calId = state.settings.googleCalendarId;
    let count = 0, fail = 0;
    // Push transactions that aren't yet linked
    for (const t of state.transactions || []) {
      if (t.calendarEventId) continue;
      try {
        const id = await window.LedgerCal.pushEvent(calId, { ...t, notify: state.settings.notifyEnabled });
        t.calendarEventId = id; count++;
      } catch { fail++; }
    }
    persist(); render();
    toast(`ดันสำเร็จ ${count} · ล้มเหลว ${fail}`, fail ? 'neg' : 'pos');
  }

  // =========================================================================
  // Data import/export
  // =========================================================================
  function exportData() {
    const text = window.LedgerStore.exportJson(state);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-backup-${todayYMD()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('ดาวน์โหลดไฟล์สำรองแล้ว', 'pos');
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json';
    input.onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const text = await f.text();
        const parsed = window.LedgerStore.importJson(text);
        state = parsed; persist(); view = 'home'; render();
        toast('นำเข้าข้อมูลแล้ว', 'pos');
      } catch (err) { toast('นำเข้าล้มเหลว: ' + err.message, 'neg'); }
    };
    input.click();
  }

  // =========================================================================
  // Render dispatch
  // =========================================================================
  function render() {
    renderTopbar();
    renderTabs();
    const v = document.getElementById('view');
    v.innerHTML = '';
    let body;
    switch (view) {
      case 'empty':    body = viewEmpty();    break;
      case 'calendar': body = viewCalendar(); break;
      case 'forecast': body = viewForecast(); break;
      case 'bills':    body = viewBills();    break;
      case 'settings': body = viewSettings(); break;
      default:         body = viewHome();
    }
    v.appendChild(body);
  }

  // =========================================================================
  // Init
  // =========================================================================
  document.getElementById('fab').addEventListener('click', () => openTxModal());
  document.getElementById('quickAddBtn').addEventListener('click', () => openTxModal());
  render();
})();
