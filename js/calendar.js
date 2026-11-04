// v113: Kalender - API-hjaelper (samme moenster som i email.js)
async function apiCall(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (sessionStorage.getItem('token') || ''), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Fejl');
  return data;
}

// v113: Portal-kalender - ugevisning med hel-dags bjaelker (ingen tidspunkter).
// Ledelsen (is_admin) kan oprette/redigere/traekke; alle andre har laesetilstand.
window.calendarPage = {
  weekStart: null,        // Date - mandag i vist uge
  events: [],
  users: [],
  availMode: 'day',
  selectedDate: null,     // valgt dag (til "Ikke bemandet")
  editingEvent: null,     // event i info-dialog (til rediger/slet)
  COLORS: ['#34a853', '#1a73e8', '#fbbc04', '#8d6e63', '#f28b82', '#ff8f00', '#7b1fa2', '#00897b'],

  async init() {
    if (!this.weekStart) this.weekStart = this.mondayOf(new Date());
    this.selectedDate = this.isoDate(new Date());
    const cu = window.currentUser || {};
    this.isAdmin = !!cu.is_admin;
    // Toggle til dag/uge vises kun for Ledelsen (redigerings-brugere)
    if (this.isAdmin) document.getElementById('avail-toggle').style.display = 'flex';
    await this.loadUsers();
    try { await this.loadEvents(); } catch (e) { console.warn('calendar loadEvents fejlede:', e); }
    try { this.render(); } catch (e) { console.error('calendar render fejlede:', e); }
  },

  mondayOf(d) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7; // 0 = mandag
    x.setDate(x.getDate() - day);
    x.setHours(0, 0, 0, 0);
    return x;
  },

  isoDate(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  },

  addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },

  async loadUsers() {
    try {
      const res = await fetch('/api/users', { headers: { 'Authorization': 'Bearer ' + (sessionStorage.getItem('token') || '') } });
      if (res.ok) this.users = await res.json();
    } catch (e) { /* fortsaet uden brugerliste */ }
  },

  async loadEvents() {
    const from = this.isoDate(this.addDays(this.weekStart, -7));
    const to = this.isoDate(this.addDays(this.weekStart, 14));
    const rows = await apiCall(`/api/calendar?from=${from}&to=${to}`);
    this.events = Array.isArray(rows) ? rows : [];
  },

  async refresh() { await this.loadEvents(); this.render(); },

  prevWeek() { this.weekStart = this.addDays(this.weekStart, -7); this.refresh(); },
  nextWeek() { this.weekStart = this.addDays(this.weekStart, 7); this.refresh(); },
  goToday() { this.weekStart = this.mondayOf(new Date()); this.selectedDate = this.isoDate(new Date()); this.refresh(); },

  // ===== RENDER =====
  render() {
    this.renderHeader();
    this.renderGrid();
    this.renderAvailability();
  },

  renderHeader() {
    const end = this.addDays(this.weekStart, 6);
    const fmt = (d) => d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
    document.getElementById('cal-week-label').textContent =
      `Uge ${this.getWeekNumber(this.weekStart)} - ${fmt(this.weekStart)} til ${fmt(end)}`;
  },

  getWeekNumber(d) {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return Math.ceil(((x - yearStart) / 86400000 + 1) / 7);
  },

  renderGrid() {
    const header = document.getElementById('cal-grid-header');
    const grid = document.getElementById('cal-grid');
    const todayIso = this.isoDate(new Date());
    const names = ['MAN.', 'TIRS.', 'ONS.', 'TORS.', 'FRE.', 'LOR.', 'SON.'];
    header.innerHTML = '';
    grid.innerHTML = '';
    this._rows = {};        // v113: nulstil auto-placering ved hver render
    this._rowsDone = new Set();
    for (let i = 0; i < 7; i++) {
      const day = this.addDays(this.weekStart, i);
      const iso = this.isoDate(day);
      const isToday = iso === todayIso;
      header.innerHTML += `<div class="cal-day-head ${isToday ? 'today' : ''}">${names[i]}<span class="cal-day-num">${day.getDate()}</span></div>`;
      const col = document.createElement('div');
      col.className = 'cal-day-col' + (isToday ? ' today' : '');
      col.dataset.date = iso;
      if (this.isAdmin) {
        col.addEventListener('click', (e) => { if (e.target === col) this.openNewDialog(iso); });
        col.addEventListener('dragover', (e) => e.preventDefault());
        col.addEventListener('drop', (e) => this.onDrop(e, iso));
      } else {
        col.addEventListener('click', (e) => { if (e.target === col) { this.selectedDate = iso; this.renderAvailability(); } });
      }
      // Events der daekker denne dag
      const dayEvents = this.events.filter(ev => ev.start_date <= iso && ev.end_date >= iso);
      for (const ev of dayEvents) {
        col.appendChild(this.buildEventBar(ev, iso, this.rowFor(ev)));
      }
      grid.appendChild(col);
    }
  },

  // v113: auto-placering - find foerste ledige raekke (slot) som opgaven kan ligge i paa ALLE dens dage
  rowFor(ev) {
    if (!this._rows) this._rows = {}; // iso-date -> Set(rækkeer brugt)
    const evs = [...this.events].sort((a, b) => (a.slot || 0) - (b.slot || 0) || String(a.start_date).localeCompare(String(b.start_date)));
    for (const e of evs) {
      const key = e.id;
      if (this._rowsDone && this._rowsDone.has(key)) continue;
      if (!this._rowsDone) this._rowsDone = new Set();
      this._rowsDone.add(key);
      let row = e.slot || 0;
      const dayIso = [];
      for (let d = new Date(e.start_date + 'T12:00:00'); d <= new Date(e.end_date + 'T12:00:00'); d.setDate(d.getDate() + 1)) dayIso.push(this.isoDate(d));
      while (dayIso.some(iso => this._rows[iso] && this._rows[iso].has(row))) row++;
      dayIso.forEach(iso => { if (!this._rows[iso]) this._rows[iso] = new Set(); this._rows[iso].add(row); });
      if (e.id === ev.id) return row;
    }
    return ev.slot || 0;
  },

  buildEventBar(ev, iso, row) {
    // v113: bjaelker laegges i et vertikalt gitter (slot) - roed bjaelke (bemanding) UNDER farve-bjaelken
    const SLOT_H = 28;
    const wrap = document.createElement('div');
    wrap.className = 'cal-event-wrap';
    wrap.style.top = ((row != null ? row : (ev.slot || 0)) * SLOT_H + 2) + 'px';
    const bar = document.createElement('button');
    bar.className = 'cal-event' + (this.isAdmin ? ' draggable' : '');
    bar.style.background = ev.color || '#34a853';
    const label = (ev.order_number ? ev.order_number + ' - ' : '') + ev.title;
    bar.textContent = label;
    bar.title = label + (ev.employee_names ? '\n' + ev.employee_names : '');
    wrap.appendChild(bar);
    let emp = null;
    if (ev.employee_names) {
      emp = document.createElement('div');
      emp.className = 'cal-emp';
      emp.textContent = ev.employee_names;
      wrap.appendChild(emp);
    }
    const open = (e) => { e.stopPropagation(); this.showInfo(ev); };
    bar.addEventListener('click', open);
    if (emp) emp.addEventListener('click', open);
    if (this.isAdmin) {
      wrap.draggable = true;
      wrap.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(ev.id));
        e.dataTransfer.effectAllowed = 'move';
      });
    }
    return wrap;
  },

  // ===== IKKE BEMANDET =====
  setAvailMode(mode) {
    this.availMode = mode;
    document.getElementById('avail-btn-day').classList.toggle('active', mode === 'day');
    document.getElementById('avail-btn-week').classList.toggle('active', mode === 'week');
    this.renderAvailability();
  },

  // Navne i bemandings-fritekst matches paa fornavn (case-insensitive)
  staffedFirstNames(fromIso, toIso) {
    const names = new Set();
    for (const ev of this.events) {
      if (ev.start_date > toIso || ev.end_date < fromIso) continue;
      (ev.employee_names || '').split(',').forEach(n => {
        const f = n.trim().split(/\s+/)[0].toLowerCase();
        if (f) names.add(f);
      });
    }
    return names;
  },

  renderAvailability() {
    const sub = document.getElementById('avail-sub');
    const list = document.getElementById('avail-list');
    const fmt = (d) => d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
    let fromIso, toIso;
    if (this.availMode === 'day') {
      fromIso = toIso = this.selectedDate || this.isoDate(new Date());
      sub.textContent = 'Ledige ' + fmt(new Date(fromIso + 'T12:00:00'));
    } else {
      fromIso = this.isoDate(this.weekStart);
      toIso = this.isoDate(this.addDays(this.weekStart, 6));
      sub.textContent = 'Ledige i ugen (ikke sat paa nogen opgave)';
    }
    const staffed = this.staffedFirstNames(fromIso, toIso);
    const chips = [];
    for (const u of this.users) {
      const first = (u.name || '').trim().split(/\s+/)[0].toLowerCase();
      if (first && !staffed.has(first)) {
        chips.push(`<span class="avail-chip">${this.esc(u.name)}</span>`);
      }
    }
    list.innerHTML = chips.length ? chips.join('') : '<div class="avail-none">Alle er bemandet</div>';
  },

  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
};

// v113: (fortsaettelse af calendarPage - drag/drop + dialoger)
Object.assign(window.calendarPage, {
  // ===== DRAG & DROP (flyt opgave) =====
  async onDrop(e, newStartIso) {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('text/plain'));
    const ev = this.events.find(x => x.id === id);
    if (!ev) return;
    // v113: vertikal placering (slot) ud fra drop-y i dag-kolonnen
    const rect = e.currentTarget.getBoundingClientRect();
    const SLOT_H = 28;
    const slot = Math.max(0, Math.floor((e.clientY - rect.top) / SLOT_H));
    const oldStart = new Date(ev.start_date + 'T12:00:00');
    const newStart = new Date(newStartIso + 'T12:00:00');
    const delta = Math.round((newStart - oldStart) / 86400000);
    const body = { slot };
    if (delta) {
      body.start_date = newStartIso;
      body.end_date = this.isoDate(this.addDays(new Date(ev.end_date + 'T12:00:00'), delta));
    }
    try {
      await apiCall('/api/calendar/' + id, { method: 'PUT', body: JSON.stringify(body) });
      await this.refresh();
    } catch (err) {
      alert('Kunne ikke flytte opgaven: ' + (err.message || err));
    }
  },

  // ===== DIALOGS =====
  openOverlay(id) { document.getElementById(id).classList.add('open'); },
  closeOverlay(id) { document.getElementById(id).classList.remove('open'); },

  renderColorPicker(selected) {
    const saved = localStorage.getItem('calLastColor') || '#34a853';
    const sel = selected || saved;
    const box = document.getElementById('cal-colors');
    box.innerHTML = '';
    for (const c of this.COLORS) {
      const dot = document.createElement('div');
      dot.className = 'cal-color-dot' + (c === sel ? ' selected' : '');
      dot.style.background = c;
      dot.onclick = () => {
        box.querySelectorAll('.cal-color-dot').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
      };
      box.appendChild(dot);
    }
  },

  getSelectedColor() {
    const sel = document.querySelector('#cal-colors .cal-color-dot.selected');
    return sel ? sel.style.background : '#34a853';
  },

  openNewDialog(dateIso) {
    this.editingEvent = null;
    document.getElementById('cal-edit-title').textContent = 'Ny opgave';
    document.getElementById('cal-edit-id').value = '';
    document.getElementById('cal-edit-order').value = '';
    document.getElementById('cal-edit-desc').value = '';
    document.getElementById('cal-edit-staff').value = '';
    const start = dateIso || this.selectedDate || this.isoDate(new Date());
    document.getElementById('cal-edit-start').value = start;
    document.getElementById('cal-edit-repeat').value = 1;
    this.renderColorPicker(localStorage.getItem('calLastColor'));
    document.getElementById('cal-edit-delete').style.display = 'none';
    this.openOverlay('cal-edit-overlay');
  },

  editFromInfo() {
    const ev = this.editingEvent;
    if (!ev) return;
    this.closeOverlay('cal-info-overlay');
    document.getElementById('cal-edit-title').textContent = 'Rediger opgave';
    document.getElementById('cal-edit-id').value = ev.id;
    document.getElementById('cal-edit-order').value = ev.order_number || '';
    document.getElementById('cal-edit-desc').value = ev.title || '';
    document.getElementById('cal-edit-staff').value = ev.employee_names || '';
    document.getElementById('cal-edit-start').value = ev.start_date;
    const days = Math.round((new Date(ev.end_date + 'T12:00:00') - new Date(ev.start_date + 'T12:00:00')) / 86400000) + 1;
    document.getElementById('cal-edit-repeat').value = Math.max(1, days);
    this.renderColorPicker(ev.color);
    document.getElementById('cal-edit-delete').style.display = '';
    this.openOverlay('cal-edit-overlay');
  },

  closeEditDialog() { this.closeOverlay('cal-edit-overlay'); },

  syncEndMin() { /* v113: til-dato beregnes nu ud fra gentagelser */ },
});

// v113: (fortsaettelse af calendarPage - gem/info/slet)
Object.assign(window.calendarPage, {
  async saveEvent() {
    const id = document.getElementById('cal-edit-id').value;
    const start = document.getElementById('cal-edit-start').value;
    const repeats = Math.max(1, Math.min(31, parseInt(document.getElementById('cal-edit-repeat').value, 10) || 1));
    // v113: gentagelser - slutdato beregnes ud fra antal dage
    const endIso = this.isoDate(this.addDays(new Date(start + 'T12:00:00'), repeats - 1));
    const payload = {
      order_number: document.getElementById('cal-edit-order').value.trim(),
      title: document.getElementById('cal-edit-desc').value.trim(),
      start_date: start,
      end_date: endIso,
      color: this.getSelectedColor(),
      employee_names: document.getElementById('cal-edit-staff').value.trim(),
    };
    if (!payload.title || !start) {
      alert('Udfyld beskrivelse og startdato.');
      return;
    }
    try {
      if (id) {
        await apiCall('/api/calendar/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiCall('/api/calendar', { method: 'POST', body: JSON.stringify(payload) });
      }
      localStorage.setItem('calLastColor', payload.color);
      this.closeEditDialog();
      await this.refresh();
    } catch (err) {
      alert('Kunne ikke gemme: ' + (err.message || err));
    }
  },

  showInfo(ev) {
    this.editingEvent = ev;
    document.getElementById('cal-info-title').textContent =
      (ev.order_number ? ev.order_number + ' - ' : '') + ev.title;
    const d = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const period = ev.start_date === ev.end_date ? d(ev.start_date) : `${d(ev.start_date)} til ${d(ev.end_date)}`;
    document.getElementById('cal-info-body').innerHTML =
      `<div style="font-size:13px; line-height:1.8;">` +
      `<div><b>Periode:</b> ${this.esc(period)}</div>` +
      (ev.order_number ? `<div><b>Ordrenummer:</b> ${this.esc(ev.order_number)}</div>` : '') +
      (ev.employee_names ? `<div><b>Bemanding:</b> ${this.esc(ev.employee_names)}</div>` : '') +
      `</div>`;
    const cr = ev.created_at ? new Date(ev.created_at).toLocaleString('da-DK') : '';
    const up = ev.updated_at ? new Date(ev.updated_at).toLocaleString('da-DK') : '';
    document.getElementById('cal-info-meta').innerHTML =
      `Oprettet af ${this.esc(ev.created_by_name || '?')}${cr ? ' - ' + cr : ''}<br>` +
      `Sidst redigeret af ${this.esc(ev.updated_by_name || '?')}${up ? ' - ' + up : ''}`;
    document.getElementById('cal-info-edit').style.display = this.isAdmin ? '' : 'none';
    document.getElementById('cal-info-delete').style.display = this.isAdmin ? '' : 'none';
    const orderBtn = document.getElementById('cal-info-order');
    orderBtn.style.display = ev.order_number ? '' : 'none';
    orderBtn.onclick = () => this.openOrder(ev.order_number);
    this.openOverlay('cal-info-overlay');
  },

  async openOrder(orderNumber) {
    // v113: ordrer er tilbud med status accepted - find match i /api/quotes og aaben workspace
    try {
      const quotes = await apiCall('/api/quotes');
      const list = Array.isArray(quotes) ? quotes : (quotes.quotes || []);
      const clean = (s) => String(s || '').replace(/\s/g, '');
      const match = list.find(q =>
        clean(q.order_number) === clean(orderNumber) ||
        clean(q.full_order_number).endsWith(clean(orderNumber)) ||
        clean(q.quote_number) === clean(orderNumber)
      );
      if (match && typeof showPage === 'function') {
        this.closeOverlay('cal-info-overlay');
        showPage('quotes');
        setTimeout(() => { if (typeof openOrderWorkspace === 'function') openOrderWorkspace(match.id); }, 500);
      } else {
        alert('Ingen ordre med nummer ' + orderNumber + ' fundet i portalen.\n(Bem: ordren skal vaere oprettet som ordre i Ordrestyring)');
      }
    } catch (e) {
      alert('Kunne ikke slå ordren op: ' + (e.message || e));
    }
  },

  async deleteFromInfo() {
    const ev = this.editingEvent;
    if (!ev) return;
    if (!confirm('Slet opgaven "' + ev.title + '" fra kalenderen?')) return;
    try {
      await apiCall('/api/calendar/' + ev.id, { method: 'DELETE' });
      this.closeOverlay('cal-info-overlay');
      await this.refresh();
    } catch (err) {
      alert('Kunne ikke slette: ' + (err.message || err));
    }
  },

  async deleteEvent() {
    const id = document.getElementById('cal-edit-id').value;
    if (!id) return;
    if (!confirm('Slet denne opgave fra kalenderen?')) return;
    try {
      await apiCall('/api/calendar/' + id, { method: 'DELETE' });
      this.closeEditDialog();
      await this.refresh();
    } catch (err) {
      alert('Kunne ikke slette: ' + (err.message || err));
    }
  },
});



