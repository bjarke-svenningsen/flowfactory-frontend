// js/quotes/quotes-core.js - Core quote management functionality

let allQuotes = [];
let currentQuote = null;
let currentView = 'list'; // 'list', 'create', 'edit', 'preview'
let currentQuoteFilter = 'all';
let currentOrderTab = 'quotes';

// Load quotes
async function loadQuotes() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/quotes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load quotes');
        
        const allFetchedQuotes = await response.json();
        // Filter to only show draft and sent quotes (not accepted or rejected)
        allQuotes = allFetchedQuotes.filter(q => q.status === 'draft' || q.status === 'sent');
        renderQuotesList();
    } catch (error) {
        console.error('Error loading quotes:', error);
        alert('Kunne ikke indlæse tilbud: ' + error.message);
    }
}

// Render quotes list
function renderQuotesList() {
    const container = document.getElementById('quotesListContainer');
    // BUG FIX: Guard clause - only render if container exists
    if (!container) {
        console.warn('quotesListContainer not found, cannot render quotes list');
        return;
    }

    // Filter quotes by status
    let filteredQuotes = allQuotes;
    if (currentQuoteFilter !== 'all') {
        filteredQuotes = allQuotes.filter(q => q.status === currentQuoteFilter);
    }
    
    if (filteredQuotes.length === 0) {
        container.innerHTML = `
            <div class="card">
                <div class="empty-state">
                    <i data-lucide="file-text"></i>
                    <h3 style="margin: 0;">Ingen tilbud endnu</h3>
                    <span>Opret dit første tilbud for at komme i gang</span>
                    <button onclick="showCreateQuote()" class="btn btn-primary" style="margin-top: 8px;">
                        <i data-lucide="plus"></i> Opret Tilbud
                    </button>
                </div>
            </div>
        `;
        return;
    }
    
    const statusPillClass = {
        'draft': 'badge--draft',
        'sent': 'badge--sent',
        'accepted': 'badge--accepted',
        'rejected': 'badge--rejected'
    };
    
    const statusText = {
        'draft': 'Udkast',
        'sent': 'Sendt',
        'accepted': 'Accepteret',
        'rejected': 'Afvist'
    };
    
    container.innerHTML = `
        <div class="card table-card">
        <table class="table">
            <thead>
                <tr>
                    <th style="width: 120px;">Ordre Nr.</th>
                    <th>Kunde</th>
                    <th>Titel</th>
                    <th style="width: 110px;">Dato</th>
                    <th class="num" style="width: 130px;">Total</th>
                    <th style="width: 150px;">Status</th>
                    <th style="width: 180px;">Handlinger</th>
                </tr>
            </thead>
            <tbody>
                ${filteredQuotes.map(quote => {
                    // Display order number instead of quote number
                    const displayNumber = quote.order_number || quote.quote_number;
                    return `
                    <tr>
                        <td class="cell-strong">${displayNumber}</td>
                        <td class="truncate" style="max-width: 180px;" title="${quote.customer_name || ''}">${quote.customer_name}</td>
                        <td class="truncate" style="max-width: 220px;" title="${quote.title || ''}">
                            ${quote.title}
                            <div class="cell-muted">Oprettet af ${quote.created_by_name || 'Ukendt'}</div>
                        </td>
                        <td>${new Date(quote.date).toLocaleDateString('da-DK')}</td>
                        <td class="num cell-strong">${formatCurrency(quote.total)}</td>
                        <td style="text-align: center;">
                            <span class="badge ${statusPillClass[quote.status] || 'badge--draft'}">
                                ${statusText[quote.status] || quote.status}
                            </span>
                        </td>
                        <td style="text-align: center; white-space: nowrap;">
                            <div style="display: inline-flex; gap: 6px; align-items: center;">
                                <button onclick="viewQuote(${quote.id})" class="btn btn-secondary btn-sm">
                                    <i data-lucide="eye"></i> Se
                                </button>
                                <div class="row-menu">
                                    <button onclick="toggleRowMenu(event, ${quote.id})" class="btn btn-secondary btn-sm btn-icon" aria-label="Flere handlinger">⋯</button>
                                <div id="rowMenu${quote.id}" class="row-menu-pop">
                                    <button onclick="closeRowMenus(); editQuote(${quote.id});">
                                        <i data-lucide="pencil"></i> Rediger
                                    </button>
                                    <button onclick="closeRowMenus(); acceptQuote(${quote.id});" class="row-menu-ok">
                                        <i data-lucide="check"></i> Acceptér
                                    </button>
                                    <button onclick="closeRowMenus(); rejectQuote(${quote.id});" class="row-menu-warn">
                                        <i data-lucide="x"></i> Afvis
                                    </button>
                                    <button onclick="closeRowMenus(); deleteQuote(${quote.id});" class="row-menu-danger">
                                        <i data-lucide="trash-2"></i> Slet
                                    </button>
                                </div>
                            </div>
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
        </div>
    `;
    if (window.lucide) {
        try { lucide.createIcons(); } catch (e) { /* ignore */ }
    }
}

// ⋯-menu på listerækker — vises FIXED under <body> så den aldrig klippes af overflow.
// Åbner opad hvis der ikke er plads nedenunder. Lukker ved klik udenfor, Escape og scroll.
function toggleRowMenu(event, id) {
    event.stopPropagation();
    const pop = document.getElementById(`rowMenu${id}`);
    if (!pop) return;
    const wasOpen = pop.classList.contains('floating');
    closeRowMenus();
    if (wasOpen) return;
    const trigger = event.currentTarget || event.target;
    pop.classList.add('floating');
    pop.classList.add('open');
    pop._trigger = trigger;
    document.body.appendChild(pop);
    positionRowMenu(pop);
    if (window.lucide) { try { lucide.createIcons(); } catch (e) { /* ignore */ } }
}

function positionRowMenu(pop) {
    const t = pop._trigger;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const mw = pop.offsetWidth || 180;
    const mh = pop.offsetHeight || 180;
    let left = r.right - mw;
    if (left < 8) left = 8;
    if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = r.top - mh - 6; // åbn opad
    if (top < 8) top = 8;
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
}

function closeRowMenus() {
    document.querySelectorAll('.row-menu-pop.floating').forEach(m => {
        m.classList.remove('open', 'floating');
        m.style.left = '';
        m.style.top = '';
    });
}

document.addEventListener('click', function (e) {
    if (!e.target.closest('.row-menu-pop')) closeRowMenus();
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeRowMenus();
});
window.addEventListener('scroll', closeRowMenus, true);
window.addEventListener('resize', closeRowMenus);

// Show create quote
function showCreateQuote() {
    currentView = 'create';
    currentQuote = {
        customer_id: null,
        title: '',
        valid_until: getDefaultValidUntil(),
        notes: '',
        terms: 'Netto 14 dage',
        lines: [createEmptyLine()]
    };
    renderQuoteForm();
}

// View quote - ALWAYS opens workspace for all statuses (draft, sent, accepted, rejected)
async function viewQuote(quoteId) {
    try {
        // Load the quote to check its status
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${quoteId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Kunne ikke indlæse tilbud');
        const quote = await response.json();

        if (quote.status === 'accepted') {
            // Accepted quotes are real orders - open the order workspace
            await openOrderWorkspace(quoteId);
        } else {
            // Draft/sent quotes - show the quote itself (preview), not the order workspace
            currentQuote = quote;
            currentView = 'preview';
            
            // Highlight the Tilbud tab (not Godkendte Ordre) — styres KUN af .active-klassen
            ['quotes', 'orders', 'invoiced', 'rejected', 'customers'].forEach(t => {
                const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
                if (btn) {
                    btn.classList.toggle('active', t === 'quotes');
                }
            });
            
            renderQuotePreview();
        }
    } catch (error) {
        console.error('Error loading quote:', error);
        alert('Kunne ikke indlæse tilbud: ' + error.message);
    }
}

// Edit quote
async function editQuote(quoteId) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${quoteId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load quote');
        
        currentQuote = await response.json();
        currentView = 'edit';
        renderQuoteForm();
    } catch (error) {
        console.error('Error loading quote:', error);
        alert('Kunne ikke indlæse tilbud: ' + error.message);
    }
}

// Delete quote
async function deleteQuote(quoteId) {
    if (!confirm('Er du sikker på at du vil slette dette tilbud?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${quoteId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to delete quote');
        
        alert('Tilbud slettet');
        await loadQuotes();
    } catch (error) {
        console.error('Error deleting quote:', error);
        alert('Kunne ikke slette tilbud: ' + error.message);
    }
}

// Send quote
async function sendQuote(quoteId) {
    if (!confirm('Send dette tilbud til kunden via email?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${quoteId}/send`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to send quote');
        }
        
        alert('Tilbud sendt til kunde');
        await loadQuotes();
    } catch (error) {
        console.error('Error sending quote:', error);
        alert('Kunne ikke sende tilbud: ' + error.message);
    }
}

// Back to list
function backToQuotesList() {
    currentView = 'list';
    currentQuote = null;
    document.getElementById('quotesListView').style.display = 'block';
    document.getElementById('quotesFormView').style.display = 'none';
    document.getElementById('quotesPreviewView').style.display = 'none';
    loadQuotes();
}

// Render quote form
function renderQuoteForm() {
    document.getElementById('quotesListView').style.display = 'none';
    document.getElementById('quotesFormView').style.display = 'block';
    document.getElementById('quotesPreviewView').style.display = 'none';
    document.getElementById('quotesCustomersView').style.display = 'none';
    
    const container = document.getElementById('quotesFormContainer');
    const isEdit = currentView === 'edit';
    const title = isEdit ? 'Rediger Tilbud' : 'Opret Nyt Tilbud';
    
    container.innerHTML = `
        <div style="background: var(--surface); padding: 30px; border-radius: 10px; max-width: 1200px;">
            <h2 style="margin-bottom: 30px;">${title}</h2>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kunde *</label>
                    <div style="display: flex; gap: 10px;">
                        <select id="quoteCustomer" onchange="loadQuoteContactPersons()" style="flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;" ${isEdit && currentQuote.id ? 'disabled' : ''}>
                            <option value="">Vælg kunde...</option>
                            ${allCustomers.map(c => `
                                <option value="${c.id}" ${currentQuote.customer_id === c.id ? 'selected' : ''}>
                                    ${c.company_name}
                                </option>
                            `).join('')}
                        </select>
                        <button onclick="showQuickCreateCustomer()" style="padding: 10px 20px; background: var(--color-green); color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                            Ny Kunde
                        </button>
                    </div>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kontaktperson</label>
                    <select id="quoteContactPerson" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                        <option value="">Vælg kontaktperson...</option>
                    </select>
                    <small style="color: var(--text-muted); display: block; margin-top: 5px;">Valgfrit - vælg specifik kontaktperson for dette tilbud</small>
                </div>
                
                <div style="grid-column: 1 / -1;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Tilbud Titel *</label>
                    <input type="text" id="quoteTitle" value="${currentQuote.title || ''}" placeholder="F.eks. Gulvlægning hovedkontor" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Gyldig til</label>
                    <input type="date" id="quoteValidUntil" value="${currentQuote.valid_until || getDefaultValidUntil()}" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Rekvisitionsnummer</label>
                    <input type="text" id="quoteReqNumber" value="${currentQuote.requisition_number || ''}" placeholder="Valgfrit" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                </div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">Tilbudslinjer</h3>
                    <button onclick="addQuoteLine()" class="btn btn-primary btn-sm">
                        Tilføj Linje
                    </button>
                </div>
                
                <div id="quoteLinesContainer"></div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Betalingsbetingelser</label>
                    <textarea id="quoteTerms" rows="3" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px; resize: vertical;">${currentQuote.terms || 'Netto 14 dage'}</textarea>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Interne Noter</label>
                    <textarea id="quoteNotes" rows="3" placeholder="Synlige kun for dig..." style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px; resize: vertical;">${currentQuote.notes || ''}</textarea>
                </div>
            </div>
            
            <div style="background: var(--surface-muted); padding: 20px; border-radius: 8px; margin-bottom: 30px;">
                <div style="display: flex; justify-content: flex-end; gap: 15px; font-size: 16px;">
                    <div>
                        <strong>Subtotal:</strong> <span id="quoteSubtotal">0,00 kr.</span>
                    </div>
                    <div>
                        <strong>Moms (25%):</strong> <span id="quoteVat">0,00 kr.</span>
                    </div>
                    <div style="font-size: 20px; color: var(--color-accent-hover);">
                        <strong>TOTAL:</strong> <span id="quoteTotal">0,00 kr.</span>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="backToQuotesList()" class="btn btn-secondary">
                    Annuller
                </button>
                <button onclick="saveQuote('draft')" class="btn btn-primary">
                    Gem som Udkast
                </button>
                <button onclick="saveAndPreviewQuote()" style="padding: 12px 24px; background: var(--color-green); color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                    Gem & Se Preview
                </button>
            </div>
        </div>
    `;
    
    renderQuoteLines();
    calculateTotals();
    
    // Load contacts if customer is already selected (edit mode)
    if (currentQuote.customer_id) {
        loadQuoteContactPersons();
    }
}

// Render quote lines
function renderQuoteLines() {
    const container = document.getElementById('quoteLinesContainer');
    
    if (!currentQuote.lines || currentQuote.lines.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Ingen linjer endnu. Klik "Tilføj Linje" for at komme i gang.</p>';
        return;
    }
    
    container.innerHTML = currentQuote.lines.map((line, index) => `
        <div style="background: var(--surface-muted); padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 2px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong>Linje ${index + 1}</strong>
                <button onclick="removeLine(${index})" class="btn btn-danger btn-sm" type="button">
                    <i data-lucide="trash-2"></i> Fjern
                </button>
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Beskrivelse *</label>
                <textarea id="lineDesc${index}" rows="2" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px; resize: vertical;" onchange="updateLine(${index})">${line.description || ''}</textarea>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 2fr; gap: 10px;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Antal *</label>
                    <input type="number" id="lineQty${index}" value="${line.quantity || 1}" min="0" step="0.01" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px;" onchange="updateLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Enhed *</label>
                    <select id="lineUnit${index}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px;" onchange="updateLine(${index})">
                        ${UNITS.map(unit => `<option value="${unit}" ${line.unit === unit ? 'selected' : ''}>${unit}</option>`).join('')}
                    </select>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">E.pris *</label>
                    <input type="number" id="linePrice${index}" value="${line.unit_price || 0}" min="0" step="0.01" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px;" onchange="updateLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Rabat %</label>
                    <input type="number" id="lineDiscount${index}" value="${line.discount_percent || 0}" min="0" max="100" step="0.1" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px;" onchange="updateLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Total</label>
                    <div id="lineTotal${index}" style="padding: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; font-size: 13px; font-weight: 600; color: var(--color-accent-hover);">
                        ${formatCurrency(calculateLineTotal(line))}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Add quote line
function addQuoteLine() {
    if (!currentQuote.lines) {
        currentQuote.lines = [];
    }
    currentQuote.lines.push(createEmptyLine());
    renderQuoteLines();
}

// Remove line
function removeLine(index) {
    if (confirm('Fjern denne linje?')) {
        currentQuote.lines.splice(index, 1);
        renderQuoteLines();
        calculateTotals();
    }
}

// Update line
function updateLine(index) {
    const line = currentQuote.lines[index];
    line.description = document.getElementById(`lineDesc${index}`).value;
    line.quantity = parseFloat(document.getElementById(`lineQty${index}`).value) || 0;
    line.unit = document.getElementById(`lineUnit${index}`).value;
    line.unit_price = parseFloat(document.getElementById(`linePrice${index}`).value) || 0;
    line.discount_percent = parseFloat(document.getElementById(`lineDiscount${index}`).value) || 0;
    
    // Update display
    document.getElementById(`lineTotal${index}`).textContent = formatCurrency(calculateLineTotal(line));
    calculateTotals();
}

// Calculate totals
function calculateTotals() {
    let subtotal = 0;
    
    if (currentQuote.lines) {
        currentQuote.lines.forEach(line => {
            subtotal += calculateLineTotal(line);
        });
    }
    
    const vat = subtotal * 0.25;
    const total = subtotal + vat;
    
    document.getElementById('quoteSubtotal').textContent = formatCurrency(subtotal);
    document.getElementById('quoteVat').textContent = formatCurrency(vat);
    document.getElementById('quoteTotal').textContent = formatCurrency(total);
}

// Load contact persons for quote form
async function loadQuoteContactPersons() {
    const customerId = document.getElementById('quoteCustomer').value;
    const contactSelect = document.getElementById('quoteContactPerson');
    
    if (!contactSelect) return;
    
    // Reset dropdown
    contactSelect.innerHTML = '<option value="">Vælg kontaktperson...</option>';
    
    if (!customerId) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/customers/${customerId}/contacts`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load contacts');
        
        const contacts = await response.json();
        
        // Populate dropdown
        contacts.forEach(contact => {
            const option = document.createElement('option');
            option.value = contact.id;
            option.textContent = contact.name + (contact.title ? ` - ${contact.title}` : '');
            if (contact.is_primary) {
                option.textContent += '  (primær)';
            }
            contactSelect.appendChild(option);
        });
        
        // If editing and contact_person_id is set, select it
        if (currentQuote && currentQuote.contact_person_id) {
            contactSelect.value = currentQuote.contact_person_id;
        } else if (contacts.length > 0) {
            // Otherwise select primary contact if exists
            const primaryContact = contacts.find(c => c.is_primary);
            if (primaryContact) {
                contactSelect.value = primaryContact.id;
            }
        }
        
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

// Save quote
async function saveQuote(status = 'draft') {
    const customer_id = document.getElementById('quoteCustomer').value;
    const contact_person_id = document.getElementById('quoteContactPerson')?.value || null;
    const title = document.getElementById('quoteTitle').value.trim();
    const valid_until = document.getElementById('quoteValidUntil').value;
    const requisition_number = document.getElementById('quoteReqNumber').value.trim();
    const terms = document.getElementById('quoteTerms').value.trim();
    const notes = document.getElementById('quoteNotes').value.trim();
    
    if (!customer_id) {
        alert('Vælg en kunde');
        return;
    }
    
    if (!title) {
        alert('Indtast en titel');
        return;
    }
    
    if (!currentQuote.lines || currentQuote.lines.length === 0) {
        alert('Tilføj mindst én linje');
        return;
    }
    
    // Validate lines
    for (let i = 0; i < currentQuote.lines.length; i++) {
        const line = currentQuote.lines[i];
        if (!line.description || !line.description.trim()) {
            alert(`Linje ${i + 1}: Beskrivelse mangler`);
            return;
        }
        if (!line.quantity || line.quantity <= 0) {
            alert(`Linje ${i + 1}: Antal skal være større end 0`);
            return;
        }
        if (!line.unit_price || line.unit_price < 0) {
            alert(`Linje ${i + 1}: Enhedspris skal være 0 eller højere`);
            return;
        }
    }
    
    const data = {
        customer_id: parseInt(customer_id),
        contact_person_id: contact_person_id ? parseInt(contact_person_id) : null,
        title,
        valid_until: valid_until || null,
        requisition_number: requisition_number || null,
        notes: notes || null,
        terms: terms || null,
        lines: currentQuote.lines,
        status
    };
    
    try {
        const token = sessionStorage.getItem('token');
        const url = currentView === 'edit' 
            ? `/api/quotes/${currentQuote.id}`
            : '/api/quotes';
        
        const method = currentView === 'edit' ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save quote');
        }
        
        const savedQuote = await response.json();
        
        alert(`Tilbud ${currentView === 'edit' ? 'opdateret' : 'oprettet'}!`);
        
        // Return quote ID for preview
        return savedQuote.id;
        
    } catch (error) {
        console.error('Save error:', error);
        alert('Kunne ikke gemme tilbud: ' + error.message);
        return null;
    }
}

// Save and preview
async function saveAndPreviewQuote() {
    // Always save first, whether creating or editing
    const quoteId = await saveQuote('draft');
    if (quoteId) {
        // Force reload the quote from server to get updated contact person
        await viewQuote(quoteId);
    }
}

// Render quote preview
function renderQuotePreview() {
    document.getElementById('quotesListView').style.display = 'none';
    document.getElementById('quotesFormView').style.display = 'none';
    document.getElementById('quotesPreviewView').style.display = 'block';
    document.getElementById('quotesCustomersView').style.display = 'none';
    
    const container = document.getElementById('quotesPreviewContainer');
    
    // Ensure lines is an array
    if (!currentQuote.lines || !Array.isArray(currentQuote.lines)) {
        console.error('Invalid quote lines:', currentQuote.lines);
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--color-red);">Kunne ikke indlæse tilbudslinjer. Prøv at genindlæse siden.</div>';
        return;
    }
    
    // Professional PDF-style preview matching invoice design
    container.innerHTML = `
        <div class="quote-sheet-wrap">
            <div class="preview-actions">
                <button onclick="editQuote(${currentQuote.id})" class="btn btn-secondary">
                    <i data-lucide="pencil"></i> Rediger
                </button>
                <button onclick="sendQuote(${currentQuote.id})" class="btn btn-primary">
                    <i data-lucide="send"></i> Send til Kunde
                </button>
                <button onclick="downloadQuotePDF(${currentQuote.id})" class="btn btn-secondary">
                    <i data-lucide="download"></i> Download PDF
                </button>
                <button onclick="deleteQuote(${currentQuote.id})" class="btn btn-danger">
                    <i data-lucide="trash-2"></i> Slet
                </button>
            </div>

            <div class="quote-sheet">
                <div style="max-width: 900px; margin: 0 auto;">
                <!-- Minimal Header -->
                <div style="display: flex; justify-content: space-between; align-items: start; padding-bottom: 30px; border-bottom: 1px solid var(--text); margin-bottom: 40px;">
                    <div style="background: transparent !important; margin-top: 0; padding: 0;">
                        <img src="seestlogo.png" alt="SG Seest Gulvteknik ApS" style="height: 80px; width: auto; display: block; background: transparent !important; background-color: transparent !important; margin: 0; padding: 0;">
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0 0 15px 0; font-size: 24px; font-weight: 700; color: var(--text);">TILBUD</h2>
                        <table style="border-collapse: collapse; margin-left: auto;">
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: var(--text-muted);">Kundenummer:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: var(--text); font-weight: 600;">${currentQuote.customer_id || 'N/A'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: var(--text-muted);">Tilbud nr.:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: var(--text); font-weight: 600;">${currentQuote.quote_number}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: var(--text-muted);">Dato:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: var(--text);">${new Date(currentQuote.date).toLocaleDateString('da-DK')}</td>
                            </tr>
                            ${currentQuote.valid_until ? `
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: var(--text-muted);">Gyldig til:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: var(--text);">${new Date(currentQuote.valid_until).toLocaleDateString('da-DK')}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>
                </div>
                
                <!-- Customer Info -->
                <div style="margin-bottom: 40px;">
                    <h3 style="margin: 0 0 10px 0; color: var(--text); font-size: 13px; font-weight: 700;">KUNDE:</h3>
                    <p style="margin: 0 0 3px 0; font-weight: 600; font-size: 13px; color: var(--text);">${currentQuote.company_name}</p>
                    ${currentQuote.contact_person_name ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: var(--text-muted);">Att: ${currentQuote.contact_person_name}${currentQuote.contact_person_title ? ` - ${currentQuote.contact_person_title}` : ''}</p>` : 
                      currentQuote.contact_person ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: var(--text-muted);">Att: ${currentQuote.contact_person}</p>` : ''}
                    ${currentQuote.att_person && !currentQuote.contact_person_name ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: var(--text-muted);">Att: ${currentQuote.att_person}</p>` : ''}
                    ${currentQuote.address ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: var(--text-muted);">${currentQuote.address}</p>` : ''}
                    ${currentQuote.postal_code && currentQuote.city ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: var(--text-muted);">${currentQuote.postal_code} ${currentQuote.city}</p>` : ''}
                    ${currentQuote.contact_person_email ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: var(--text-muted);">${currentQuote.contact_person_email}</p>` : 
                      currentQuote.customer_email ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: var(--text-muted);">${currentQuote.customer_email}</p>` : ''}
                    ${currentQuote.contact_person_phone ? `<p style="margin: 0; font-size: 12px; color: var(--text-muted);">${currentQuote.contact_person_phone}</p>` : 
                      currentQuote.customer_phone ? `<p style="margin: 0; font-size: 12px; color: var(--text-muted);">${currentQuote.customer_phone}</p>` : ''}
                </div>
                
                <!-- Title/Description -->
                <div style="margin-bottom: 30px;">
                    <h3 style="margin: 0; font-size: 14px; color: var(--text); font-weight: 700;">Tilbud på: ${currentQuote.title}</h3>
                    ${currentQuote.requisition_number ? `<p style="margin: 5px 0 0 0; font-size: 12px; color: var(--text-muted);">Rekvisitionsnummer: ${currentQuote.requisition_number}</p>` : ''}
                </div>
                
                <!-- Lines Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--text);">
                            <th style="padding: 12px 10px; text-align: left; font-weight: 700; font-size: 12px; color: var(--text);">Beskrivelse</th>
                            <th style="padding: 12px 10px; text-align: center; font-weight: 700; font-size: 12px; color: var(--text); width: 80px;">Antal</th>
                            <th style="padding: 12px 10px; text-align: center; font-weight: 700; font-size: 12px; color: var(--text); width: 80px;">Enhed</th>
                            <th style="padding: 12px 10px; text-align: right; font-weight: 700; font-size: 12px; color: var(--text); width: 110px;">E.pris</th>
                            <th style="padding: 12px 10px; text-align: right; font-weight: 700; font-size: 12px; color: var(--text); width: 70px;">Rabat</th>
                            <th style="padding: 12px 10px; text-align: right; font-weight: 700; font-size: 12px; color: var(--text); width: 120px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${currentQuote.lines.map(line => {
                            const lineTotal = calculateLineTotal(line);
                            return `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 10px; vertical-align: top; color: var(--text); font-size: 12px;">${line.description}</td>
                                    <td style="padding: 10px; text-align: center; color: var(--text); font-size: 12px;">${line.quantity}</td>
                                    <td style="padding: 10px; text-align: center; color: var(--text); font-size: 12px;">${line.unit}</td>
                                    <td style="padding: 10px; text-align: right; color: var(--text); font-size: 12px;">${formatCurrency(line.unit_price)}</td>
                                    <td style="padding: 10px; text-align: right; color: var(--text); font-size: 12px;">${line.discount_percent}%</td>
                                    <td style="padding: 10px; text-align: right; font-weight: 600; color: var(--text); font-size: 12px;">${formatCurrency(lineTotal)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                
                <!-- Totals -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
                    <div style="min-width: 320px;">
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                            <span style="font-size: 12px; color: var(--text);">Subtotal:</span>
                            <strong style="font-size: 12px; color: var(--text);">${formatCurrency(currentQuote.subtotal)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                            <span style="font-size: 12px; color: var(--text);">Moms (25%):</span>
                            <strong style="font-size: 12px; color: var(--text);">${formatCurrency(currentQuote.vat_amount)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 15px 0; border-top: 2px solid var(--text); margin-top: 10px;">
                            <span style="font-size: 14px; font-weight: 700; color: var(--text);">TOTAL:</span>
                            <strong style="font-size: 16px; font-weight: 700; color: var(--text);">${formatCurrency(currentQuote.total)}</strong>
                        </div>
                    </div>
                </div>
                
                <!-- Payment Terms -->
                ${currentQuote.terms ? `
                    <div style="margin-bottom: 25px; padding: 15px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
                        <h3 style="margin: 0 0 8px 0; color: var(--text); font-size: 12px; font-weight: 700;">BETALINGSBETINGELSER:</h3>
                        <p style="margin: 0; color: var(--text); font-size: 11px; line-height: 1.5; white-space: pre-wrap;">${currentQuote.terms}</p>
                    </div>
                ` : ''}
                
                ${currentQuote.attachments && currentQuote.attachments.length > 0 ? `
                    <div style="margin-bottom: 25px; padding: 15px 0; border-bottom: 1px solid var(--border);">
                        <h3 style="margin: 0 0 8px 0; color: var(--text); font-size: 12px; font-weight: 700;">VEDHÆFTEDE DOKUMENTER:</h3>
                        ${currentQuote.attachments.map(att => `
                            <div style="margin: 5px 0; color: var(--text); font-size: 11px;">${att.original_name}</div>
                        `).join('')}
                    </div>
                ` : ''}
                
                <!-- Footer -->
                <div style="border-top: 1px solid var(--text); padding-top: 20px; margin-top: 40px; text-align: center;">
                    <p style="margin: 0; color: var(--text-muted); font-size: 11px;">
                        SG Seest Gulvteknik ApS • Tandholtvej 39, Seest • DK-6000 Kolding • CVR: 41435208<br>
                        Email: kontakt@seestgulvteknik.dk • Telefon: 75 52 10 54 • www.seestgulvteknik.dk
                    </p>
                </div>
            </div>
        </div>
    </div>
    `;
}

// Download PDF placeholder
function downloadQuotePDF(quoteId) {
    alert('PDF generering kommer i en fremtidig version.\n\nDu kan i stedet bruge browser print (Ctrl+P) til at gemme som PDF.');
    window.print();
}

// Accept quote (convert to order)
async function acceptQuote(quoteId) {
    if (!confirm('Acceptér dette tilbud som ordre?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${quoteId}/accept`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to accept quote');
        }
        
        const order = await response.json();
        
        alert(`Tilbud accepteret som ordre ${order.order_number}!`);
        await loadQuotes();
        
    } catch (error) {
        console.error('Accept quote error:', error);
        alert('Kunne ikke acceptere tilbud: ' + error.message);
    }
}

// Reject quote
async function rejectQuote(quoteId) {
    if (!confirm('Afvis dette tilbud?\n\nTilbuddet vil blive flyttet til "Afvist" tabben.')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${quoteId}/reject`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to reject quote');
        }
        
        alert('Tilbud afvist');
        await loadQuotes();
        
    } catch (error) {
        console.error('Reject quote error:', error);
        alert('Kunne ikke afvise tilbud: ' + error.message);
    }
}

// Tab switching
function switchOrderTab(tab) {
    currentOrderTab = tab;
    
    // Update URL hash to preserve tab on refresh
    // Use replaceState to avoid triggering hashchange event (which would cause double-load)
    history.replaceState(null, '', `#quotes/${tab}`);
    
    // ALWAYS hide all sub-views when switching tabs
    // Guard: Check if elements exist (might not be loaded yet)
    const listView = document.getElementById('quotesListView');
    const formView = document.getElementById('quotesFormView');
    const previewView = document.getElementById('quotesPreviewView');
    const customersView = document.getElementById('quotesCustomersView');
    
    if (!listView || !formView || !previewView || !customersView) {
        console.warn('Quote page elements not loaded yet, skipping tab switch');
        return;
    }
    
    listView.style.display = 'none';
    formView.style.display = 'none';
    previewView.style.display = 'none';
    customersView.style.display = 'none';
    
    // Update button styles
    const tabs = ['quotes', 'orders', 'in_progress', 'invoiced', 'rejected', 'customers'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        const content = document.getElementById(`orderTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        
        if (btn && content) {
            btn.classList.toggle('active', t === tab);
            content.style.display = t === tab ? 'block' : 'none';
        }
    });
    
    // Load content for active tab
    if (tab === 'quotes') {
        // Show list view for quotes tab
        document.getElementById('quotesListView').style.display = 'block';
        loadQuotes();
    } else if (tab === 'orders') {
        loadOrders();
    } else if (tab === 'in_progress') {
        loadInProgress();
    } else if (tab === 'invoiced') {
        loadInvoiced();
    } else if (tab === 'rejected') {
        loadRejected();
    } else if (tab === 'customers') {
        // Show customers view for customers tab
        document.getElementById('quotesCustomersView').style.display = 'block';
        loadCustomersTable();
    }
}

// Filter quotes by status
function filterQuotesByStatus(status) {
    currentQuoteFilter = status;
    
    // Update button styles
    ['All', 'Draft', 'Sent', 'Rejected'].forEach(s => {
        const btn = document.getElementById(`filter${s}`);
        if (btn) {
            btn.classList.toggle('active', s.toLowerCase() === status);
        }
    });
    
    renderQuotesList();
}

// Load orders tab (accepted quotes not yet started)
async function loadOrders() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/quotes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load quotes');

        const allQuotes = await response.json();
        // Filter: godkendte ordrer der IKKE er startet endnu (order_stage = 'approved')
        // Fallback: ordrer uden order_stage (gamle rækker) behandles som godkendte
        const orders = allQuotes.filter(q => q.status === 'accepted' && !q.is_extra_work && (q.order_stage !== 'in_progress'));

        setTabCount('Orders', orders.length);
        renderOrdersContent(orders);
    } catch (error) {
        console.error('Error loading orders:', error);
        alert('Kunne ikke indlæse ordrer: ' + error.message);
    }
}

// Load in-progress tab (started orders)
async function loadInProgress() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/quotes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load quotes');

        const allQuotes = await response.json();
        const inProgress = allQuotes.filter(q => q.status === 'accepted' && !q.is_extra_work && q.order_stage === 'in_progress');

        setTabCount('InProgress', inProgress.length);
        renderInProgressContent(inProgress);
    } catch (error) {
        console.error('Error loading in-progress orders:', error);
        alert('Kunne ikke indlæse igangværende ordrer: ' + error.message);
    }
}

// Set antal-badge på en fane
function setTabCount(tabName, count) {
    const el = document.getElementById(`tabCount${tabName}`);
    if (el) el.textContent = count > 0 ? String(count) : '';
}

// Render orders content
function renderOrdersContent(orders) {
    const container = document.getElementById('ordersContainer');

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="list-empty">
                <div class="icon-box"><i data-lucide="package"></i></div>
                <h3>Ingen ordrer endnu</h3>
                <p>Acceptér et tilbud for at se det her</p>
            </div>
        `;
        return;
    }

    let html = `<div class="list-section-head"><span class="title">Godkendte ordrer</span><span class="badge badge--accepted">${orders.length}</span></div>`;
    orders.forEach(order => {
        // Use order_number if available, otherwise use quote_number
        const displayNumber = order.order_number || order.quote_number || 'N/A';
        const fullOrderNumber = order.is_extra_work && order.parent_order_id
            ? `${displayNumber}-${String(order.sub_number).padStart(2, '0')}`
            : displayNumber;

        html += `
            <div class="list-card list-card--accepted">
                <div class="list-card-head">
                    <h4 class="list-card-title">Ordre ${fullOrderNumber}</h4>
                    <span class="badge badge--accepted">Godkendt</span>
                    <span class="list-card-sub">${new Date(order.accepted_at).toLocaleDateString('da-DK')}</span>
                </div>
                <div class="list-card-grid">
                    <div class="list-card-field"><span class="label">Kunde</span><span class="value">${order.customer_name}</span></div>
                    <div class="list-card-field"><span class="label">Titel</span><span class="value">${order.title}</span></div>
                    <div class="list-card-field"><span class="label">Oprettet af</span><span class="value">${order.created_by_name || 'Ukendt'}</span></div>
                    <div class="list-card-total"><span class="label">Total</span>${formatCurrency(order.total)}</div>
                </div>
                <div class="list-card-actions">
                    ${btn('primary', 'play', 'Start Ordre', { onclick: `startOrder(${order.id})` })}
                    ${btn('ghost', 'eye', 'Se Ordre', { onclick: `viewQuote(${order.id})` })}
                    ${btn('secondary', 'undo-2', 'Flyt til Tilbud', { onclick: `moveOrderBackToQuote(${order.id})` })}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

// Render in-progress content
function renderInProgressContent(orders) {
    const container = document.getElementById('inProgressContainer');

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="list-empty">
                <div class="icon-box"><i data-lucide="loader"></i></div>
                <h3>Ingen igangværende ordrer</h3>
                <p>Start en godkendt ordre i fanen "Godkendte Ordre"</p>
            </div>
        `;
        return;
    }

    let html = `<div class="list-section-head"><span class="title">Igangværende ordrer</span><span class="badge badge--sent">${orders.length}</span></div>`;
    orders.forEach(order => {
        const displayNumber = order.order_number || order.quote_number || 'N/A';
        const fullOrderNumber = order.is_extra_work && order.parent_order_id
            ? `${displayNumber}-${String(order.sub_number).padStart(2, '0')}`
            : displayNumber;
        const startedDate = order.started_at ? new Date(order.started_at).toLocaleDateString('da-DK') : '';

        html += `
            <div class="list-card list-card--sent">
                <div class="list-card-head">
                    <h4 class="list-card-title">Ordre ${fullOrderNumber}</h4>
                    <span class="badge badge--sent">Igangværende</span>
                    ${startedDate ? `<span class="list-card-sub">Startet ${startedDate}</span>` : ''}
                </div>
                <div class="list-card-grid">
                    <div class="list-card-field"><span class="label">Kunde</span><span class="value">${order.customer_name}</span></div>
                    <div class="list-card-field"><span class="label">Titel</span><span class="value">${order.title}</span></div>
                    <div class="list-card-field"><span class="label">Oprettet af</span><span class="value">${order.created_by_name || 'Ukendt'}</span></div>
                    <div class="list-card-total"><span class="label">Total</span>${formatCurrency(order.total)}</div>
                </div>
                <div class="list-card-actions">
                    ${btn('primary', 'eye', 'Se Ordre', { onclick: `viewQuote(${order.id})` })}
                    ${btn('secondary', 'receipt', 'Opret Faktura', { onclick: `createInvoiceFromOrder(${order.id})` })}
                    ${btn('secondary', 'undo-2', 'Sæt tilbage til Godkendt', { onclick: `pauseOrder(${order.id})` })}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

// "Start ordre"-dialog (manuel start af godkendt ordre)
async function startOrder(orderId) {
    try {
        const token = sessionStorage.getItem('token');
        const quoteRes = await fetch(`/api/quotes/${orderId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!quoteRes.ok) throw new Error('Kunne ikke hente ordren');
        const order = await quoteRes.json();

        // Hent brugere til "ansvarlig"-vælgeren
        let userOptions = '<option value="">— Vælg ansvarlig —</option>';
        try {
            const usersRes = await fetch('/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (usersRes.ok) {
                const users = await usersRes.json();
                let currentUserId = null;
                try {
                    const me = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
                    currentUserId = me ? me.id : null;
                } catch (e) { /* ingen gemt bruger */ }
                users.forEach(u => {
                    const selected = String(u.id) === String(currentUserId) ? ' selected' : '';
                    userOptions += `<option value="${u.id}"${selected}>${u.name}</option>`;
                });
            }
        } catch (e) { /* vælger forbliver med pladsholder */ }

        // Dato = i dag (ISO, tidszone-sikker)
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.id = 'startOrderModal';
        overlay.innerHTML = `
            <div class="modal-card start-order-modal">
                <div class="modal-head">
                    <h2><i data-lucide="play"></i> Start Ordre</h2>
                    ${btn('ghost', 'x', '', { onclick: 'closeStartOrderModal()' })}
                </div>
                <p class="start-order-info"><strong>Ordre ${order.order_number || order.quote_number}</strong> — ${order.customer_name}</p>
                <p class="start-order-info">Når ordren startes, kan der registreres tid, udgifter og materialer på den.</p>
                <div class="start-order-fields">
                    <div>
                        <label class="field-label" for="startOrderDate">Startdato</label>
                        <input type="date" id="startOrderDate" class="field-input" value="${todayStr}">
                    </div>
                    <div>
                        <label class="field-label" for="startOrderResponsible">Ansvarlig</label>
                        <select id="startOrderResponsible" class="field-input">${userOptions}</select>
                    </div>
                </div>
                <div class="modal-actions" style="margin-top: 20px;">
                    ${btn('secondary', 'x', 'Annuller', { onclick: 'closeStartOrderModal()' })}
                    ${btn('primary', 'play', 'Start Ordre', { onclick: `submitStartOrder(${orderId})` })}
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        console.error('Error opening start-order dialog:', error);
        alert('Kunne ikke åbne start-dialogen: ' + error.message);
    }
}

function closeStartOrderModal() {
    const overlay = document.getElementById('startOrderModal');
    if (overlay) overlay.remove();
}

async function submitStartOrder(orderId) {
    const startDate = document.getElementById('startOrderDate')?.value;
    const responsible = document.getElementById('startOrderResponsible')?.value;

    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${orderId}/start`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                start_date: startDate || null,
                responsible_user_id: responsible ? Number(responsible) : null
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Kunne ikke starte ordren');

        closeStartOrderModal();
        loadOrders();
        loadInProgress();
    } catch (error) {
        console.error('Error starting order:', error);
        alert('Kunne ikke starte ordren: ' + error.message);
    }
}

// Sæt igangværende ordre tilbage til godkendt
async function pauseOrder(orderId) {
    if (!confirm('Sæt denne ordre tilbage til godkendt? Der kan ikke længere registreres tid på den.')) return;

    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${orderId}/pause`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Kunne ikke sætte ordren tilbage');

        loadOrders();
        loadInProgress();
    } catch (error) {
        console.error('Error pausing order:', error);
        alert('Kunne ikke sætte ordren tilbage: ' + error.message);
    }
}
async function loadRejected() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/quotes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load quotes');
        
        const allQuotes = await response.json();
        const rejected = allQuotes.filter(q => q.status === 'rejected');
        
        renderRejectedContent(rejected);
    } catch (error) {
        console.error('Error loading rejected:', error);
        alert('Kunne ikke indlæse afviste tilbud: ' + error.message);
    }
}

// Render rejected content
function renderRejectedContent(quotes) {
    const container = document.getElementById('rejectedContainer');
    
    if (quotes.length === 0) {
        container.innerHTML = `
            <div class="list-empty">
                <div class="icon-box"><i data-lucide="x-circle"></i></div>
                <h3>Ingen afviste tilbud endnu</h3>
                <p>Afviste tilbud vises her</p>
            </div>
        `;
        return;
    }
    
    let html = `<div class="list-section-head"><span class="title">Afviste tilbud</span><span class="badge badge--rejected">${quotes.length}</span></div>`;
    quotes.forEach(quote => {
        html += `
            <div class="list-card list-card--rejected">
                <div class="list-card-head">
                    <h4 class="list-card-title">Tilbud ${quote.quote_number}</h4>
                    <span class="badge badge--rejected">Afvist</span>
                    <span class="list-card-sub">${new Date(quote.date).toLocaleDateString('da-DK')}</span>
                </div>
                <div class="list-card-grid">
                    <div class="list-card-field"><span class="label">Kunde</span><span class="value">${quote.customer_name}</span></div>
                    <div class="list-card-field"><span class="label">Titel</span><span class="value">${quote.title}</span></div>
                    <div class="list-card-field"><span class="label">Oprettet af</span><span class="value">${quote.created_by_name || 'Ukendt'}</span></div>
                    <div class="list-card-total"><span class="label">Total</span>${formatCurrency(quote.total)}</div>
                </div>
                <div class="list-card-actions">
                    ${btn('secondary', 'eye', 'Se Tilbud', { onclick: `viewQuote(${quote.id})` })}
                    ${btn('secondary', 'undo-2', 'Flyt til Tilbud', { onclick: `moveRejectedBackToQuote(${quote.id})` })}
                    ${btn('icon', 'trash-2', null, { title: 'Slet', onclick: `deleteQuote(${quote.id})` })}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

// Move order back to quote status
async function moveOrderBackToQuote(quoteId) {
    if (!confirm('Rykke denne ordre tilbage til tilbud status?\n\nOrdren vil blive flyttet tilbage til Tilbud tabben.')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${quoteId}/revert`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || 'Failed to revert order');
        }
        
        await response.json(); // Wait for response
        
        alert('Ordre rykket tilbage til tilbud!');
        await loadOrders(); // Reload orders tab
        
    } catch (error) {
        console.error('Revert order error:', error);
        alert('Kunne ikke rykke ordre tilbage: ' + error.message);
    }
}

// Move rejected quote back to sent status
async function moveRejectedBackToQuote(quoteId) {
    if (!confirm('Rykke dette afviste tilbud tilbage til tilbudsfasen?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${quoteId}/revert`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || 'Failed to revert quote');
        }
        
        alert('Tilbud rykket tilbage til tilbudsfasen!');
        await loadRejected();
        
    } catch (error) {
        console.error('Revert quote error:', error);
        alert('Kunne ikke rykke tilbud tilbage: ' + error.message);
    }
}

// Initialize quotes page
async function initQuotesPage() {
    await loadCustomers();
    // Don't call loadQuotes() here - let switchOrderTab() handle all data loading
    // This prevents visual "hop" from showing Tilbud tab before switching to correct tab
    
    // Check if URL is a workspace URL (e.g., #/orders/123/workspace)
    const hash = window.location.hash;
    const isWorkspaceURL = hash.match(/^#\/orders\/\d+\/workspace$/);
    
    // Only switch tabs if NOT restoring a workspace
    if (!isWorkspaceURL) {
        // Check if hash indicates a specific tab (e.g., #quotes/orders)
        let tabToLoad = 'quotes'; // default
        
        if (hash.startsWith('#quotes/')) {
            const tabName = hash.substring(8); // Remove "#quotes/"
            if (['quotes', 'orders', 'invoiced', 'rejected', 'customers'].includes(tabName)) {
                tabToLoad = tabName;
            }
        }
        
        // Switch to correct tab - this will load data for that specific tab
        switchOrderTab(tabToLoad);
    }
    // Otherwise, let quotes-workspace.js handle the restoration
}

// Export functions
window.loadQuotes = loadQuotes;
window.showCreateQuote = showCreateQuote;
window.viewQuote = viewQuote;
window.editQuote = editQuote;
window.deleteQuote = deleteQuote;
window.sendQuote = sendQuote;
window.backToQuotesList = backToQuotesList;
window.initQuotesPage = initQuotesPage;
window.addQuoteLine = addQuoteLine;
window.removeLine = removeLine;
window.updateLine = updateLine;
window.saveQuote = saveQuote;
window.saveAndPreviewQuote = saveAndPreviewQuote;
window.downloadQuotePDF = downloadQuotePDF;
window.switchOrderTab = switchOrderTab;
window.filterQuotesByStatus = filterQuotesByStatus;
window.startOrder = startOrder;
window.closeStartOrderModal = closeStartOrderModal;
window.submitStartOrder = submitStartOrder;
window.pauseOrder = pauseOrder;
window.loadInProgress = loadInProgress;
window.loadOrders = loadOrders;
window.loadRejected = loadRejected;
window.acceptQuote = acceptQuote;
window.rejectQuote = rejectQuote;
window.moveOrderBackToQuote = moveOrderBackToQuote;
window.moveRejectedBackToQuote = moveRejectedBackToQuote;
window.loadQuoteContactPersons = loadQuoteContactPersons;
