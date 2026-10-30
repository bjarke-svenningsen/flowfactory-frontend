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
            alert('❌ Kunne ikke hente timeregistreringer: ' + (error.message || 'Ukendt fejl'));
        }
    },

    initDayView() {
        const hoursContainer = document.getElementById('timelineHours');
        const blocksContainer = document.getElementById('timelineBlocks');
        
        // Create hour labels (0-23)
        let hoursHTML = '';
        let rowsHTML = '';
        for (let i = 0; i < 24; i++) {
            hoursHTML += `<div class="hour-label">${String(i).padStart(2, '0')}:00</div>`;
            rowsHTML += `<div class="timeline-row"></div>`;
        }
        
        hoursContainer.innerHTML = hoursHTML;
        blocksContainer.innerHTML = rowsHTML;
        
        // Update title
        const dayNames = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
        const monthNames = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
        document.getElementById('dayTitle').textContent = 
            `${dayNames[this.selectedDate.getDay()]} ${this.selectedDate.getDate()}. ${monthNames[this.selectedDate.getMonth()]} ${this.selectedDate.getFullYear()}`;
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
    },

    renderDayView() {
        const blocksContainer = document.getElementById('timelineBlocks');
        blocksContainer.querySelectorAll('.time-block').forEach(el => el.remove());
        
        // Render time blocks
        this.timeEntries.forEach(entry => {
            const block = this.createTimeBlock(entry);
            blocksContainer.appendChild(block);
        });
    },

    createTimeBlock(entry) {
        const div = document.createElement('div');
        div.className = 'time-block';
        
        // Check material type for styling
        if (entry.material_number === TIME_MATERIALS.overtime) {
            div.classList.add('overtime'); // Mørk grøn
        } else if (entry.material_number === TIME_MATERIALS.sick) {
            div.classList.add('sick'); // Rød
        }
        // Normal timer (8000) bruger standard lys grøn styling
        
        // Check if locked
        if (entry.is_locked) {
            div.classList.add('locked');
        }
        
        // Calculate position
        const [startHour, startMin] = entry.start_time.split(':').map(Number);
        const [endHour, endMin] = entry.end_time.split(':').map(Number);
        
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        const durationMinutes = endMinutes - startMinutes;
        
        const top = (startMinutes / 60) * 50; // 50px per hour
        const height = (durationMinutes / 60) * 50;
        
        div.style.top = `${top}px`;
        div.style.height = `${height}px`;
        
        div.innerHTML = `
            <div class="block-info">${entry.quote_number || 'Intern'} - ${entry.material_name}</div>
            <div class="block-time">${entry.start_time} - ${entry.end_time} (${entry.duration_hours}t)</div>
        `;
        
        div.onclick = () => this.editTimeEntry(entry);
        
        return div;
    },

    renderWeekView() {
        const container = document.getElementById('weekView');
        
        // Grupper registreringer pr. dag (mandag-først)
        const monday = getWeekStart(this.selectedDate);
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const iso = fmtDate(d);
            const entries = this.timeEntries.filter(e => e.date === iso);
            days.push({ date: d, iso, entries });
        }
        
        let html = `<div class="week-day-header" style="background:#f5f5f5;color:#666;">Uge ${getWeekNumber(monday)}</div>`;
        days.forEach(day => {
            const isToday = fmtDate(new Date()) === day.iso;
            const todayStyle = isToday ? 'background:var(--color-accent);color:var(--color-dark);border:2px solid var(--color-accent);' : '';
            html += `<div class="week-day-header" style="${todayStyle}">
                ${DAY_NAMES[day.date.getDay()]}<br>
                <span style="font-weight:400;font-size:12px;">${day.date.getDate()}. ${MONTH_NAMES[day.date.getMonth()]}</span>
            </div>`;
        });
        
        // Registreringer pr. dag (én række pr. slot)
        const maxEntries = Math.max(1, ...days.map(d => d.entries.length));
        for (let row = 0; row < maxEntries; row++) {
            html += '<div></div>'; // hjørnecelle
            days.forEach(day => {
                const entry = day.entries[row];
                if (!entry) {
                    html += '<div class="week-day-column"></div>';
                    return;
                }
                const type = getTimeType(entry);
                const cls = type === 'overtime' ? 'overtime' : (type === 'sick' ? 'sick' : '');
                const label = entry.order_number || entry.quote_number || '🔧 Værksted';
                html += `<div class="week-day-column">
                    <div class="week-time-block ${cls}" onclick="timePage.editTimeEntryById(${entry.id})">
                        <strong>${hoursOf(entry).toFixed(1)} t</strong><br>
                        ${label}<br>
                        ${entry.material_name || ''}<br>
                        ${entry.start_time}-${entry.end_time}
                    </div>
                </div>`;
            });
        }
        
        // Dagtotaler + ugetotal i bunden
        html += `<div class="week-day-header" style="background:#fafafa;color:#666;">I alt</div>`;
        days.forEach(day => {
            const dayHours = day.entries.reduce((s, e) => s + hoursOf(e), 0);
            html += `<div style="text-align:center;padding:10px;background:#fafafa;border-left:1px solid #f0f0f0;font-weight:700;color:${dayHours > 0 ? '#2e7d32' : '#ccc'};">${dayHours > 0 ? dayHours.toFixed(1) + ' t' : '–'}</div>`;
        });
        
        const weekHours = this.timeEntries.reduce((s, e) => s + hoursOf(e), 0);
        const overtimeHours = this.timeEntries.filter(e => getTimeType(e) === 'overtime').reduce((s, e) => s + hoursOf(e), 0);
        const sickHours = this.timeEntries.filter(e => getTimeType(e) === 'sick').reduce((s, e) => s + hoursOf(e), 0);
        html += `<div style="grid-column: 1 / -1; padding: 15px 20px; background: white; border-top: 2px solid #f0f0f0; font-weight: 600;">
            Uge ${getWeekNumber(monday)} i alt: ${weekHours.toFixed(1)} timer
            ${overtimeHours > 0 ? ` · 🔥 Overtid: ${overtimeHours.toFixed(1)} t` : ''}
            ${sickHours > 0 ? ` · 🤒 Sygdom: ${sickHours.toFixed(1)} t` : ''}
        </div>`;
        
        container.innerHTML = html;
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
        const overtimeHours = this.timeEntries.filter(e => getTimeType(e) === 'overtime').reduce((s, e) => s + hoursOf(e), 0);
        const sickHours = this.timeEntries.filter(e => getTimeType(e) === 'sick').reduce((s, e) => s + hoursOf(e), 0);
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
        calHtml += '<div class="week-day-header" style="background:#f5f5f5;color:#666;font-size:11px;">Uge</div>';
        ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].forEach(n => {
            calHtml += `<div class="week-day-header">${n}</div>`;
        });
        
        for (let i = 0; i < cells.length; i += 7) {
            const weekFirst = cells[i];
            calHtml += `<div style="display:flex;align-items:center;justify-content:center;background:#fafafa;color:#999;font-size:11px;">${weekFirst ? 'U' + getWeekNumber(weekFirst) : ''}</div>`;
            for (let j = 0; j < 7; j++) {
                calHtml += this.renderMonthCell(cells[i + j], todayIso);
            }
        }
        calHtml += '</div>';
        
        const breakdown = this.renderOrderBreakdown(workshopHours, sickHours);
        
        container.innerHTML = `
            <div class="month-summary">
                <div class="summary-card">
                    <h3>📊 Total Timer</h3>
                    <div class="summary-stat">${totalHours.toFixed(1)}</div>
                    <div class="summary-label">timer i ${MONTH_NAMES[month]}</div>
                </div>
                <div class="summary-card">
                    <h3>⏱️ Montørtimer</h3>
                    <div class="summary-stat">${normalHours.toFixed(1)}</div>
                    <div class="summary-label">almindelige timer</div>
                </div>
                <div class="summary-card">
                    <h3>🔥 Overtid</h3>
                    <div class="summary-stat">${overtimeHours.toFixed(1)}</div>
                    <div class="summary-label">weekend/overarbejde</div>
                </div>
                <div class="summary-card">
                    <h3>🔧 Værksted</h3>
                    <div class="summary-stat">${workshopHours.toFixed(1)}</div>
                    <div class="summary-label">intern tid</div>
                </div>
            </div>
            <div class="summary-card">
                <h3>📋 Detaljer Per Ordre</h3>
                ${breakdown}
            </div>
            ${calHtml}
        `;
    },

    renderMonthCell(d, todayIso) {
        if (!d) return '<div style="border-left:1px solid #f0f0f0;background:#fafafa;min-height:70px;"></div>';
        
        const iso = fmtDate(d);
        const dayEntries = this.timeEntries.filter(e => e.date === iso);
        const dayHours = dayEntries.reduce((s, e) => s + hoursOf(e), 0);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const isToday = iso === todayIso;
        
        let style = `border-left:1px solid #f0f0f0;min-height:70px;padding:8px;cursor:pointer;background:${isWeekend ? '#fafafa' : 'white'};`;
        if (isToday) style += 'box-shadow: inset 0 0 0 2px var(--color-accent-hover);';
        
        let content = `<div style="font-size:12px;color:${isToday ? 'var(--color-accent-hover)' : '#999'};font-weight:600;">${d.getDate()}</div>`;
        if (dayHours > 0) {
            const hasOvertime = dayEntries.some(e => getTimeType(e) === 'overtime');
            const hasSick = dayEntries.some(e => getTimeType(e) === 'sick');
            const color = hasSick ? '#e53935' : (hasOvertime ? '#2e7d32' : '#43a047');
            content += `<div style="font-weight:700;color:${color};">${dayHours.toFixed(1)} t</div>`;
            content += `<div style="font-size:10px;color:#666;margin-top:3px;">${dayEntries.length} reg.</div>`;
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
            breakdown += '<tr style="text-align:left;color:#999;font-size:12px;"><th style="padding:8px;">Ordre</th><th>Alm. timer</th><th>Overtid</th><th>Total</th></tr>';
            orderKeys.sort((a, b) => byOrder[b].total - byOrder[a].total).forEach(key => {
                const o = byOrder[key];
                breakdown += `<tr style="border-top:1px solid #f0f0f0;">
                    <td style="padding:8px;">${key}</td>
                    <td style="text-align:center;">${o.normal.toFixed(1)}</td>
                    <td style="text-align:center;">${o.overtime.toFixed(1)}</td>
                    <td style="text-align:center;font-weight:700;">${o.total.toFixed(1)}</td>
                </tr>`;
            });
            breakdown += '</table>';
        } else {
            breakdown = '<p style="color:#999;margin-top:10px;">Ingen ordre-timer registreret denne måned.</p>';
        }
        
        breakdown += `<div style="margin-top:15px;padding:12px;background:#f5f5f5;border-radius:8px;">
            <strong>🔧 Værksted (intern tid):</strong> ${workshopHours.toFixed(1)} timer
            ${sickHours > 0 ? ` · <strong>🤒 Sygdom:</strong> ${sickHours.toFixed(1)} timer` : ''}
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
                rows += `<tr style="border-top:1px solid #f0f0f0;">
                    <td style="padding:10px;">${name}</td>
                    <td style="text-align:center;">${u.count} reg.</td>
                    <td style="text-align:center;font-weight:700;">${u.total.toFixed(1)} t</td>
                </tr>`;
            });
        } else {
            rows = `<tr><td colspan="3" style="padding:15px;color:#999;text-align:center;">Ingen værkstedstimer registreret i ${month}.</td></tr>`;
        }
        
        container.innerHTML = `
            <div class="timeline-container">
                <div class="timeline-header">
                    <h2>🔧 Værksted (intern tid) - ${month} ${year}</h2>
                    <p style="color:#666;margin:5px 0 0;">Tid uden for ordre: feje lager, rydde op, vedligehold osv.</p>
                </div>
                <div class="summary-card" style="text-align:center;margin-bottom:15px;">
                    <h3>📊 Total</h3>
                    <div class="summary-stat">${totalHours.toFixed(1)}</div>
                    <div class="summary-label">værkstedstimer i ${month}</div>
                </div>
                <table style="width:100%;border-collapse:collapse;">
                    <tr style="text-align:left;color:#999;font-size:12px;">
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
        
        // Update buttons
        document.querySelectorAll('.view-toggle button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`view${view.charAt(0).toUpperCase() + view.slice(1)}`).classList.add('active');
        // Show/hide views
        document.getElementById('dayView').style.display = view === 'day' ? 'block' : 'none';
        document.getElementById('weekView').style.display = view === 'week' ? 'grid' : 'none';
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
        document.getElementById('deleteBtn').style.display = 'none';
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

    toggleEntryType() {
        const entryType = document.querySelector('input[name="entryType"]:checked').value;
        const orderGroup = document.getElementById('orderSelectGroup');
        
        if (entryType === 'order') {
            orderGroup.style.display = 'block';
            document.getElementById('orderId').required = true;
        } else {
            orderGroup.style.display = 'none';
            document.getElementById('orderId').required = false;
        }
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
            document.getElementById('timeCalculation').style.display = 'block';
            
            // Find material price based on type
            const timeType = document.querySelector('input[name="timeType"]:checked').value;
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
            document.getElementById('timeCalculation').style.display = 'none';
        }
    },

    updateMaterialSelection() {
        this.calculateDuration();
    },

    async saveTimeEntry(event) {
        event.preventDefault();
        
        const entryType = document.querySelector('input[name="entryType"]:checked').value;
        const orderId = entryType === 'order' ? document.getElementById('orderId').value : null;
        const materialId = document.getElementById('selectedMaterialId').value;
        
        if (!materialId) {
            // Better error message
            const timeType = document.querySelector('input[name="timeType"]:checked').value;
            const names = { normal: 'Montørtimer (8000)', overtime: 'Montørtimer weekend/overarbejde (8001)', sick: 'Sygdom (1)' };
            alert(`❌ Materiale for "${names[timeType] || timeType}" findes ikke!\n\nGå til Materialer-siden og tjek at disse findes:\n- Materiale 8000: Montørtimer\n- Materiale 8001: Montørtimer weekend/overarbejde\n- Materiale 1: Sygdom`);
            return;
        }
        
        if (entryType === 'order' && !orderId) {
            alert('❌ Vælg venligst en ordre at registrere tiden på');
            return;
        }
        
        const timeEntryData = {
            order_id: orderId || null,
            material_id: parseInt(materialId),
            date: document.getElementById('entryDate').value,
            start_time: document.getElementById('startTime').value,
            end_time: document.getElementById('endTime').value,
            notes: document.getElementById('notes').value
        };
        
        try {
            const editingId = document.getElementById('editingTimeEntryId').value;
            
            if (editingId) {
                await TimeEntries.update(editingId, timeEntryData);
                alert('✅ Timeregistrering opdateret!');
            } else {
                await TimeEntries.create(timeEntryData);
                alert('✅ Timeregistrering oprettet!');
            }
            
            this.closeModal();
            await this.loadTimeEntries();
        } catch (error) {
            console.error('Error saving time entry:', error);
            alert('❌ Fejl: ' + (error.message || 'Kunne ikke gemme timeregistrering'));
        }
    },

    async editTimeEntry(entry) {
        document.getElementById('modalTitle').textContent = 'Rediger Timeregistrering';
        document.getElementById('entryDate').value = entry.date;
        document.getElementById('startTime').value = entry.start_time;
        document.getElementById('endTime').value = entry.end_time;
        document.getElementById('notes').value = entry.notes || '';
        document.getElementById('editingTimeEntryId').value = entry.id;
        
        if (entry.order_id) {
            document.querySelector('input[name="entryType"][value="order"]').checked = true;
        } else {
            document.querySelector('input[name="entryType"][value="internal"]').checked = true;
        }
        
        // Sæt tidstype ud fra materialet (8000=alm, 8001=overtid, 1=sygdom)
        const typeInput = document.querySelector(`input[name="timeType"][value="${getTimeType(entry)}"]`);
        if (typeInput) typeInput.checked = true;
        
        this.toggleEntryType();
        this.calculateDuration();
        
        if (!entry.is_locked || this.currentUser.is_admin) {
            document.getElementById('deleteBtn').style.display = 'inline-block';
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
            alert('✅ Timeregistrering slettet!');
            this.closeModal();
            await this.loadTimeEntries();
        } catch (error) {
            alert('❌ ' + (error.message || 'Kunne ikke slette'));
        }
    },

    closeModal() {
        document.getElementById('timeEntryModal').classList.remove('active');
    },

    exportToPDF() {
        alert('📄 PDF Export kommer snart!');
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
