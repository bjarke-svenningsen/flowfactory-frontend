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
  staffing: [],           // v113: bemandinger (rode bjaelker) - separate enheder koblet til opgaver
  editStaffing: null,     // v113: bemanding der redigeres i dialogen (roed bjaelke)
  COLORS: ['#34a853', '#1a73e8', '#fbbc04', '#8d6e63', '#f28b82', '#ff8f00', '#7b1fa2', '#00897b', '#c5221f', '#9aa0a6'],

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
    // v113: bemanding (rode bjaelker) er nu separate enheder koblet til opgaverne
    try {
      const sf = await apiCall(`/api/calendar-staffing?from=${from}&to=${to}`);
      this.staffing = Array.isArray(sf) ? sf : [];
    } catch (e) { this.staffing = []; }
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
    this._rowById = {};
    for (let i = 0; i < 7; i++) {
      const day = this.addDays(this.weekStart, i);
      const iso = this.isoDate(day);
      const isToday = iso === todayIso;
      header.innerHTML += `<div class="cal-day-head ${isToday ? 'today' : ''}">${names[i]}<span class="cal-day-num">${day.getDate()}</span></div>`;
      const col = document.createElement('div');
      col.className = 'cal-day-col' + (isToday ? ' today' : '');
      col.dataset.date = iso;
      if (this.isAdmin) {
        col.addEventListener('click', (e) => {
          if (e.target === col) {
            // v113: ny opgave placeres i det gitter-felt brugeren klikker paa
            const rect = col.getBoundingClientRect();
            const slot = Math.max(0, Math.floor((e.clientY - rect.top) / 32));
            this.openNewDialog(iso, slot);
          }
        });
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
    if (!this._rows) this._rows = {};     // iso-date -> Set(brugte raekker)
    if (!this._rowById) this._rowById = {}; // ev-id -> beregnet raekke (samme paa alle dage)
    const evs = [...this.events].sort((a, b) => (a.slot || 0) - (b.slot || 0) || String(a.start_date).localeCompare(String(b.start_date)));
    for (const e of evs) {
      if (this._rowById[e.id] !== undefined) continue;
      let row = e.slot || 0;
      const dayIso = [];
      for (let d = new Date(e.start_date + 'T12:00:00'); d <= new Date(e.end_date + 'T12:00:00'); d.setDate(d.getDate() + 1)) dayIso.push(this.isoDate(d));
      while (dayIso.some(iso => this._rows[iso] && this._rows[iso].has(row))) row++;
      dayIso.forEach(iso => { if (!this._rows[iso]) this._rows[iso] = new Set(); this._rows[iso].add(row); });
      this._rowById[e.id] = row;
    }
    return this._rowById[ev.id] !== undefined ? this._rowById[ev.id] : (ev.slot || 0);
  },

  buildEventBar(ev, iso, row) {
    // v113: bjaelker laegges i et vertikalt gitter (slot) - roed bjaelke (bemanding) UNDER farve-bjaelken
    const SLOT_H = 32;
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
    // v113: bemanding kommer nu fra calendar_staffing (separate enheder) - roed bjaelke(r) UNDER farve-bjaelken
    const staffForDay = (this.staffing || []).filter(sf => String(sf.event_id) === String(ev.id) && sf.start_date <= iso && sf.end_date >= iso);
    for (const sf of staffForDay) {
      if (!sf.employee_names) continue;
      emp = document.createElement('div');
      emp.className = 'cal-emp';
      emp.textContent = sf.employee_names;
      emp.addEventListener('click', (e) => { e.stopPropagation(); this.showStaffingInfo(sf, iso); });
      wrap.appendChild(emp);
    }
    const open = (e) => { e.stopPropagation(); this.showInfo(ev, iso); };
    bar.addEventListener('click', open);
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
    for (const sf of (this.staffing || [])) {
      if (sf.start_date > toIso || sf.end_date < fromIso) continue;
      (sf.employee_names || '').split(',').forEach(n => {
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
    const SLOT_H = 32;
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

  // v113: vis/skjul felter i rediger-dialogen afhaengig af om man redigerer opgave eller bemanding
  setEditFields(mode) {
    const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
    show('cal-label-order', mode !== 'staff');   show('cal-edit-order', mode !== 'staff');
    show('cal-label-desc', mode !== 'staff');    show('cal-edit-desc', mode !== 'staff');
    show('cal-label-color', mode !== 'staff');   show('cal-colors', mode !== 'staff');
    show('cal-label-staff', mode !== 'task');    show('cal-edit-staff', mode !== 'task');
  },

  openNewDialog(dateIso, slot) {
    this.editingEvent = null;
    this.editStaffing = null;
    this.setEditFields('new'); // v113: 'new' = bade opgave- og bemandingsfelt synlige
    this.newSlot = slot || 0; // v113: gitter-raekke brugeren klikkede paa (0 hvis top-knappen)
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

  // v113: scope-vaelger i rediger-dialogen (Google-style)
  setScope(scope) {
    this.editScope = scope;
    ['day', 'following', 'all'].forEach(s => {
      document.getElementById('cal-scope-' + s).classList.toggle('active', s === scope);
    });
  },

  editFromInfo() {
    const ev = this.editingEvent;
    if (!ev) return;
    this.editStaffing = null;
    this.setEditFields('task'); // v113: rediger opgave = skjul bemandingsfelt
    this.newSlot = ev.slot || 0; // v113: behold placering ved redigering
    this.editDay = this.infoDay || ev.start_date; // v113: dagen man klikkede paa (eller foerste dag)
    const multiDay = ev.end_date > ev.start_date;
    this.editScope = multiDay ? 'following' : 'all';
    this.closeOverlay('cal-info-overlay');
    document.getElementById('cal-edit-title').textContent = 'Rediger opgave';
    document.getElementById('cal-edit-id').value = ev.id;
    document.getElementById('cal-edit-order').value = ev.order_number || '';
    document.getElementById('cal-edit-desc').value = ev.title || '';
    document.getElementById('cal-edit-staff').value = '';
    document.getElementById('cal-edit-start').value = ev.start_date;
    const days = Math.round((new Date(ev.end_date + 'T12:00:00') - new Date(ev.start_date + 'T12:00:00')) / 86400000) + 1;
    document.getElementById('cal-edit-repeat').value = Math.max(1, days);
    this.renderColorPicker(ev.color);
    document.getElementById('cal-edit-delete').style.display = '';
    // v113: scope-knapper vises ALTID for Ledelsen (teksterne star i HTML'en)
    if (this.isAdmin) {
      document.getElementById('cal-scope-row').style.display = '';
      this.setScope('following');
    }
    this.openOverlay('cal-edit-overlay');
  },

  // ===== v113: BEMANDING (roed bjaelke) - separate enheder adskilt fra opgaven =====
  showStaffingInfo(sf, iso) {
    this.editingStaffing = sf;
    this.infoDay = iso || null;
    document.getElementById('cal-info-title').textContent = 'Bemanding: ' + (sf.employee_names || '');
    const d = (x) => x ? new Date(x + 'T12:00:00').toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const period = sf.start_date === sf.end_date ? d(sf.start_date) : `${d(sf.start_date)} til ${d(sf.end_date)}`;
    document.getElementById('cal-info-body').innerHTML =
      `<div style="font-size:13px; line-height:1.8;">` +
      `<div><b>Periode:</b> ${this.esc(period)}</div>` +
      `<div><b>Bemanding:</b> ${this.esc(sf.employee_names)}</div>` +
      `</div>`;
    const cr = sf.created_at ? new Date(sf.created_at).toLocaleString('da-DK') : '';
    document.getElementById('cal-info-meta').innerHTML = cr ? 'Oprettet ' + cr : '';
    document.getElementById('cal-info-edit').style.display = this.isAdmin ? '' : 'none';
    document.getElementById('cal-info-delete').style.display = this.isAdmin ? '' : 'none';
    document.getElementById('cal-info-order').style.display = 'none';
    document.getElementById('cal-info-edit').onclick = () => this.editStaffingFromInfo();
    document.getElementById('cal-info-delete').onclick = () => this.deleteStaffingFromInfo();
    this.openOverlay('cal-info-overlay');
  },

  editStaffingFromInfo() {
    const sf = this.editingStaffing;
    if (!sf) return;
    this.editStaffing = sf;
    this.setEditFields('staff');
    this.editDay = this.infoDay || sf.start_date;
    const multiDay = sf.end_date > sf.start_date;
    this.editScope = multiDay ? 'following' : 'all';
    this.closeOverlay('cal-info-overlay');
    document.getElementById('cal-edit-title').textContent = 'Rediger bemanding';
    document.getElementById('cal-edit-id').value = sf.id;
    document.getElementById('cal-edit-staff').value = sf.employee_names || '';
    document.getElementById('cal-edit-start').value = sf.start_date;
    const days = Math.round((new Date(sf.end_date + 'T12:00:00') - new Date(sf.start_date + 'T12:00:00')) / 86400000) + 1;
    document.getElementById('cal-edit-repeat').value = Math.max(1, days);
    document.getElementById('cal-edit-delete').style.display = '';
    if (this.isAdmin) {
      document.getElementById('cal-scope-row').style.display = '';
      this.setScope('following');
    }
    this.openOverlay('cal-edit-overlay');
  },

  async deleteStaffingFromInfo() {
    const sf = this.editingStaffing;
    if (!sf) return;
    if (!confirm('Fjern bemandingen "' + sf.employee_names + '" fra kalenderen?')) return;
    try {
      await apiCall('/api/calendar-staffing/' + sf.id, { method: 'DELETE' });
      this.closeOverlay('cal-info-overlay');
      await this.refresh();
    } catch (err) {
      alert('Kunne ikke slette bemandingen: ' + (err.message || err));
    }
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
    const staffVal = document.getElementById('cal-edit-staff').value.trim();
    try {
      // v113: bemanding redigeres som SEPARAT enhed (roed bjaelke) - opgavens datoer/tekst roeres IKKE
      if (this.editStaffing) {
        const sf = this.editStaffing;
        const day = this.editDay || sf.start_date;
        const scope = this.editScope || 'all';
        const single = sf.start_date === sf.end_date;
        if (!single && scope !== 'all' && day >= sf.start_date && day <= sf.end_date) {
          // 1) tilpas original-bemandingen saa den ikke laengere daekker dagen
          if (day > sf.start_date) {
            const prevEnd = this.isoDate(this.addDays(new Date(day + 'T12:00:00'), -1));
            await apiCall('/api/calendar-staffing/' + sf.id, {
              method: 'PUT',
              body: JSON.stringify({ start_date: sf.start_date, end_date: prevEnd, employee_names: sf.employee_names })
            });
          } else if (sf.end_date > day) {
            // dagen er foerste dag: ryk bemandingens start til dagen efter
            const nextStart = this.isoDate(this.addDays(new Date(day + 'T12:00:00'), 1));
            await apiCall('/api/calendar-staffing/' + sf.id, {
              method: 'PUT',
              body: JSON.stringify({ start_date: nextStart, end_date: sf.end_date, employee_names: sf.employee_names })
            });
          }
          // 2) ny bemandings-del med de aendrede navne
          const partEnd = scope === 'day' ? day : endIso;
          await apiCall('/api/calendar-staffing', {
            method: 'POST',
            body: JSON.stringify({ event_id: sf.event_id, start_date: day, end_date: partEnd, employee_names: staffVal })
          });
          // 3) "denne begivenhed": hale med de GAMLE navne efter den aendrede dag
          if (scope === 'day' && day < sf.end_date) {
            const tailStart = this.isoDate(this.addDays(new Date(day + 'T12:00:00'), 1));
            await apiCall('/api/calendar-staffing', {
              method: 'POST',
              body: JSON.stringify({ event_id: sf.event_id, start_date: tailStart, end_date: sf.end_date, employee_names: sf.employee_names })
            });
          }
        } else {
          await apiCall('/api/calendar-staffing/' + sf.id, {
            method: 'PUT',
            body: JSON.stringify({ start_date: start, end_date: endIso, employee_names: staffVal })
          });
        }
        this.closeEditDialog();
        await this.refresh();
        return;
      }
      const payload = {
        order_number: document.getElementById('cal-edit-order').value.trim(),
        title: document.getElementById('cal-edit-desc').value.trim(),
        start_date: start,
        end_date: endIso,
        color: this.getSelectedColor(),
        employee_names: '', // v113: bemanding gemmes nu som separate enheder (calendar_staffing)
        slot: this.newSlot || 0, // v113: klik-placering / auto-raekke
      };
    if (!payload.title || !start) {
      alert('Udfyld beskrivelse og startdato.');
      return;
    }
    if (id) {
        // v113: scope-redigering a la Google - "kun denne dag" / "denne og frem" / "hele perioden"
        const orig = this.editingEvent || this.events.find(e => String(e.id) === String(id));
        const day = this.editDay;
        const scope = this.editScope || 'all';
        const multiDay = orig && orig.end_date > orig.start_date;
        if (orig && multiDay && day && scope !== 'all' && day >= orig.start_date && day <= orig.end_date) {
          // 1) tilpas originalen saa den ikke laengere daekker dagen
          if (day > orig.start_date) {
            // forkort: slut dagen foer
            const prevEnd = this.isoDate(this.addDays(new Date(day + 'T12:00:00'), -1));
            await apiCall('/api/calendar/' + id, {
              method: 'PUT',
              body: JSON.stringify({
                order_number: orig.order_number, title: orig.title, start_date: orig.start_date,
                end_date: prevEnd, color: orig.color, employee_names: orig.employee_names, slot: orig.slot || 0,
              })
            });
          } else {
            // dagen er foerste dag: ryk originalens start til dagen efter
            const nextStart = this.isoDate(this.addDays(new Date(day + 'T12:00:00'), 1));
            await apiCall('/api/calendar/' + id, {
              method: 'PUT',
              body: JSON.stringify({
                order_number: orig.order_number, title: orig.title, start_date: nextStart,
                end_date: orig.end_date, color: orig.color, employee_names: orig.employee_names, slot: orig.slot || 0,
              })
            });
          }
          // 2) ny del med de aendrede vaerdier
          const partEnd = scope === 'day' ? day : endIso;
          await apiCall('/api/calendar', {
            method: 'POST',
            body: JSON.stringify({ ...payload, start_date: day, end_date: partEnd, slot: orig.slot || 0 })
          });
          // 3) "kun denne dag": hale med de GAMLE vaerdier efter den aendrede dag
          if (scope === 'day' && day < orig.end_date) {
            const tailStart = this.isoDate(this.addDays(new Date(day + 'T12:00:00'), 1));
            await apiCall('/api/calendar', {
              method: 'POST',
              body: JSON.stringify({
                order_number: orig.order_number, title: orig.title, start_date: tailStart,
                end_date: orig.end_date, color: orig.color, employee_names: orig.employee_names, slot: orig.slot || 0,
              })
            });
          }
        } else {
          await apiCall('/api/calendar/' + id, { method: 'PUT', body: JSON.stringify(payload) });
        }
      } else {
        // v113: ny opgave - bemanding oprettes som separat enhed koblet til opgaven
        const created = await apiCall('/api/calendar', { method: 'POST', body: JSON.stringify(payload) });
        if (created && created.id && staffVal) {
          await apiCall('/api/calendar-staffing', {
            method: 'POST',
            body: JSON.stringify({ event_id: created.id, start_date: payload.start_date, end_date: payload.end_date, employee_names: staffVal })
          });
        }
      }
      localStorage.setItem('calLastColor', payload.color);
      this.closeEditDialog();
      await this.refresh();
    } catch (err) {
      alert('Kunne ikke gemme: ' + (err.message || err));
    }
  },

  showInfo(ev, iso) {
    this.editingEvent = ev;
    this.infoDay = iso || null; // v113: hvilken dag bjaelken blev klikket paa (til scope-redigering)
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
    document.getElementById('cal-info-edit').onclick = () => this.editFromInfo();
    document.getElementById('cal-info-delete').onclick = () => this.deleteFromInfo();
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
    // v113: slet-knappen i rediger-dialogen virker paa bemanding ELLER opgave afhaengig af modus
    if (this.editStaffing) {
      const sf = this.editStaffing;
      if (!confirm('Fjern bemandingen "' + sf.employee_names + '" fra kalenderen?')) return;
      try {
        await apiCall('/api/calendar-staffing/' + sf.id, { method: 'DELETE' });
        this.closeEditDialog();
        await this.refresh();
      } catch (err) {
        alert('Kunne ikke slette bemandingen: ' + (err.message || err));
      }
      return;
    }
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



