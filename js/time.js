// time.js - Minimal version for timeregistrering
import { Auth, TimeEntries, Materials } from './api.js';

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
            const response = await fetch('https://flowfactory-frontend.onrender.com/api/users', {
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
            const startDate = this.selectedDate.toISOString().split('T')[0];
            this.timeEntries = await TimeEntries.getAll({ start_date: startDate, end_date: startDate });
            this.renderCurrentView();
        } catch (error) {
            console.error('Error loading time entries:', error);
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
        
        // Check if overtime
        if (entry.material_number === '1001') {
            div.classList.add('overtime');
        }
        
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
        alert('Uge-visning kommer snart!');
    },

    renderMonthView() {
        alert('Måned-visning kommer snart!');
    },

    changeView(view) {
        this.currentView = view;
        
        // Update buttons
        document.querySelectorAll('.view-toggle button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`view${view.charAt(0).toUpperCase() + view.slice(1)}`).classList.add('active');
        
        // Show/hide views
        document.getElementById('dayView').style.display = view === 'day' ? 'block' : 'none';
        document.getElementById('weekView').style.display = view === 'week' ? 'block' : 'none';
        document.getElementById('monthView').style.display = view === 'month' ? 'block' : 'none';
        
        this.renderCurrentView();
    },

    navigateDate(direction) {
        if (this.currentView === 'day') {
            this.selectedDate.setDate(this.selectedDate.getDate() + direction);
        } else if (this.currentView === 'week') {
            this.selectedDate.setDate(this.selectedDate.getDate() + (direction * 7));
        } else if (this.currentView === 'month') {
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
            const response = await fetch('https://flowfactory-frontend.onrender.com/api/quotes', {
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            
            // Filter for accepted orders (status = 'accepted')
            const acceptedOrders = data.filter(q => q.status === 'accepted');
            
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
            
            // Find material price
            const timeType = document.querySelector('input[name="timeType"]:checked').value;
            const material = this.materials.find(m => 
                m.material_number === (timeType === 'overtime' ? '1001' : '1000')
            );
            
            if (material) {
                const cost = (durationHours * material.cost_price).toFixed(2);
                const sale = (durationHours * material.sales_price).toFixed(2);
                document.getElementById('calculatedCost').textContent = cost;
                document.getElementById('calculatedSale').textContent = sale;
                document.getElementById('selectedMaterialId').value = material.id;
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
            const materialNumber = timeType === 'overtime' ? '1001' : '1000';
            alert(`❌ Materiale ${materialNumber} (${timeType === 'overtime' ? 'Overtid' : 'Alm. timer'}) findes ikke!\n\nGå til Materialer-siden og opret:\n- Materiale 1000: Alm. timer (kost: 300, salg: 525)\n- Materiale 1001: Overtid (kost: 400, salg: 700)`);
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
