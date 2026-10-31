// time.js - Min Tid / timeregistrering
import { Auth, TimeEntries, Materials } from './api.js';

// Materiale-numre for tidstyper (oprettet under Materialer)
const TIME_MATERIALS = {
    normal: '8000',   // Montørtimer
    overtime: '8001', // Montørtimer weekend/overarbejde
    sick: '1'         // Sygdom
};

const DAY_NAMES = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
const MONTH_NAMES = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];

// Lokal dato-format (undgå UTC-forskydning fra toISOString)
function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Mandag i ugen for en given dato (dansk uge: mandag-først)
function getWeekStart(d) {
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = monday.getDay(); // 0=søndag
    const diff = day === 0 ? -6 : 1 - day;
    monday.setDate(monday.getDate() + diff);
    return monday;
}

// ISO ugenummer
function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// Hvilken tidstype er en registrering (ud fra materiale-nummer)
// NB: String() da DB kan returnere tal (8000) eller tekst ('8000')
function getTimeType(entry) {
    if (String(entry.material_number) === String(TIME_MATERIALS.overtime)) return 'overtime';
    if (String(entry.material_number) === String(TIME_MATERIALS.sick)) return 'sick';
    return 'normal';
}

// Visuel blok-type: udledes af materiale-navnet (case-insensitive),
// fallback til materiale-nummeret
function getEntryType(entry) {
    // Gemt entry_type (efter migreringen) slaar igennem foerst - fallback udledes af ordre/materiale
    if (entry.entry_type === 'sick') return 'sick';
    const nm = (entry.material_name || '').toLowerCase();
    if (nm.includes('sygdom')) return 'sick';
    if (nm.includes('weekend') || nm.includes('overarbejde') || nm.includes('overtid')) return 'overtime';
    const t = getTimeType(entry);
    if (t === 'sick') return 'sick';
    if (t === 'overtime') return 'overtime';
    return 'regular';
}

// Blok-klasse for tidsaksen: skeln mellem ordre og vaerksted samt alm./overtid.
// (naar entry_type findes i DB slaar den igennem via getEntryType; indtil migreringen udledes af ordre/materiale)
function getBlockType(entry) {
    const t = getEntryType(entry);
    if (t === 'sick') return 'time-sick';
    const isOvertime = t === 'overtime';
    if (entry.order_id) return isOvertime ? 'time-overtime' : 'time-regular';
    return isOvertime ? 'time-workshop-overtime' : 'time-workshop';
}
function hoursOf(entry) {
    return parseFloat(entry.duration_hours) || 0;
}

const timePage = {
    currentView: 'day',
    selectedDate: new Date(),
    timeEntries: [],
    materials: [],
    currentUser: null,
    selectedUserId: null, // For admin viewing other users

    async init() {
        // Check authentication
        try {
            const userData = await Auth.me();
            this.currentUser = userData.user;
            this.selectedUserId = userData.user.id; // Default to own ID
        } catch (error) {
            window.location.href = 'index.html';
            return;
        }

        // Set today's date
        document.getElementById('selectedDate').valueAsDate = this.selectedDate;

        // If admin, load all users for dropdown AND show price info
        if (this.currentUser.is_admin) {
            await this.loadAllUsers();
            // Show price info for admins
            const priceInfo = document.getElementById('priceInfo');
            if (priceInfo) priceInfo.style.display = 'block';
        }

        // Load materials and time entries
        await this.loadMaterials();
        await this.loadTimeEntries();
        
        // Initialize day view
        this.initDayView();
    },

    async loadAllUsers() {
        try {
            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            
            const select = document.getElementById('adminUserSelect');
            select.innerHTML = '<option value="">Mine timer</option>';
            
            // Backend returns array directly, not { users: [] }
            if (Array.isArray(data)) {
                data.forEach(user => {
                    if (user.id !== this.currentUser.id) {
                        const option = document.createElement('option');
                        option.value = user.id;
                        option.textContent = user.name;
                        select.appendChild(option);
                    }
                });
            }
            
            select.style.display = 'block';
        } catch (error) {
            console.error('Error loading users:', error);
        }
    },

    switchUser() {
        const select = document.getElementById('adminUserSelect');
        this.selectedUserId = select.value || this.currentUser.id;
        this.loadTimeEntries();
    },

    async loadMaterials() {
        try {
            this.materials = await Materials.getAll();
        } catch (error) {
            console.error('Error loading materials:', error);
        }
    },

    async loadTimeEntries() {
        try {
            let startDate, endDate;
            
            if (this.currentView === 'week') {
                const monday = getWeekStart(this.selectedDate);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                startDate = fmtDate(monday);
                endDate = fmtDate(sunday);
            } else if (this.currentView === 'month' || this.currentView === 'workshop') {
                startDate = fmtDate(new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth(), 1));
                endDate = fmtDate(new Date(this.selectedDate.getFullYear(), this.selectedDate.getMonth() + 1, 0));
            } else {
                // Dag-visning
                startDate = fmtDate(this.selectedDate);
                endDate = startDate;
            }
            
            const filters = { start_date: startDate, end_date: endDate };
            if (this.selectedUserId) filters.user_id = this.selectedUserId;
            
            this.timeEntries = await TimeEntries.getAll(filters);
            this.renderCurrentView();
        } catch (error) {
            console.error('Error loading time entries:', error);
            alert(' Kunne ikke hente timeregistreringer: ' + (error.message || 'Ukendt fejl'));
        }
    },

    // ---- Faelles tidsakse-komponent (Dag + Uge) ----

    // Parse "HH:MM" til minutter (ingen Date-objekter - undgaar tidszoner)
    parseMinutes(t) {
        if (!t || typeof t !== 'string' || !t.includes(':')) return null;
        const [h, m] = t.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return null;
        return h * 60 + m;
    },

    minToLabel(min) {
        return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    },

    // Opdel registreringer over midnat (fx 22:00-02:00) i to dele
    splitParts(entry) {
        const s = this.parseMinutes(entry.start_time);
        const e = this.parseMinutes(entry.end_time);
        if (s === null || e === null || s === e) return null; // uden tidspunkt
        if (e > s) return [{ entry, iso: entry.date, startMin: s, endMin: e }];
        // Over midnat: forste dag til 24:00, naeste dag fra 00:00
        const next = new Date(entry.date + 'T12:00:00');
        next.setDate(next.getDate() + 1);
        return [
            { entry, iso: entry.date, startMin: s, endMin: 1440 },
            { entry, iso: fmtDate(next), startMin: 0, endMin: e }
        ];
    },

    initDayView() {
        // Tegnes nu af renderDayView via faelles tidsakse-komponent
    },

    // Fordel overlappende blokke side om side (delt bredde pr. overlapgruppe)
    layoutParts(parts) {
        const sorted = [...parts].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
        const clusters = [];
        let cluster = null;
        sorted.forEach(p => {
            if (cluster && p.startMin < cluster.maxEnd) {
                cluster.parts.push(p);
                cluster.maxEnd = Math.max(cluster.maxEnd, p.endMin);
            } else {
                cluster = { parts: [p], maxEnd: p.endMin };
                clusters.push(cluster);
            }
        });
        clusters.forEach(c => {
            const laneEnds = [];
            c.parts.forEach(p => {
                let lane = laneEnds.findIndex(end => end <= p.startMin);
                if (lane === -1) lane = laneEnds.length;
                laneEnds[lane] = p.endMin;
                p.lane = lane;
                p.lanesOfCluster = laneEnds.length; // vaekstende; korrigeres til max nedenfor
            });
            const total = laneEnds.length;
            c.parts.forEach(p => { p.lanesOfCluster = total; });
        });
        return sorted;
    },

    buildTimeGrid(container, days) {
        const HOUR_H = 48;
        const todayIso = fmtDate(new Date());
        const cols = days.length;

        let head = `<div class="timegrid-head" style="display:grid;grid-template-columns:var(--axis-w) repeat(${cols}, 1fr);">`;
        head += `<div class="timegrid-corner">Uge ${getWeekNumber(days[0].date)}</div>`;
        days.forEach(day => {
            const isToday = day.iso === todayIso;
            head += `<div class="timegrid-day${isToday ? ' today-col' : ''}">${DAY_NAMES[day.date.getDay()]}<span class="day-num">${day.date.getDate()}. ${MONTH_NAMES[day.date.getMonth()]}</span></div>`;
        });
        head += '</div>';
        // Sticky sumraekke lige under dagsnavnene: Timer pr. dag + ugetotal i hjornet (med Overtid/Sygdom-chips)
        const allEntries = days.flatMap(d => d.entries || []);
        const totalHours = allEntries.reduce((s, e) => s + hoursOf(e), 0);
        const overtimeHours = allEntries.filter(e => getEntryType(e) === 'overtime').reduce((s, e) => s + hoursOf(e), 0);
        const sickHours = allEntries.filter(e => getEntryType(e) === 'sick').reduce((s, e) => s + hoursOf(e), 0);
        const chips =
            (overtimeHours > 0 ? `<span class="legend-chip time-overtime">Overtid ${overtimeHours.toFixed(1).replace('.', ',')} t</span>` : '') +
            (sickHours > 0 ? `<span class="legend-chip time-sick">Sygdom ${sickHours.toFixed(1).replace('.', ',')} t</span>` : '');
        const cornerLabel = cols > 1
            ? `Uge ${getWeekNumber(days[0].date)}: ${totalHours.toFixed(1).replace('.', ',')} t`
            : `I alt: ${totalHours.toFixed(1).replace('.', ',')} t`;
        let sumRow = `<div class="timegrid-sumrow" style="display:grid;grid-template-columns:var(--axis-w) repeat(${cols}, 1fr);">` +
            `<div class="timegrid-sumcorner"><span>${cornerLabel}</span>${chips}</div>`;
        days.forEach(day => {
            const h = (day.entries || []).reduce((s, e) => s + hoursOf(e), 0);
            sumRow += `<div class="timegrid-sumcell">Timer: <strong${h > 0 ? ' style="color:var(--success)"' : ''}>${h > 0 ? h.toFixed(1).replace('.', ',') + ' t' : '\u2013'}</strong></div>`;
        });
        sumRow += '</div>';

        let body = '';
        days.forEach(day => {
            const noTime = [];
            let parts = [];
            (day.entries || []).forEach(entry => {
                const sp = this.splitParts(entry);
                if (!sp) { noTime.push(entry); return; }
                sp.forEach(p => { if (p.iso === day.iso) parts.push(p); });
            });
            parts = this.layoutParts(parts);

            const isToday = day.iso === todayIso;
            let col = `<div class="timegrid-col${isToday ? ' today-col' : ''}" data-date="${day.iso}">`;

            // Hel- og halvtimeslinjer
            for (let h = 0; h <= 24; h++) {
                col += `<div class="grid-line" style="top:${h * HOUR_H}px;"></div>`;
                if (h < 24) col += `<div class="grid-line grid-line--half" style="top:${h * HOUR_H + HOUR_H / 2}px;"></div>`;
            }

            // Blokke placeret efter klokkaeslaet
            parts.forEach(p => {
                const e = p.entry;
                const top = Math.round((p.startMin / 60) * HOUR_H);
                const height = Math.max(24, Math.round(((p.endMin - p.startMin) / 60) * HOUR_H));
                const compact = height < 40;
                const widthPct = 100 / p.lanesOfCluster;
                const leftPct = (p.lane * 100) / p.lanesOfCluster;
                const timeStr = `${this.minToLabel(p.startMin)}-${this.minToLabel(p.endMin)}`;
                const line1 = `(${hoursOf(e).toFixed(1).replace('.', ',')}) ${timeStr}`;
                const label = e.order_number || e.quote_number || 'Værksted';
                // Linje 2+: type, ordre/vaerksted, materiale - dubletter filtreres fra, ellipsis via CSS
                const typeLabels = { 'time-regular': 'Alm. timer', 'time-overtime': 'Overtid', 'time-sick': 'Sygdom', 'time-workshop': 'V\u00E6rksted', 'time-workshop-overtime': 'V\u00E6rksted (overtid)' };
                const detailLines = [typeLabels[getBlockType(e)] || '', label, e.material_name || '']
                    .filter((v, i, a) => v && a.indexOf(v) === i)
                    .map(v => `<div class="tg-line2">${v}</div>`).join('');
                const tooltip = `${line1}\n${label}\n${e.material_name || ''}`;
                col += `<div class="tg-block ${getBlockType(e)}${e.is_locked ? ' locked' : ''}${compact ? ' compact' : ''}"` +
                    ` style="top:${top}px;height:${height}px;left:calc(${leftPct}% + 3px);width:calc(${widthPct}% - 6px);"` +
                    ` title="${tooltip.replace(/"/g, '&quot;')}"` +
                    ` onclick="timePage.editTimeEntryById(${e.id})">` +
                    `<div class="tg-line1">${line1}</div>` +
                    (compact ? '' : detailLines) +
                    `</div>`;
            });

            // Roed "nu"-streg for i dag
            if (isToday) {
                const now = new Date();
                const nowMin = now.getHours() * 60 + now.getMinutes();
                col += `<div class="now-line" data-now style="top:${(nowMin / 60) * HOUR_H}px;"><div class="now-dot"></div></div>`;
            }

            col += '</div>';
            body += col;
        });

        // Chips for registreringer uden tidspunkt
        let noTimeRow = '';
        const hasNoTime = days.some(d => (d.entries || []).some(e => !this.splitParts(e)));
        if (hasNoTime) {
            noTimeRow = '<div class="timegrid-notime"><span>Uden tidspunkt:</span>';
            days.forEach(day => {
                (day.entries || []).forEach(e => {
                    if (this.splitParts(e)) return;
                    const label = e.order_number || e.quote_number || 'Værksted';
                    noTimeRow += `<span class="no-time-chip legend-chip time-${getEntryType(e)}"` +
                        ` title="${(e.material_name || '').replace(/"/g, '&quot;')}"` +
                        ` onclick="timePage.editTimeEntryById(${e.id})">${label} · ${hoursOf(e).toFixed(1).replace('.', ',')} t</span>`;
                });
            });
            noTimeRow += '</div>';
        }

        // Akse 00:00-24:00
        let axis = '<div class="timegrid-axis">';
        for (let h = 0; h < 24; h++) axis += `<div class="axis-label">${String(h).padStart(2, '0')}:00</div>`;
        axis += '</div>';

        container.innerHTML = `<div class="timegrid-card"><div class="timegrid-topbar">${head}${sumRow}</div>${noTimeRow}` +
            `<div class="timegrid-scroll">` +
            `<div class="timegrid-canvas" style="display:grid;grid-template-columns:var(--axis-w) repeat(${cols}, 1fr);">${axis}${body}</div>` +
            `</div></div>`;

        // Scroll til kl. 06:00 (eller en time for foerste registrering)
        const scroller = container.querySelector('.timegrid-scroll');
        if (scroller) {
            let firstStart = null;
            days.forEach(d => (d.entries || []).forEach(e => {
                const s = this.parseMinutes(e.start_time);
                if (s !== null && (firstStart === null || s < firstStart)) firstStart = s;
            }));
            const target = firstStart !== null ? Math.max(0, firstStart - 60) : 6 * 60;
            scroller.scrollTop = (target / 60) * HOUR_H;
        }

        // "Nu"-streg opdateres hvert minut
        if (this._nowTimer) clearInterval(this._nowTimer);
        this._nowTimer = setInterval(() => {
            const now = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();
            document.querySelectorAll('[data-now]').forEach(el => {
                el.style.top = (nowMin / 60) * HOUR_H + 'px';
            });
        }, 60000);
    },

    renderCurrentView() {
        if (this.currentView === 'day') {
            this.renderDayView();
        } else if (this.currentView === 'week') {
            this.renderWeekView();
        } else if (this.currentView === 'month') {
            this.renderMonthView();
        } else if (this.currentView === 'workshop') {
            this.renderWorkshopView();
        }
        this.updateHeader();
    },

    // Opdater undertekst + datolabel (og Lucide-ikoner) efter render
    updateHeader() {
        const total = this.timeEntries.reduce((s, e) => s + hoursOf(e), 0);
        const sub = document.getElementById('timeSubtitle');
        const label = document.getElementById('dateLabel');
        if (!sub || !label) return;
        const d = this.selectedDate;
        if (this.currentView === 'week') {
            const monday = getWeekStart(d);
            const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
            sub.textContent = `Uge ${getWeekNumber(monday)} · ${total.toFixed(1)} timer registreret`;
            label.textContent = `${monday.getDate()}. ${MONTH_NAMES[monday.getMonth()].slice(0, 3)} – ${sunday.getDate()}. ${MONTH_NAMES[sunday.getMonth()].slice(0, 3)} ${sunday.getFullYear()}`;
        } else if (this.currentView === 'day') {
            sub.textContent = `${DAY_NAMES[d.getDay()]} ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]} · ${total.toFixed(1)} timer registreret`;
            label.textContent = `${d.getDate()}. ${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
        } else {
            sub.textContent = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()} · ${total.toFixed(1)} timer registreret`;
            label.textContent = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
        }
        if (window.lucide) { try { lucide.createIcons(); } catch (e) { /* ignore */ } }
    },

    // Datovælger ændret i UI'et
    onDateChange() {
        const v = document.getElementById('selectedDate').value;
        if (v) {
            const [y, m, dd] = v.split('-').map(Number);
            this.selectedDate = new Date(y, m - 1, dd);
        }
        this.loadTimeEntries();
    },

    renderDayView() {
        // Dagtitel
        document.getElementById('dayTitle').textContent =
            `${DAY_NAMES[this.selectedDate.getDay()]} ${this.selectedDate.getDate()}. ${MONTH_NAMES[this.selectedDate.getMonth()]} ${this.selectedDate.getFullYear()}`;

        const container = document.getElementById('dayGrid');
        const iso = fmtDate(this.selectedDate);
        const days = [{ date: this.selectedDate, iso, entries: this.timeEntries.filter(e => e.date === iso) }];
        this.buildTimeGrid(container, days);
    },

    renderWeekView() {
        const container = document.getElementById('weekView');

        // Grupper registreringer pr. dag (mandag-forst)
        const monday = getWeekStart(this.selectedDate);
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const iso = fmtDate(d);
            const entries = this.timeEntries.filter(e => e.date === iso);
            days.push({ date: d, iso, entries });
        }

        // Faelles tidsakse med absolute blokke
        this.buildTimeGrid(container, days);

        

        this.updateHeader();
    },

    // Find og rediger registrering ud fra id (bruges fra uge-/månedsvisning)
    editTimeEntryById(entryId) {
        const entry = this.timeEntries.find(e => e.id === entryId);
        if (entry) this.editTimeEntry(entry);
    },

    renderMonthView() {
        const container = document.getElementById('monthView');
        const year = this.selectedDate.getFullYear();
        const month = this.selectedDate.getMonth();
        
        // Summary-tal
        const totalHours = this.timeEntries.reduce((s, e) => s + hoursOf(e), 0);
        const normalHours = this.timeEntries.filter(e => getTimeType(e) === 'normal').reduce((s, e) => s + hoursOf(e), 0);
        const overtimeHours = this.timeEntries.filter(e => getEntryType(e) === 'overtime').reduce((s, e) => s + hoursOf(e), 0);
        const sickHours = this.timeEntries.filter(e => getEntryType(e) === 'sick').reduce((s, e) => s + hoursOf(e), 0);
        const workshopHours = this.timeEntries.filter(e => !e.order_id && getTimeType(e) !== 'sick').reduce((s, e) => s + hoursOf(e), 0);
        
        // Kalendergitter (mandag først) med ugenumre
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startOffset = (firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1);
        const todayIso = fmtDate(new Date());
        
        const cells = [];
        for (let i = 0; i < startOffset; i++) cells.push(null);
        for (let day = 1; day <= lastDay.getDate(); day++) cells.push(new Date(year, month, day));
        while (cells.length % 7 !== 0) cells.push(null);
        
        let calHtml = '<div class="week-grid" style="margin-top:15px;">';
        calHtml += '<div class="week-day-header" style="background:var(--surface-muted);color:var(--text-muted);font-size:11px;">Uge</div>';
        ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].forEach(n => {
            calHtml += `<div class="week-day-header">${n}</div>`;
        });
        
        for (let i = 0; i < cells.length; i += 7) {
            const weekFirst = cells[i];
            calHtml += `<div style="display:flex;align-items:center;justify-content:center;background:var(--surface-muted);color:var(--text-muted);font-size:11px;">${weekFirst ? 'U' + getWeekNumber(weekFirst) : ''}</div>`;
            for (let j = 0; j < 7; j++) {
                calHtml += this.renderMonthCell(cells[i + j], todayIso);
            }
        }
        calHtml += '</div>';
        
        const breakdown = this.renderOrderBreakdown(workshopHours, sickHours);
        
        container.innerHTML = `
            <div class="month-summary">
                <div class="summary-card">
                    <h3> Total Timer</h3>
                    <div class="summary-stat">${totalHours.toFixed(1)}</div>
                    <div class="summary-label">timer i ${MONTH_NAMES[month]}</div>
                </div>
                <div class="summary-card">
                    <h3> Montørtimer</h3>
                    <div class="summary-stat">${normalHours.toFixed(1)}</div>
                    <div class="summary-label">almindelige timer</div>
                </div>
                <div class="summary-card">
                    <h3>Overtid</h3>
                    <div class="summary-stat">${overtimeHours.toFixed(1)}</div>
                    <div class="summary-label">weekend/overarbejde</div>
                </div>
                <div class="summary-card">
                    <h3> Værksted</h3>
                    <div class="summary-stat">${workshopHours.toFixed(1)}</div>
                    <div class="summary-label">intern tid</div>
                </div>
            </div>
            <div class="summary-card">
                <h3> Detaljer Per Ordre</h3>
                ${breakdown}
            </div>
            ${calHtml}
        `;
    },

    renderMonthCell(d, todayIso) {
        if (!d) return '<div style="border-left:1px solid var(--border-soft);background:var(--surface-muted);min-height:70px;"></div>';
        
        const iso = fmtDate(d);
        const dayEntries = this.timeEntries.filter(e => e.date === iso);
        const dayHours = dayEntries.reduce((s, e) => s + hoursOf(e), 0);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const isToday = iso === todayIso;
        
        let style = `border-left:1px solid var(--border-soft);min-height:70px;padding:8px;cursor:pointer;`;
        if (isToday) style += 'box-shadow: inset 0 3px 0 var(--accent);background: var(--accent-today);';
        else if (isWeekend) style += 'background: var(--surface-muted);';
        
        let content = `<div style="font-size:12px;color:${isToday ? 'var(--color-accent-hover)' : 'var(--text-muted)'};font-weight:600;">${d.getDate()}</div>`;
        if (dayHours > 0) {
            const hasOvertime = dayEntries.some(e => getEntryType(e) === 'overtime');
            const hasSick = dayEntries.some(e => getEntryType(e) === 'sick');
            const color = hasSick ? 'var(--time-sick-text)' : (hasOvertime ? 'var(--time-overtime-text)' : 'var(--time-alm-text)');
            content += `<div style="font-weight:700;color:${color};">${dayHours.toFixed(1)} t</div>`;
            content += `<div style="font-size:10px;color:var(--text-muted);margin-top:3px;">${dayEntries.length} reg.</div>`;
        }
        return `<div style="${style}" onclick="timePage.jumpToDay('${iso}')">${content}</div>`;
    },

    renderOrderBreakdown(workshopHours, sickHours) {
        const byOrder = {};
        this.timeEntries.filter(e => e.order_id).forEach(e => {
            const key = e.order_number || e.quote_number || ('Ordre #' + e.order_id);
            const label = e.customer_name ? `${key} - ${e.customer_name}` : key;
            if (!byOrder[label]) byOrder[label] = { normal: 0, overtime: 0, total: 0 };
            byOrder[label][getTimeType(e)] += hoursOf(e);
            byOrder[label].total += hoursOf(e);
        });
        
        let breakdown = '';
        const orderKeys = Object.keys(byOrder);
        if (orderKeys.length > 0) {
            breakdown += '<table style="width:100%;border-collapse:collapse;margin-top:10px;">';
            breakdown += '<tr style="text-align:left;color:var(--text-muted);font-size:12px;"><th style="padding:8px;">Ordre</th><th>Alm. timer</th><th>Overtid</th><th>Total</th></tr>';
            orderKeys.sort((a, b) => byOrder[b].total - byOrder[a].total).forEach(key => {
                const o = byOrder[key];
                breakdown += `<tr style="border-top:1px solid var(--border-soft);">
                    <td style="padding:8px;">${key}</td>
                    <td style="text-align:center;">${o.normal.toFixed(1)}</td>
                    <td style="text-align:center;">${o.overtime.toFixed(1)}</td>
                    <td style="text-align:center;font-weight:700;">${o.total.toFixed(1)}</td>
                </tr>`;
            });
            breakdown += '</table>';
        } else {
            breakdown = '<p style="color:var(--text-muted);margin-top:10px;">Ingen ordre-timer registreret denne måned.</p>';
        }
        
        breakdown += `<div style="margin-top:15px;padding:12px;background:var(--surface-muted);border-radius:8px;">
            <strong> Værksted (intern tid):</strong> ${workshopHours.toFixed(1)} timer
            ${sickHours > 0 ? ` · <strong> Sygdom:</strong> ${sickHours.toFixed(1)} timer` : ''}
        </div>`;
        return breakdown;
    },

    // Skift til dagvisning for en bestemt dag (fra kalenderen)
    jumpToDay(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        this.selectedDate = new Date(y, m - 1, d);
        document.getElementById('selectedDate').valueAsDate = this.selectedDate;
        this.changeView('day');
    },

    renderWorkshopView() {
        const container = document.getElementById('workshopView');
        const month = MONTH_NAMES[this.selectedDate.getMonth()];
        const year = this.selectedDate.getFullYear();
        
        // Værksted = intern tid (ingen ordre), ekskl. sygdom
        const workshopEntries = this.timeEntries.filter(e => !e.order_id && getTimeType(e) !== 'sick');
        const totalHours = workshopEntries.reduce((s, e) => s + hoursOf(e), 0);
        
        // Grupper pr. bruger
        const byUser = {};
        workshopEntries.forEach(e => {
            const name = e.user_name || 'Mig';
            if (!byUser[name]) byUser[name] = { total: 0, count: 0 };
            byUser[name].total += hoursOf(e);
            byUser[name].count++;
        });
        
        let rows = '';
        const names = Object.keys(byUser);
        if (names.length > 0) {
            names.sort((a, b) => byUser[b].total - byUser[a].total).forEach(name => {
                const u = byUser[name];
                rows += `<tr style="border-top:1px solid var(--border-soft);">
                    <td style="padding:10px;">${name}</td>
                    <td style="text-align:center;">${u.count} reg.</td>
                    <td style="text-align:center;font-weight:700;">${u.total.toFixed(1)} t</td>
                </tr>`;
            });
        } else {
            rows = `<tr><td colspan="3" style="padding:15px;color:var(--text-muted);text-align:center;">Ingen værkstedstimer registreret i ${month}.</td></tr>`;
        }
        
        container.innerHTML = `
            <div class="timeline-container">
                <div class="timeline-header">
                    <h2> Værksted (intern tid) - ${month} ${year}</h2>
                    <p style="color:var(--text-muted);margin:5px 0 0;">Tid uden for ordre: feje lager, rydde op, vedligehold osv.</p>
                </div>
                <div class="summary-card" style="text-align:center;margin-bottom:15px;">
                    <h3> Total</h3>
                    <div class="summary-stat">${totalHours.toFixed(1)}</div>
                    <div class="summary-label">værkstedstimer i ${month}</div>
                </div>
                <table style="width:100%;border-collapse:collapse;">
                    <tr style="text-align:left;color:var(--text-muted);font-size:12px;">
                        <th style="padding:8px;">Medarbejder</th>
                        <th style="text-align:center;">Registreringer</th>
                        <th style="text-align:center;">Timer</th>
                    </tr>
                    ${rows}
                </table>
            </div>
        `;
    },

    changeView(view) {
        this.currentView = view;
        
        // Update buttons (kun view-toggle, ikke modalens type-toggle)
        document.querySelectorAll('.view-toggle button:not(.type-toggle button)').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`view${view.charAt(0).toUpperCase() + view.slice(1)}`).classList.add('active');
        // Show/hide views
        document.getElementById('dayView').style.display = view === 'day' ? 'block' : 'none';
        document.getElementById('weekView').style.display = view === 'week' ? 'block' : 'none';
        document.getElementById('monthView').style.display = view === 'month' ? 'block' : 'none';
        document.getElementById('workshopView').style.display = view === 'workshop' ? 'block' : 'none';
        
        this.loadTimeEntries();
    },

    navigateDate(direction) {
        if (this.currentView === 'day') {
            this.selectedDate.setDate(this.selectedDate.getDate() + direction);
        } else if (this.currentView === 'week') {
            this.selectedDate.setDate(this.selectedDate.getDate() + (direction * 7));
        } else if (this.currentView === 'month' || this.currentView === 'workshop') {
            this.selectedDate.setMonth(this.selectedDate.getMonth() + direction);
        }
        
        document.getElementById('selectedDate').valueAsDate = this.selectedDate;
        this.loadTimeEntries();
        this.initDayView();
    },

    openCreateModal() {
        document.getElementById('modalTitle').textContent = 'Ny Timeregistrering';
        document.getElementById('timeEntryForm').reset();
        document.getElementById('entryDate').valueAsDate = this.selectedDate;
        document.getElementById('editingTimeEntryId').value = '';
        document.getElementById('deleteBtn').classList.add('hidden-field');
        this.setEntryType('order');
        document.getElementById('timeCalculation').classList.add('hidden-field');
        document.getElementById('timeEntryModal').classList.add('active');
        
        this.loadOrders();
    },

    async loadOrders() {
        const orderSelect = document.getElementById('orderId');
        orderSelect.innerHTML = '<option value="">Indlæser ordre...</option>';
        
        try {
            // Fetch ALL orders and filter client-side for accepted ones
            const response = await fetch('/api/quotes', {
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            
            // Filter for accepted orders (status = 'accepted')
            // Exclude extra work orders to prevent duplicates (only show main orders)
            const acceptedOrders = data.filter(q => q.status === 'accepted' && !q.is_extra_work && !q.parent_order_id);
            
            orderSelect.innerHTML = '<option value="">Vælg ordre</option>';
            
            if (acceptedOrders.length > 0) {
                acceptedOrders.forEach(order => {
                    const option = document.createElement('option');
                    option.value = order.id;
                    option.textContent = `${order.order_number || order.quote_number} - ${order.customer_name}`;
                    orderSelect.appendChild(option);
                });
            } else {
                orderSelect.innerHTML = '<option value="">Ingen accepterede ordre (accepter først en ordre)</option>';
            }
        } catch (error) {
            console.error('Error loading orders:', error);
            orderSelect.innerHTML = '<option value="">Kunne ikke indlæse ordre</option>';
        }
    },

    // Segmenteret typevælger: Ordre | Værksted | Sygdom
    setEntryType(type) {
        const valid = ['order', 'workshop', 'sick'];
        if (!valid.includes(type)) type = 'order';
        document.getElementById('entryTypeInput').value = type;

        document.getElementById('typeOrder').classList.toggle('active', type === 'order');
        document.getElementById('typeWorkshop').classList.toggle('active', type === 'workshop');
        document.getElementById('typeSick').classList.toggle('active', type === 'sick');

        // Vis/skjul felter der ikke hoerer til typen og nulstil dem
        document.getElementById('orderSelectGroup').classList.toggle('hidden-field', type !== 'order');
        document.getElementById('materialGroup').classList.toggle('hidden-field', type === 'sick');
        if (type !== 'order') document.getElementById('orderId').value = '';
        if (type === 'sick') {
            // Sygdom bruger automatisk materialet "Sygdom" (nr. 1) i baggrunden
            document.getElementById('materialKind').value = 'normal';
        }
        this.clearFieldErrors();
        this.calculateDuration();
    },

    getFormEntryType() {
        const t = document.getElementById('entryTypeInput').value;
        return ['order', 'workshop', 'sick'].includes(t) ? t : 'order';
    },

    clearFieldErrors() {
        document.querySelectorAll('#timeEntryForm .input-error').forEach(el => el.classList.remove('input-error'));
    },

    markFieldError(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('input-error');
    },

    calculateDuration() {
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;
        
        if (!startTime || !endTime) return;
        
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        
        const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
        const durationMinutes = totalMinutes; // NO automatic lunch deduction
        const durationHours = (durationMinutes / 60).toFixed(2);
        
        if (durationHours > 0) {
            document.getElementById('calculatedHours').textContent = durationHours;
            document.getElementById('timeCalculation').classList.remove('hidden-field');
            
            // Find material price based on type
            // Sygdom -> materiale nr. 1; ellers timetype-vaelgeren (alm./overtid)
            const timeType = this.getFormEntryType() === 'sick' ? 'sick' : document.getElementById('materialKind').value;
            let materialNumber = TIME_MATERIALS.normal; // Default: Montørtimer
            if (timeType === 'overtime') materialNumber = TIME_MATERIALS.overtime;
            if (timeType === 'sick') materialNumber = TIME_MATERIALS.sick;
            
            // String()-sammenligning: DB kan returnere materiale-nummer som tal eller tekst
            const material = this.materials.find(m => String(m.material_number) === String(materialNumber));
            
            if (material) {
                const cost = (durationHours * material.cost_price).toFixed(2);
                const sale = (durationHours * material.sales_price).toFixed(2);
                document.getElementById('calculatedCost').textContent = cost;
                document.getElementById('calculatedSale').textContent = sale;
                document.getElementById('selectedMaterialId').value = material.id;
            } else {
                console.warn('Materiale ikke fundet for nr.', materialNumber,
                    '| Materialer hentet:', this.materials.length,
                    '| Numre:', this.materials.map(m => m.material_number).join(', '));
            }
        } else {
            document.getElementById('timeCalculation').classList.add('hidden-field');
        }
    },

    updateMaterialSelection() {
        this.calculateDuration();
    },

    async saveTimeEntry(event) {
        event.preventDefault();
        this.clearFieldErrors();
        
        const entryType = this.getFormEntryType();
        const orderId = entryType === 'order' ? document.getElementById('orderId').value : null;
        
        // Soerg for at materialet er valgt (Sygdom saettes automatisk)
        this.calculateDuration();
        const materialId = document.getElementById('selectedMaterialId').value;
        
        let hasError = false;
        if (!document.getElementById('entryDate').value) {
            this.markFieldError('entryDate'); hasError = true;
        }
        if (!document.getElementById('startTime').value) {
            this.markFieldError('startTime'); hasError = true;
        }
        if (!document.getElementById('endTime').value) {
            this.markFieldError('endTime'); hasError = true;
        }
        if (hasError) {
            alert('Udfyld alle påkrævede felter (markeret med rødt).');
            return;
        }
        
        if (!materialId) {
            const timeType = entryType === 'sick' ? 'sick' : document.getElementById('materialKind').value;
            const names = { normal: 'Montørtimer (8000)', overtime: 'Montørtimer weekend/overarbejde (8001)', sick: 'Sygdom (1)' };
            alert(`Materialet for "${names[timeType] || timeType}" findes ikke.\n\nGå til Materialer-siden og tjek at disse findes:\n- Materiale 8000: Montørtimer\n- Materiale 8001: Montørtimer weekend/overarbejde\n- Materiale 1: Sygdom`);
            return;
        }
        
        if (entryType === 'order' && !orderId) {
            this.markFieldError('orderId');
            alert('Vælg venligst en ordre at registrere tiden på.');
            return;
        }
        
        const timeEntryData = {
            order_id: orderId || null,
            material_id: parseInt(materialId),
            date: document.getElementById('entryDate').value,
            start_time: document.getElementById('startTime').value,
            end_time: document.getElementById('endTime').value,
            notes: document.getElementById('notes').value,
            entry_type: entryType
        };
        
        try {
            const editingId = document.getElementById('editingTimeEntryId').value;
            
            if (editingId) {
                await TimeEntries.update(editingId, timeEntryData);
                alert('Timeregistrering opdateret!');
            } else {
                await TimeEntries.create(timeEntryData);
                alert('Timeregistrering oprettet!');
            }
            
            this.closeModal();
            await this.loadTimeEntries();
        } catch (error) {
            console.error('Error saving time entry:', error);
            alert('Fejl: ' + (error.message || 'Kunne ikke gemme timeregistrering'));
        }
    },

    async editTimeEntry(entry) {
        document.getElementById('modalTitle').textContent = 'Rediger Timeregistrering';
        document.getElementById('entryDate').value = entry.date;
        document.getElementById('startTime').value = entry.start_time;
        document.getElementById('endTime').value = entry.end_time;
        document.getElementById('notes').value = entry.notes || '';
        document.getElementById('editingTimeEntryId').value = entry.id;
        
        // Typen: gemt entry_type, fallback udledes af ordre/materiale (gamle data)
        let entryType = entry.entry_type;
        if (!['order', 'workshop', 'sick'].includes(entryType)) {
            if (entry.order_id) entryType = 'order';
            else if ((entry.material_name || '').toLowerCase().includes('sygdom')) entryType = 'sick';
            else entryType = 'workshop';
        }
        
        // Timetype ud fra materialet (8000=alm, 8001=overtid, 1=sygdom)
        const timeKind = getTimeType(entry) === 'overtime' ? 'overtime' : 'normal';
        document.getElementById('materialKind').value = timeKind;
        
        this.setEntryType(entryType);
        
        if (!entry.is_locked || this.currentUser.is_admin) {
            document.getElementById('deleteBtn').classList.remove('hidden-field');
        }
        
        document.getElementById('timeEntryModal').classList.add('active');
    },

    async deleteTimeEntry() {
        const entryId = document.getElementById('editingTimeEntryId').value;
        
        if (!confirm('Er du sikker på at du vil slette denne timeregistrering?')) {
            return;
        }
        
        try {
            await TimeEntries.delete(entryId);
            alert(' Timeregistrering slettet!');
            this.closeModal();
            await this.loadTimeEntries();
        } catch (error) {
            alert(' ' + (error.message || 'Kunne ikke slette'));
        }
    },

    closeModal() {
        document.getElementById('timeEntryModal').classList.remove('active');
    },

    exportToPDF() {
        alert(' PDF Export kommer snart!');
    }
};

// Export globally for dashboard to access
window.timePage = timePage;

// Wait for elements to exist before initializing
function waitForElements() {
    const checkElements = () => {
        if (document.getElementById('selectedDate') && document.getElementById('timeEntryModal')) {
            timePage.init();
            
            // Setup modal close listener
            document.getElementById('timeEntryModal').addEventListener('click', (e) => {
                if (e.target.id === 'timeEntryModal') {
                    timePage.closeModal();
                }
            });
        } else {
            setTimeout(checkElements, 50);
        }
    };
    checkElements();
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForElements);
} else {
    waitForElements();
}
