// js/quotes.js - Tilbudssystem funktionalitet

const UNITS = [
    'Stk.', 'ton', 'uger', 'sæt', 'sessioner', 
    'pakker', 'meter', 'mdr.', 'liter', 'kvm', 
    'kubikmeter', 'km', 'kg', 'kasser', 'kartoner', 
    'forsendelser', 'dage', 'æsker'
];

let allQuotes = [];
let allCustomers = [];
let currentQuote = null;
let currentView = 'list'; // 'list', 'create', 'edit', 'preview'

// Load quotes
async function loadQuotes() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('http://localhost:4000/api/quotes', {
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

// Load customers
async function loadCustomers() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('http://localhost:4000/api/customers', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load customers');
        
        allCustomers = await response.json();
    } catch (error) {
        console.error('Error loading customers:', error);
        allCustomers = [];
    }
}

// Render quotes list
function renderQuotesList() {
    const container = document.getElementById('quotesListContainer');
    
    // Filter quotes by status
    let filteredQuotes = allQuotes;
    if (currentQuoteFilter !== 'all') {
        filteredQuotes = allQuotes.filter(q => q.status === currentQuoteFilter);
    }
    
    if (filteredQuotes.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">💼</div>
                <h3>Ingen tilbud endnu</h3>
                <p style="margin: 10px 0 20px 0;">Opret dit første tilbud for at komme i gang</p>
                <button onclick="showCreateQuote()" style="padding: 12px 30px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">
                    ➕ Opret Tilbud
                </button>
            </div>
        `;
        return;
    }
    
    const statusColors = {
        'draft': '#999',
        'sent': '#2196f3',
        'accepted': '#4caf50',
        'rejected': '#f44336'
    };
    
    const statusText = {
        'draft': '📝 Udkast',
        'sent': '📧 Sendt',
        'accepted': '✅ Accepteret',
        'rejected': '❌ Afvist'
    };
    
    container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0; width: 120px;">Ordre Nr.</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0;">Kunde</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0;">Titel</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0; width: 110px;">Dato</th>
                    <th style="padding: 15px; text-align: right; border-bottom: 2px solid #e0e0e0; width: 130px;">Total</th>
                    <th style="padding: 15px; text-align: center; border-bottom: 2px solid #e0e0e0; width: 150px;">Status</th>
                    <th style="padding: 15px; text-align: center; border-bottom: 2px solid #e0e0e0; width: 180px;">Handlinger</th>
                </tr>
            </thead>
            <tbody>
                ${filteredQuotes.map(quote => {
                    // Display order number instead of quote number
                    const displayNumber = quote.order_number || quote.quote_number;
                    return `
                    <tr style="border-bottom: 1px solid #e0e0e0; transition: background 0.2s;" onmouseover="this.style.background='#f9f9f9'" onmouseout="this.style.background='white'">
                        <td style="padding: 15px; font-weight: 600;">${displayNumber}</td>
                        <td style="padding: 15px;">${quote.customer_name}</td>
                        <td style="padding: 15px;">${quote.title}</td>
                        <td style="padding: 15px;">${new Date(quote.date).toLocaleDateString('da-DK')}</td>
                        <td style="padding: 15px; text-align: right; font-weight: 600;">${formatCurrency(quote.total)}</td>
                        <td style="padding: 15px; text-align: center;">
                            <span style="background: ${statusColors[quote.status]}; color: white; padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; display: inline-block; min-width: 100px;">
                                ${statusText[quote.status]}
                            </span>
                        </td>
                        <td style="padding: 15px; text-align: center;">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; max-width: 280px; margin: 0 auto;">
                                <button onclick="viewQuote(${quote.id})" style="padding: 8px 12px; background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap;">
                                    👁️ Se
                                </button>
                                <button onclick="editQuote(${quote.id})" style="padding: 8px 12px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap;">
                                    ✏️ Rediger
                                </button>
                                <button onclick="acceptQuote(${quote.id})" style="padding: 8px 12px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap;">
                                    ✅ Acceptér
                                </button>
                                <button onclick="rejectQuote(${quote.id})" style="padding: 8px 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap;">
                                    ❌ Afvis
                                </button>
                                <button onclick="deleteQuote(${quote.id})" style="padding: 8px 12px; background: #d32f2f; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap; grid-column: span 2;">
                                    🗑️ Slet
                                </button>
                            </div>
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('da-DK', {
        style: 'currency',
        currency: 'DKK'
    }).format(amount);
}

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

// Get default valid until date (30 days from now)
function getDefaultValidUntil() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
}

// Create empty line
function createEmptyLine() {
    return {
        description: '',
        quantity: 1,
        unit: 'Stk.',
        unit_price: 0,
        discount_percent: 0
    };
}

// View quote - Opens workspace if order, otherwise preview
async function viewQuote(quoteId) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/quotes/${quoteId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load quote');
        
        currentQuote = await response.json();
        
        // If it's an accepted order, open workspace instead
        if (currentQuote.status === 'accepted') {
            await openOrderWorkspace(quoteId);
        } else {
            currentView = 'preview';
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
        const response = await fetch(`http://localhost:4000/api/quotes/${quoteId}`, {
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
        const response = await fetch(`http://localhost:4000/api/quotes/${quoteId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to delete quote');
        
        alert('✅ Tilbud slettet');
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
        const response = await fetch(`http://localhost:4000/api/quotes/${quoteId}/send`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to send quote');
        }
        
        alert('✅ Tilbud sendt til kunde');
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

// Show customers management
function showCustomersManagement() {
    // This will be implemented in the HTML
    document.getElementById('quotesListView').style.display = 'none';
    document.getElementById('quotesCustomersView').style.display = 'block';
    loadCustomersTable();
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
        <div style="background: white; padding: 30px; border-radius: 10px; max-width: 1200px;">
            <h2 style="margin-bottom: 30px;">${title}</h2>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kunde *</label>
                    <div style="display: flex; gap: 10px;">
                        <select id="quoteCustomer" onchange="loadQuoteContactPersons()" style="flex: 1; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;" ${isEdit && currentQuote.id ? 'disabled' : ''}>
                            <option value="">Vælg kunde...</option>
                            ${allCustomers.map(c => `
                                <option value="${c.id}" ${currentQuote.customer_id === c.id ? 'selected' : ''}>
                                    ${c.company_name}
                                </option>
                            `).join('')}
                        </select>
                        <button onclick="showQuickCreateCustomer()" style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                            ➕ Ny Kunde
                        </button>
                    </div>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kontaktperson</label>
                    <select id="quoteContactPerson" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                        <option value="">Vælg kontaktperson...</option>
                    </select>
                    <small style="color: #666; display: block; margin-top: 5px;">Valgfrit - vælg specifik kontaktperson for dette tilbud</small>
                </div>
                
                <div style="grid-column: 1 / -1;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Tilbud Titel *</label>
                    <input type="text" id="quoteTitle" value="${currentQuote.title || ''}" placeholder="F.eks. Gulvlægning hovedkontor" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Gyldig til</label>
                    <input type="date" id="quoteValidUntil" value="${currentQuote.valid_until || getDefaultValidUntil()}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Rekvisitionsnummer</label>
                    <input type="text" id="quoteReqNumber" value="${currentQuote.requisition_number || ''}" placeholder="Valgfrit" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0;">Tilbudslinjer</h3>
                    <button onclick="addQuoteLine()" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        ➕ Tilføj Linje
                    </button>
                </div>
                
                <div id="quoteLinesContainer"></div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Betalingsbetingelser</label>
                    <textarea id="quoteTerms" rows="3" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px; resize: vertical;">${currentQuote.terms || 'Netto 14 dage'}</textarea>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Interne Noter</label>
                    <textarea id="quoteNotes" rows="3" placeholder="Synlige kun for dig..." style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px; resize: vertical;">${currentQuote.notes || ''}</textarea>
                </div>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
                <div style="display: flex; justify-content: flex-end; gap: 15px; font-size: 16px;">
                    <div>
                        <strong>Subtotal:</strong> <span id="quoteSubtotal">0,00 kr.</span>
                    </div>
                    <div>
                        <strong>Moms (25%):</strong> <span id="quoteVat">0,00 kr.</span>
                    </div>
                    <div style="font-size: 20px; color: #667eea;">
                        <strong>TOTAL:</strong> <span id="quoteTotal">0,00 kr.</span>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="backToQuotesList()" style="padding: 12px 24px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                    Annuller
                </button>
                <button onclick="saveQuote('draft')" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                    💾 Gem som Udkast
                </button>
                <button onclick="saveAndPreviewQuote()" style="padding: 12px 24px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                    👁️ Gem & Se Preview
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
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Ingen linjer endnu. Klik "➕ Tilføj Linje" for at komme i gang.</p>';
        return;
    }
    
    container.innerHTML = currentQuote.lines.map((line, index) => `
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 2px solid #e0e0e0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong>Linje ${index + 1}</strong>
                <button onclick="removeLine(${index})" style="padding: 5px 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    🗑️ Fjern
                </button>
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Beskrivelse *</label>
                <textarea id="lineDesc${index}" rows="2" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; resize: vertical;" onchange="updateLine(${index})">${line.description || ''}</textarea>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 2fr; gap: 10px;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Antal *</label>
                    <input type="number" id="lineQty${index}" value="${line.quantity || 1}" min="0" step="0.01" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" onchange="updateLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Enhed *</label>
                    <select id="lineUnit${index}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" onchange="updateLine(${index})">
                        ${UNITS.map(unit => `<option value="${unit}" ${line.unit === unit ? 'selected' : ''}>${unit}</option>`).join('')}
                    </select>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">E.pris *</label>
                    <input type="number" id="linePrice${index}" value="${line.unit_price || 0}" min="0" step="0.01" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" onchange="updateLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Rabat %</label>
                    <input type="number" id="lineDiscount${index}" value="${line.discount_percent || 0}" min="0" max="100" step="0.1" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" onchange="updateLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Total</label>
                    <div id="lineTotal${index}" style="padding: 8px; background: white; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; font-weight: 600; color: #667eea;">
                        ${formatCurrency(calculateLineTotal(line))}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Calculate line total
function calculateLineTotal(line) {
    const subtotal = (line.unit_price || 0) * (line.quantity || 0);
    const discount = subtotal * ((line.discount_percent || 0) / 100);
    return subtotal - discount;
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
        const response = await fetch(`http://localhost:4000/api/customers/${customerId}/contacts`, {
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
                option.textContent += ' ⭐';
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
            ? `http://localhost:4000/api/quotes/${currentQuote.id}`
            : 'http://localhost:4000/api/quotes';
        
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
        
        alert(`✅ Tilbud ${currentView === 'edit' ? 'opdateret' : 'oprettet'}!`);
        
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
    
    // Modern PDF-style preview
    container.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto;">
            <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                <button onclick="editQuote(${currentQuote.id})" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    ✏️ Rediger
                </button>
                <button onclick="sendQuote(${currentQuote.id})" style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    📧 Send til Kunde
                </button>
                <button onclick="downloadQuotePDF(${currentQuote.id})" style="padding: 10px 20px; background: #2196f3; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    📄 Download PDF
                </button>
                <button onclick="deleteQuote(${currentQuote.id})" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🗑️ Slet
                </button>
            </div>
            
            <div style="background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #667eea;">
                    <div>
                        <h1 style="margin: 0 0 10px 0; color: #667eea; font-size: 32px;">FlowFactory ApS</h1>
                        <p style="margin: 0; color: #666;">Professionelle løsninger</p>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0 0 10px 0; font-size: 24px;">TILBUD</h2>
                        <p style="margin: 0; color: #666;">${currentQuote.quote_number}</p>
                        <p style="margin: 5px 0 0 0; color: #666;">Dato: ${new Date(currentQuote.date).toLocaleDateString('da-DK')}</p>
                        ${currentQuote.valid_until ? `<p style="margin: 5px 0 0 0; color: #666;">Gyldig til: ${new Date(currentQuote.valid_until).toLocaleDateString('da-DK')}</p>` : ''}
                    </div>
                </div>
                
                <!-- Customer Info -->
                <div style="margin-bottom: 30px;">
                    <h3 style="margin: 0 0 10px 0; color: #333;">TIL:</h3>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 5px;">
                        <p style="margin: 0 0 5px 0; font-weight: 600; font-size: 16px;">${currentQuote.company_name}</p>
                        ${currentQuote.contact_person_name ? `<p style="margin: 0 0 5px 0;">Att: ${currentQuote.contact_person_name}${currentQuote.contact_person_title ? ` - ${currentQuote.contact_person_title}` : ''}</p>` : 
                          currentQuote.contact_person ? `<p style="margin: 0 0 5px 0;">Att: ${currentQuote.contact_person}</p>` : ''}
                        ${currentQuote.att_person && !currentQuote.contact_person_name ? `<p style="margin: 0 0 5px 0;">Att: ${currentQuote.att_person}</p>` : ''}
                        ${currentQuote.address ? `<p style="margin: 0 0 5px 0;">${currentQuote.address}</p>` : ''}
                        ${currentQuote.postal_code && currentQuote.city ? `<p style="margin: 0 0 5px 0;">${currentQuote.postal_code} ${currentQuote.city}</p>` : ''}
                        ${currentQuote.contact_person_email ? `<p style="margin: 0 0 5px 0;">📧 ${currentQuote.contact_person_email}</p>` : 
                          currentQuote.customer_email ? `<p style="margin: 0 0 5px 0;">📧 ${currentQuote.customer_email}</p>` : ''}
                        ${currentQuote.contact_person_phone ? `<p style="margin: 0;">📞 ${currentQuote.contact_person_phone}</p>` : 
                          currentQuote.customer_phone ? `<p style="margin: 0;">📞 ${currentQuote.customer_phone}</p>` : ''}
                    </div>
                </div>
                
                <!-- Title -->
                <div style="margin-bottom: 30px;">
                    <h2 style="margin: 0; font-size: 22px; color: #667eea;">Tilbud på: ${currentQuote.title}</h2>
                    ${currentQuote.requisition_number ? `<p style="margin: 5px 0 0 0; color: #666;">Rekv. nr.: ${currentQuote.requisition_number}</p>` : ''}
                </div>
                
                <!-- Lines Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                    <thead>
                        <tr style="background: #667eea; color: white;">
                            <th style="padding: 12px; text-align: left; border: 1px solid #5568d3;">Beskrivelse</th>
                            <th style="padding: 12px; text-align: center; border: 1px solid #5568d3; width: 80px;">Antal</th>
                            <th style="padding: 12px; text-align: center; border: 1px solid #5568d3; width: 80px;">Enhed</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #5568d3; width: 120px;">E.pris</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #5568d3; width: 80px;">Rabat</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #5568d3; width: 120px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${currentQuote.lines.map(line => {
                            const lineTotal = calculateLineTotal(line);
                            return `
                                <tr>
                                    <td style="padding: 12px; border: 1px solid #e0e0e0; vertical-align: top;">${line.description}</td>
                                    <td style="padding: 12px; border: 1px solid #e0e0e0; text-align: center;">${line.quantity}</td>
                                    <td style="padding: 12px; border: 1px solid #e0e0e0; text-align: center;">${line.unit}</td>
                                    <td style="padding: 12px; border: 1px solid #e0e0e0; text-align: right;">${formatCurrency(line.unit_price)}</td>
                                    <td style="padding: 12px; border: 1px solid #e0e0e0; text-align: right;">${line.discount_percent}%</td>
                                    <td style="padding: 12px; border: 1px solid #e0e0e0; text-align: right; font-weight: 600;">${formatCurrency(lineTotal)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                
                <!-- Totals -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 30px;">
                    <div style="min-width: 300px;">
                        <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #e0e0e0;">
                            <span>Subtotal:</span>
                            <strong>${formatCurrency(currentQuote.subtotal)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #e0e0e0;">
                            <span>Moms (25%):</span>
                            <strong>${formatCurrency(currentQuote.vat_amount)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 15px; background: #667eea; color: white; font-size: 18px; border-radius: 5px; margin-top: 10px;">
                            <span>TOTAL:</span>
                            <strong>${formatCurrency(currentQuote.total)}</strong>
                        </div>
                    </div>
                </div>
                
                ${currentQuote.terms ? `
                    <div style="margin-bottom: 20px;">
                        <h3 style="margin: 0 0 10px 0; color: #333;">Betalingsbetingelser:</h3>
                        <p style="margin: 0; white-space: pre-wrap;">${currentQuote.terms}</p>
                    </div>
                ` : ''}
                
                ${currentQuote.attachments && currentQuote.attachments.length > 0 ? `
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
                        <h3 style="margin: 0 0 10px 0; color: #333;">Vedhæftede Dokumenter:</h3>
                        ${currentQuote.attachments.map(att => `
                            <div style="margin: 5px 0;">📎 ${att.original_name}</div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Download PDF placeholder
function downloadQuotePDF(quoteId) {
    alert('PDF generering kommer i en fremtidig version.\n\nDu kan i stedet bruge browser print (Ctrl+P) til at gemme som PDF.');
    window.print();
}

// Quick create customer - Open full form
function showQuickCreateCustomer() {
    showCreateCustomer(true); // true = from quote form
}

// Create customer form
function showCreateCustomer(fromQuoteForm = false) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'customerModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 10px; padding: 30px; max-width: 800px; width: 90%; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                <h2 style="margin: 0;">➕ Opret Ny Kunde</h2>
                <button onclick="closeCustomerModal()" style="padding: 8px 16px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 20px;">
                    ×
                </button>
            </div>
            
            <form id="customerForm" onsubmit="event.preventDefault(); saveCustomerForm(${fromQuoteForm});">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div style="grid-column: 1 / -1;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Firmanavn *</label>
                        <input type="text" id="customerCompanyName" required style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kundenummer</label>
                        <input type="text" id="customerNumber" placeholder="Auto-genereres hvis tomt" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                        <small style="color: #666;">Lad være tom for automatisk nummerering</small>
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">CVR nummer</label>
                        <input type="text" id="customerCVR" placeholder="12345678" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kontaktperson</label>
                        <input type="text" id="customerContactPerson" placeholder="Anders Andersen" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">ATT person</label>
                        <input type="text" id="customerAttPerson" placeholder="Til att.: ..." style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Email</label>
                        <input type="email" id="customerEmail" placeholder="firma@example.com" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Telefon</label>
                        <input type="tel" id="customerPhone" placeholder="+45 12 34 56 78" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div style="grid-column: 1 / -1;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Adresse</label>
                        <input type="text" id="customerAddress" placeholder="Hovedgaden 123" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Postnummer</label>
                        <input type="text" id="customerPostalCode" placeholder="8000" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">By</label>
                        <input type="text" id="customerCity" placeholder="Aarhus" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 30px;">
                    <button type="button" onclick="closeCustomerModal()" style="padding: 12px 24px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        Annuller
                    </button>
                    <button type="submit" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        💾 Gem Kunde
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Close customer modal
function closeCustomerModal() {
    const modal = document.getElementById('customerModal');
    if (modal) {
        modal.remove();
    }
}

// Save customer form
async function saveCustomerForm(fromQuoteForm = false) {
    const data = {
        customer_number: document.getElementById('customerNumber').value.trim() || null,
        company_name: document.getElementById('customerCompanyName').value.trim(),
        cvr_number: document.getElementById('customerCVR').value.trim() || null,
        contact_person: document.getElementById('customerContactPerson').value.trim() || null,
        att_person: document.getElementById('customerAttPerson').value.trim() || null,
        email: document.getElementById('customerEmail').value.trim() || null,
        phone: document.getElementById('customerPhone').value.trim() || null,
        address: document.getElementById('customerAddress').value.trim() || null,
        postal_code: document.getElementById('customerPostalCode').value.trim() || null,
        city: document.getElementById('customerCity').value.trim() || null
    };
    
    if (!data.company_name) {
        alert('Firmanavn er påkrævet');
        return;
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('http://localhost:4000/api/customers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create customer');
        }
        
        const customer = await response.json();
        
        closeCustomerModal();
        alert(`✅ Kunde "${customer.company_name}" oprettet!\nKundenummer: ${customer.customer_number}`);
        
        // Reload customers
        await loadCustomers();
        
        // If from quote form, refresh and select new customer
        if (fromQuoteForm) {
            renderQuoteForm();
            document.getElementById('quoteCustomer').value = customer.id;
        } else {
            // From customer list, refresh list
            loadCustomersTable();
        }
        
    } catch (error) {
        console.error('Create customer error:', error);
        alert('Kunne ikke oprette kunde: ' + error.message);
    }
}

// Load customers table
async function loadCustomersTable() {
    const container = document.getElementById('customersListContainer');
    
    if (allCustomers.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">👥</div>
                <h3>Ingen kunder endnu</h3>
                <p style="margin: 10px 0 20px 0;">Opret din første kunde for at komme i gang</p>
                <button onclick="showCreateCustomer()" style="padding: 12px 30px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">
                    ➕ Opret Kunde
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0;">Kunde Nr.</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0;">Firma</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0;">Kontakt</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0;">Email</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0;">Telefon</th>
                    <th style="padding: 15px; text-align: center; border-bottom: 2px solid #e0e0e0;">Handlinger</th>
                </tr>
            </thead>
            <tbody>
                ${allCustomers.map(customer => `
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                        <td style="padding: 15px;">${customer.customer_number || '-'}</td>
                        <td style="padding: 15px; font-weight: 600;">${customer.company_name}</td>
                        <td style="padding: 15px;">${customer.contact_person || '-'}</td>
                        <td style="padding: 15px;">${customer.email || '-'}</td>
                        <td style="padding: 15px;">${customer.phone || '-'}</td>
                        <td style="padding: 15px; text-align: center;">
                            <button onclick="editCustomer(${customer.id})" style="padding: 6px 12px; margin: 2px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                ✏️ Rediger
                            </button>
                            <button onclick="deleteCustomer(${customer.id})" style="padding: 6px 12px; margin: 2px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                🗑️ Slet
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Edit customer
function editCustomer(customerId) {
    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) {
        alert('Kunde ikke fundet');
        return;
    }
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'customerModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 10px; padding: 30px; max-width: 1000px; width: 90%; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                <h2 style="margin: 0;">✏️ Rediger Kunde</h2>
                <button onclick="closeCustomerModal()" style="padding: 8px 16px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 20px;">
                    ×
                </button>
            </div>
            
            <form id="customerForm" onsubmit="event.preventDefault(); updateCustomer(${customerId});">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div style="grid-column: 1 / -1;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Firmanavn *</label>
                        <input type="text" id="customerCompanyName" required value="${customer.company_name || ''}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kundenummer</label>
                        <input type="text" id="customerNumber" value="${customer.customer_number || ''}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">CVR nummer</label>
                        <input type="text" id="customerCVR" placeholder="12345678" value="${customer.cvr_number || ''}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kontaktperson</label>
                        <input type="text" id="customerContactPerson" placeholder="Anders Andersen" value="${customer.contact_person || ''}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">ATT person</label>
                        <input type="text" id="customerAttPerson" placeholder="Til att.: ..." value="${customer.att_person || ''}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Email</label>
                        <input type="email" id="customerEmail" placeholder="firma@example.com" value="${customer.email || ''}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Telefon</label>
                        <input type="tel" id="customerPhone" placeholder="+45 12 34 56 78" value="${customer.phone || ''}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div style="grid-column: 1 / -1;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Adresse</label>
                        <input type="text" id="customerAddress" placeholder="Hovedgaden 123" value="${customer.address || ''}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Postnummer</label>
                        <input type="text" id="customerPostalCode" placeholder="8000" value="${customer.postal_code || ''}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">By</label>
                        <input type="text" id="customerCity" placeholder="Aarhus" value="${customer.city || ''}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                </div>
                
                <!-- Contacts Section -->
                <div style="grid-column: 1 / -1; margin: 30px 0; padding-top: 30px; border-top: 2px solid #e0e0e0;">
                    <div id="customerContactsList"></div>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 30px;">
                    <button type="button" onclick="closeCustomerModal()" style="padding: 12px 24px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        Annuller
                    </button>
                    <button type="submit" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        💾 Gem Ændringer
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load contacts for this customer
    loadCustomerContacts(customerId);
}

// Update customer
async function updateCustomer(customerId) {
    const data = {
        customer_number: document.getElementById('customerNumber').value.trim() || null,
        company_name: document.getElementById('customerCompanyName').value.trim(),
        cvr_number: document.getElementById('customerCVR').value.trim() || null,
        contact_person: document.getElementById('customerContactPerson').value.trim() || null,
        att_person: document.getElementById('customerAttPerson').value.trim() || null,
        email: document.getElementById('customerEmail').value.trim() || null,
        phone: document.getElementById('customerPhone').value.trim() || null,
        address: document.getElementById('customerAddress').value.trim() || null,
        postal_code: document.getElementById('customerPostalCode').value.trim() || null,
        city: document.getElementById('customerCity').value.trim() || null
    };
    
    if (!data.company_name) {
        alert('Firmanavn er påkrævet');
        return;
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/customers/${customerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update customer');
        }
        
        const updatedCustomer = await response.json();
        
        closeCustomerModal();
        alert(`✅ Kunde "${updatedCustomer.company_name}" opdateret!`);
        
        // Reload customers
        await loadCustomers();
        loadCustomersTable();
        
    } catch (error) {
        console.error('Update customer error:', error);
        alert('Kunne ikke opdatere kunde: ' + error.message);
    }
}

// Delete customer  
async function deleteCustomer(customerId) {
    if (!confirm('Er du sikker på at du vil slette denne kunde?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/customers/${customerId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete customer');
        }
        
        alert('✅ Kunde slettet');
        await loadCustomers();
        loadCustomersTable();
        
    } catch (error) {
        console.error('Delete customer error:', error);
        alert('Kunne ikke slette kunde: ' + error.message);
    }
}

// --- CUSTOMER CONTACTS FUNCTIONS ---

let customerContacts = [];

// Load contacts for a customer
async function loadCustomerContacts(customerId) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/customers/${customerId}/contacts`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load contacts');
        
        customerContacts = await response.json();
        renderContactsList(customerId);
    } catch (error) {
        console.error('Error loading contacts:', error);
        customerContacts = [];
        renderContactsList(customerId);
    }
}

// Render contacts list
function renderContactsList(customerId) {
    const container = document.getElementById('customerContactsList');
    if (!container) return;
    
    if (customerContacts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #999; border: 2px dashed #e0e0e0; border-radius: 8px;">
                <p>Ingen kontaktpersoner endnu</p>
                <button onclick="showAddContact(${customerId})" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 13px;">
                    ➕ Tilføj Første Kontakt
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 14px;">📇 Kontaktpersoner (${customerContacts.length})</strong>
            <button onclick="showAddContact(${customerId})" style="padding: 6px 12px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 12px;">
                ➕ Tilføj Kontakt
            </button>
        </div>
        <div style="max-height: 300px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 8px; background: #f9f9f9;">
            ${customerContacts.map(contact => `
                <div style="padding: 12px; border-bottom: 1px solid #e0e0e0; background: white; ${contact.is_primary ? 'border-left: 4px solid #4caf50;' : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 4px;">
                                ${contact.name}
                                ${contact.is_primary ? '<span style="background: #4caf50; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-left: 8px;">PRIMÆR</span>' : ''}
                            </div>
                            ${contact.title ? `<div style="color: #666; font-size: 13px; margin-bottom: 4px;">${contact.title}</div>` : ''}
                            ${contact.email ? `<div style="color: #667eea; font-size: 13px; margin-bottom: 2px;">📧 ${contact.email}</div>` : ''}
                            ${contact.phone ? `<div style="color: #666; font-size: 13px;">📞 ${contact.phone}</div>` : ''}
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <button onclick="editContact(${customerId}, ${contact.id})" style="padding: 4px 8px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                                ✏️
                            </button>
                            <button onclick="deleteContact(${customerId}, ${contact.id})" style="padding: 4px 8px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Show add contact modal
function showAddContact(customerId) {
    const modal = document.createElement('div');
    modal.id = 'contactModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10001; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; width: 90%;">
            <h2 style="margin: 0 0 20px 0;">➕ Tilføj Kontaktperson</h2>
            
            <form id="contactForm" onsubmit="event.preventDefault(); saveContact(${customerId});">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Navn *</label>
                    <input type="text" id="contactName" required style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Titel</label>
                    <input type="text" id="contactTitle" placeholder="F.eks. Projektleder" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Email</label>
                    <input type="email" id="contactEmail" placeholder="navn@firma.dk" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Telefon</label>
                    <input type="tel" id="contactPhone" placeholder="+45 12 34 56 78" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="contactIsPrimary" style="margin-right: 8px; width: 18px; height: 18px;">
                        <span style="font-weight: 600;">Gør til primær kontakt</span>
                    </label>
                    <small style="color: #666; margin-left: 26px; display: block; margin-top: 4px;">Primær kontakt bruges som standard i tilbud og fakturaer</small>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="closeContactModal()" style="padding: 12px 24px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        Annuller
                    </button>
                    <button type="submit" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        💾 Gem Kontakt
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Save contact
async function saveContact(customerId) {
    const data = {
        name: document.getElementById('contactName').value.trim(),
        title: document.getElementById('contactTitle').value.trim() || null,
        email: document.getElementById('contactEmail').value.trim() || null,
        phone: document.getElementById('contactPhone').value.trim() || null,
        is_primary: document.getElementById('contactIsPrimary').checked
    };
    
    if (!data.name) {
        alert('Navn er påkrævet');
        return;
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/customers/${customerId}/contacts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save contact');
        }
        
        closeContactModal();
        alert('✅ Kontaktperson tilføjet!');
        await loadCustomerContacts(customerId);
        
    } catch (error) {
        console.error('Save contact error:', error);
        alert('Kunne ikke gemme kontakt: ' + error.message);
    }
}

// Edit contact
function editContact(customerId, contactId) {
    const contact = customerContacts.find(c => c.id === contactId);
    if (!contact) {
        alert('Kontakt ikke fundet');
        return;
    }
    
    const modal = document.createElement('div');
    modal.id = 'contactModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10001; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; width: 90%;">
            <h2 style="margin: 0 0 20px 0;">✏️ Rediger Kontaktperson</h2>
            
            <form id="contactForm" onsubmit="event.preventDefault(); updateContact(${customerId}, ${contactId});">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Navn *</label>
                    <input type="text" id="contactName" required value="${contact.name || ''}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Titel</label>
                    <input type="text" id="contactTitle" value="${contact.title || ''}" placeholder="F.eks. Projektleder" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Email</label>
                    <input type="email" id="contactEmail" value="${contact.email || ''}" placeholder="navn@firma.dk" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Telefon</label>
                    <input type="tel" id="contactPhone" value="${contact.phone || ''}" placeholder="+45 12 34 56 78" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="contactIsPrimary" ${contact.is_primary ? 'checked' : ''} style="margin-right: 8px; width: 18px; height: 18px;">
                        <span style="font-weight: 600;">Gør til primær kontakt</span>
                    </label>
                    <small style="color: #666; margin-left: 26px; display: block; margin-top: 4px;">Primær kontakt bruges som standard i tilbud og fakturaer</small>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="closeContactModal()" style="padding: 12px 24px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        Annuller
                    </button>
                    <button type="submit" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        💾 Gem Ændringer
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Update contact
async function updateContact(customerId, contactId) {
    const data = {
        name: document.getElementById('contactName').value.trim(),
        title: document.getElementById('contactTitle').value.trim() || null,
        email: document.getElementById('contactEmail').value.trim() || null,
        phone: document.getElementById('contactPhone').value.trim() || null,
        is_primary: document.getElementById('contactIsPrimary').checked
    };
    
    if (!data.name) {
        alert('Navn er påkrævet');
        return;
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/customers/${customerId}/contacts/${contactId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update contact');
        }
        
        closeContactModal();
        alert('✅ Kontaktperson opdateret!');
        await loadCustomerContacts(customerId);
        
    } catch (error) {
        console.error('Update contact error:', error);
        alert('Kunne ikke opdatere kontakt: ' + error.message);
    }
}

// Delete contact
async function deleteContact(customerId, contactId) {
    if (!confirm('Slet denne kontaktperson?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/customers/${customerId}/contacts/${contactId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete contact');
        }
        
        alert('✅ Kontaktperson slettet!');
        await loadCustomerContacts(customerId);
        
    } catch (error) {
        console.error('Delete contact error:', error);
        alert('Kunne ikke slette kontakt: ' + error.message);
    }
}

// Close contact modal
function closeContactModal() {
    const modal = document.getElementById('contactModal');
    if (modal) {
        modal.remove();
    }
}

// Tab switching
let currentOrderTab = 'quotes';

function switchOrderTab(tab) {
    currentOrderTab = tab;
    
    // ALWAYS hide all sub-views when switching tabs
    document.getElementById('quotesListView').style.display = 'none';
    document.getElementById('quotesFormView').style.display = 'none';
    document.getElementById('quotesPreviewView').style.display = 'none';
    document.getElementById('quotesCustomersView').style.display = 'none';
    
    // Update button styles
    const tabs = ['quotes', 'orders', 'invoiced', 'rejected', 'customers'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        const content = document.getElementById(`orderTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        
        if (btn && content) {
            if (t === tab) {
                btn.style.background = '#667eea';
                btn.style.color = 'white';
                content.style.display = 'block';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = '#666';
                content.style.display = 'none';
            }
        }
    });
    
    // Load content for active tab
    if (tab === 'quotes') {
        // Show list view for quotes tab
        document.getElementById('quotesListView').style.display = 'block';
        loadQuotes();
    } else if (tab === 'orders') {
        loadOrders();
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
let currentQuoteFilter = 'all';

function filterQuotesByStatus(status) {
    currentQuoteFilter = status;
    
    // Update button styles
    ['All', 'Draft', 'Sent', 'Rejected'].forEach(s => {
        const btn = document.getElementById(`filter${s}`);
        if (btn) {
            if (s.toLowerCase() === status) {
                btn.style.background = '#667eea';
                btn.style.color = 'white';
            } else {
                btn.style.background = '#e0e0e0';
                btn.style.color = '#666';
            }
        }
    });
    
    renderQuotesList();
}

// Filter invoices by status
let currentInvoiceFilter = 'all';

function filterInvoicesByStatus(status) {
    currentInvoiceFilter = status;
    
    // Update button styles
    ['InvAll', 'Accepted', 'Invoiced'].forEach(s => {
        const btn = document.getElementById(`filter${s}`);
        if (btn) {
            if ((s === 'InvAll' && status === 'all') || s.toLowerCase() === status) {
                btn.style.background = '#667eea';
                btn.style.color = 'white';
            } else {
                btn.style.background = '#e0e0e0';
                btn.style.color = '#666';
            }
        }
    });
    
    // No filters in invoiced tab anymore - just reload
    loadInvoiced();
}

// Load invoicing tab (accepted orders + invoices)
async function loadInvoicing() {
    try {
        const token = sessionStorage.getItem('token');
        
        // Load accepted orders
        const quotesRes = await fetch('http://localhost:4000/api/quotes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const allQuotes = await quotesRes.json();
        
        // Load invoices
        const invoicesRes = await fetch('http://localhost:4000/api/invoices', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const invoices = await invoicesRes.json();
        
        // Filter accepted orders (not yet invoiced)
        const acceptedOrders = allQuotes.filter(q => q.status === 'accepted');
        
        // Filter by status
        let filteredOrders = acceptedOrders;
        let filteredInvoices = invoices;
        
        if (currentInvoiceFilter === 'accepted') {
            filteredInvoices = [];
        } else if (currentInvoiceFilter === 'invoiced') {
            filteredOrders = [];
        }
        
        renderInvoicingContent(filteredOrders, filteredInvoices);
        
    } catch (error) {
        console.error('Error loading invoicing:', error);
        alert('Kunne ikke indlæse fakturering: ' + error.message);
    }
}

// Render invoicing content
function renderInvoicingContent(orders, invoices) {
    const container = document.getElementById('invoicingContainer');
    
    let html = '';
    
    // Accepted orders section
    if (orders.length > 0) {
        html += '<h3 style="margin-bottom: 15px;">✅ Accepterede Ordrer</h3>';
        orders.forEach(order => {
            const fullOrderNumber = order.is_extra_work && order.parent_order_id 
                ? `${order.order_number}-${String(order.sub_number).padStart(2, '0')}`
                : order.order_number;
            
            html += `
                <div style="background: white; border: 2px solid #4caf50; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 10px 0;">Ordre ${fullOrderNumber}</h4>
                            <p style="margin: 5px 0;"><strong>Kunde:</strong> ${order.customer_name}</p>
                            <p style="margin: 5px 0;"><strong>Titel:</strong> ${order.title}</p>
                            <p style="margin: 5px 0;"><strong>Total:</strong> ${formatCurrency(order.total)}</p>
                            <p style="margin: 5px 0; color: #4caf50; font-weight: 600;">✅ Accepteret: ${new Date(order.accepted_at).toLocaleDateString('da-DK')}</p>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <button onclick="createInvoiceFromOrder(${order.id})" style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                                💰 Opret Faktura
                            </button>
                            <button onclick="viewQuote(${order.id})" style="padding: 10px 20px; background: #2196f3; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                                👁️ Se Ordre
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    // Invoices section
    if (invoices.length > 0) {
        html += '<h3 style="margin: 30px 0 15px 0;">💰 Fakturaer</h3>';
        invoices.forEach(invoice => {
            const statusColors = {
                'draft': '#999',
                'sent': '#2196f3',
                'paid': '#4caf50'
            };
            const statusText = {
                'draft': '📝 Udkast',
                'sent': '📧 Sendt',
                'paid': '✅ Betalt'
            };
            
            html += `
                <div style="background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 10px 0;">Faktura ${invoice.invoice_number}</h4>
                            <p style="margin: 5px 0;"><strong>Ordre:</strong> ${invoice.full_order_number}</p>
                            <p style="margin: 5px 0;"><strong>Kunde:</strong> ${invoice.customer_name}</p>
                            <p style="margin: 5px 0;"><strong>Total:</strong> ${formatCurrency(invoice.total)}</p>
                            <p style="margin: 5px 0;"><strong>Forfald:</strong> ${new Date(invoice.due_date).toLocaleDateString('da-DK')}</p>
                            <p style="margin: 5px 0;">
                                <span style="background: ${statusColors[invoice.status]}; color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                                    ${statusText[invoice.status]}
                                </span>
                            </p>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button onclick="viewInvoice(${invoice.id})" style="padding: 10px 20px; background: #2196f3; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                            👁️ Se Faktura
                        </button>
                        ${invoice.status === 'draft' ? `
                            <button onclick="sendInvoice(${invoice.id})" style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                                📧 Send
                            </button>
                        ` : ''}
                        <button onclick="deleteInvoice(${invoice.id})" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                            🗑️ Slet Faktura
                        </button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    if (orders.length === 0 && invoices.length === 0) {
        html = `
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">💰</div>
                <h3>Ingen ordrer eller fakturaer</h3>
                <p style="margin: 10px 0;">Acceptér tilbud for at se dem her</p>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// Create invoice from order
async function createInvoiceFromOrder(orderId) {
    if (!confirm('Opret faktura for denne ordre?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/invoices/from-order/${orderId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({})
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create invoice');
        }
        
        const invoice = await response.json();
        
        alert(`✅ Faktura ${invoice.invoice_number} oprettet!`);
        loadInvoicing();
        
    } catch (error) {
        console.error('Create invoice error:', error);
        alert('Kunne ikke oprette faktura: ' + error.message);
    }
}

// View invoice
async function viewInvoice(invoiceId) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/invoices/${invoiceId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load invoice');
        
        const invoice = await response.json();
        renderInvoicePreview(invoice);
    } catch (error) {
        console.error('Error loading invoice:', error);
        alert('Kunne ikke indlæse faktura: ' + error.message);
    }
}

// Render invoice preview
function renderInvoicePreview(invoice) {
    // Hide all other views
    document.getElementById('quotesListView').style.display = 'none';
    document.getElementById('quotesFormView').style.display = 'none';
    document.getElementById('quotesPreviewView').style.display = 'none';
    document.getElementById('quotesCustomersView').style.display = 'none';
    
    // Show invoiced tab content (reuse for preview)
    const invoicedTab = document.getElementById('orderTabInvoiced');
    if (invoicedTab) {
        invoicedTab.style.display = 'block';
    }
    
    const container = document.getElementById('invoicingContainer');
    
    container.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto;">
            <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                <button onclick="switchOrderTab('invoiced'); loadInvoiced();" style="padding: 10px 20px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    ◀ Tilbage
                </button>
                ${invoice.status === 'draft' ? `
                    <button onclick="sendInvoice(${invoice.id})" style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        📧 Send til Kunde
                    </button>
                ` : ''}
                <button onclick="window.print()" style="padding: 10px 20px; background: #2196f3; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🖨️ Print / PDF
                </button>
                <button onclick="deleteInvoiceFromPreview(${invoice.id})" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🗑️ Slet Faktura
                </button>
            </div>
            
            <div style="background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #667eea;">
                    <div>
                        <h1 style="margin: 0 0 10px 0; color: #667eea; font-size: 32px;">FlowFactory ApS</h1>
                        <p style="margin: 0; color: #666;">Professionelle løsninger</p>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0 0 10px 0; font-size: 24px;">FAKTURA</h2>
                        <p style="margin: 0; color: #666;">Faktura nr.: ${invoice.invoice_number}</p>
                        <p style="margin: 5px 0 0 0; color: #666;">Ordre nr.: ${invoice.full_order_number}</p>
                        <p style="margin: 5px 0 0 0; color: #666;">Dato: ${new Date(invoice.invoice_date).toLocaleDateString('da-DK')}</p>
                        <p style="margin: 5px 0 0 0; color: #666;">Forfald: ${new Date(invoice.due_date).toLocaleDateString('da-DK')}</p>
                    </div>
                </div>
                
                <!-- Customer Info -->
                <div style="margin-bottom: 30px;">
                    <h3 style="margin: 0 0 10px 0; color: #333;">TIL:</h3>
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 5px;">
                        <p style="margin: 0 0 5px 0; font-weight: 600; font-size: 16px;">${invoice.company_name}</p>
                        ${invoice.contact_person ? `<p style="margin: 0 0 5px 0;">Att: ${invoice.contact_person}</p>` : ''}
                        ${invoice.address ? `<p style="margin: 0 0 5px 0;">${invoice.address}</p>` : ''}
                        ${invoice.postal_code && invoice.city ? `<p style="margin: 0 0 5px 0;">${invoice.postal_code} ${invoice.city}</p>` : ''}
                        ${invoice.customer_email ? `<p style="margin: 0 0 5px 0;">📧 ${invoice.customer_email}</p>` : ''}
                        ${invoice.customer_phone ? `<p style="margin: 0;">📞 ${invoice.customer_phone}</p>` : ''}
                    </div>
                </div>
                
                <!-- Lines Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                    <thead>
                        <tr style="background: #667eea; color: white;">
                            <th style="padding: 12px; text-align: left; border: 1px solid #5568d3;">Beskrivelse</th>
                            <th style="padding: 12px; text-align: center; border: 1px solid #5568d3; width: 80px;">Antal</th>
                            <th style="padding: 12px; text-align: center; border: 1px solid #5568d3; width: 80px;">Enhed</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #5568d3; width: 120px;">E.pris</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #5568d3; width: 80px;">Rabat</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #5568d3; width: 120px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoice.lines.map(line => `
                            <tr>
                                <td style="padding: 12px; border: 1px solid #e0e0e0; vertical-align: top;">${line.description}</td>
                                <td style="padding: 12px; border: 1px solid #e0e0e0; text-align: center;">${line.quantity}</td>
                                <td style="padding: 12px; border: 1px solid #e0e0e0; text-align: center;">${line.unit}</td>
                                <td style="padding: 12px; border: 1px solid #e0e0e0; text-align: right;">${formatCurrency(line.unit_price)}</td>
                                <td style="padding: 12px; border: 1px solid #e0e0e0; text-align: right;">${line.discount_percent}%</td>
                                <td style="padding: 12px; border: 1px solid #e0e0e0; text-align: right; font-weight: 600;">${formatCurrency(line.line_total)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <!-- Totals -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 30px;">
                    <div style="min-width: 300px;">
                        <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #e0e0e0;">
                            <span>Subtotal:</span>
                            <strong>${formatCurrency(invoice.subtotal)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #e0e0e0;">
                            <span>Moms (25%):</span>
                            <strong>${formatCurrency(invoice.vat_amount)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 15px; background: #667eea; color: white; font-size: 18px; border-radius: 5px; margin-top: 10px;">
                            <span>AT BETALE:</span>
                            <strong>${formatCurrency(invoice.total)}</strong>
                        </div>
                    </div>
                </div>
                
                <!-- Payment terms -->
                <div style="margin-bottom: 20px;">
                    <h3 style="margin: 0 0 10px 0; color: #333;">Betalingsbetingelser:</h3>
                    <p style="margin: 0;">${invoice.payment_terms}</p>
                </div>
                
                ${invoice.notes ? `
                    <div style="margin-bottom: 20px;">
                        <h3 style="margin: 0 0 10px 0; color: #333;">Noter:</h3>
                        <p style="margin: 0; white-space: pre-wrap;">${invoice.notes}</p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Send invoice
async function sendInvoice(invoiceId) {
    if (!confirm('Send denne faktura til kunden via email?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/invoices/${invoiceId}/send`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to send invoice');
        }
        
        alert('✅ Faktura sendt til kunde');
        loadInvoicing();
        
    } catch (error) {
        console.error('Send invoice error:', error);
        alert('Kunne ikke sende faktura: ' + error.message);
    }
}

// Delete invoice
async function deleteInvoice(invoiceId) {
    if (!confirm('Er du sikker på at du vil slette denne faktura?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/invoices/${invoiceId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete invoice');
        }
        
        alert('✅ Faktura slettet!');
        loadInvoiced();
        
    } catch (error) {
        console.error('Delete invoice error:', error);
        alert('Kunne ikke slette faktura: ' + error.message);
    }
}

// Delete invoice from preview (redirects back to list)
async function deleteInvoiceFromPreview(invoiceId) {
    if (!confirm('Er du sikker på at du vil slette denne faktura?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/invoices/${invoiceId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete invoice');
        }
        
        alert('✅ Faktura slettet!');
        switchOrderTab('invoiced');
        loadInvoiced();
        
    } catch (error) {
        console.error('Delete invoice error:', error);
        alert('Kunne ikke slette faktura: ' + error.message);
    }
}

// Load orders tab (accepted quotes not yet invoiced)
async function loadOrders() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('http://localhost:4000/api/quotes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load quotes');
        
        const allQuotes = await response.json();
        const orders = allQuotes.filter(q => q.status === 'accepted');
        
        renderOrdersContent(orders);
    } catch (error) {
        console.error('Error loading orders:', error);
        alert('Kunne ikke indlæse ordrer: ' + error.message);
    }
}

// Render orders content
function renderOrdersContent(orders) {
    const container = document.getElementById('ordersContainer');
    
    if (orders.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">📦</div>
                <h3>Ingen ordrer endnu</h3>
                <p style="margin: 10px 0;">Acceptér et tilbud for at se det her</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    orders.forEach(order => {
        // Use order_number if available, otherwise use quote_number
        const displayNumber = order.order_number || order.quote_number || 'N/A';
        const fullOrderNumber = order.is_extra_work && order.parent_order_id 
            ? `${displayNumber}-${String(order.sub_number).padStart(2, '0')}`
            : displayNumber;
        
        html += `
            <div style="background: white; border: 2px solid #4caf50; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 10px 0;">Ordre ${fullOrderNumber}</h4>
                        <p style="margin: 5px 0;"><strong>Kunde:</strong> ${order.customer_name}</p>
                        <p style="margin: 5px 0;"><strong>Titel:</strong> ${order.title}</p>
                        <p style="margin: 5px 0;"><strong>Total:</strong> ${formatCurrency(order.total)}</p>
                        <p style="margin: 5px 0; color: #4caf50; font-weight: 600;">✅ Accepteret: ${new Date(order.accepted_at).toLocaleDateString('da-DK')}</p>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button onclick="viewQuote(${order.id})" style="padding: 10px 20px; background: #2196f3; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                            👁️ Se Ordre
                        </button>
                        <button onclick="moveOrderBackToQuote(${order.id})" style="padding: 10px 20px; background: #9e9e9e; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                            ◀ Rykke til Tilbud
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Load invoiced tab (orders with invoices)
async function loadInvoiced() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('http://localhost:4000/api/invoices', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load invoices');
        
        const invoices = await response.json();
        renderInvoicedContent(invoices);
    } catch (error) {
        console.error('Error loading invoiced:', error);
        alert('Kunne ikke indlæse fakturerede ordrer: ' + error.message);
    }
}

// Render invoiced content
function renderInvoicedContent(invoices) {
    const container = document.getElementById('invoicingContainer');
    
    if (invoices.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">💰</div>
                <h3>Der er ingen fakturaer endnu</h3>
                <p style="margin: 10px 0;">Opret en faktura fra en accepteret ordre</p>
            </div>
        `;
        return;
    }
    
    const statusColors = {
        'draft': '#999',
        'sent': '#2196f3',
        'paid': '#4caf50'
    };
    const statusText = {
        'draft': '📝 Udkast',
        'sent': '📧 Sendt',
        'paid': '✅ Betalt'
    };
    
    let html = '';
    invoices.forEach(invoice => {
        html += `
            <div style="background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 10px 0;">Faktura ${invoice.invoice_number}</h4>
                        <p style="margin: 5px 0;"><strong>Ordre:</strong> ${invoice.full_order_number}</p>
                        <p style="margin: 5px 0;"><strong>Kunde:</strong> ${invoice.customer_name}</p>
                        <p style="margin: 5px 0;"><strong>Total:</strong> ${formatCurrency(invoice.total)}</p>
                        <p style="margin: 5px 0;"><strong>Forfald:</strong> ${new Date(invoice.due_date).toLocaleDateString('da-DK')}</p>
                        <p style="margin: 5px 0;">
                            <span style="background: ${statusColors[invoice.status]}; color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                                ${statusText[invoice.status]}
                            </span>
                        </p>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button onclick="viewInvoice(${invoice.id})" style="padding: 10px 20px; background: #2196f3; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                            👁️ Se Faktura
                        </button>
                        ${invoice.status === 'draft' ? `
                            <button onclick="sendInvoice(${invoice.id})" style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                                📧 Send
                            </button>
                        ` : ''}
                        <button onclick="deleteInvoice(${invoice.id})" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                            🗑️ Slet Faktura
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Load rejected tab
async function loadRejected() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('http://localhost:4000/api/quotes', {
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
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">❌</div>
                <h3>Ingen afviste tilbud</h3>
                <p style="margin: 10px 0;">Afviste tilbud vises her</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    quotes.forEach(quote => {
        html += `
            <div style="background: white; border: 1px solid #f44336; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 10px 0;">Tilbud ${quote.quote_number}</h4>
                        <p style="margin: 5px 0;"><strong>Kunde:</strong> ${quote.customer_name}</p>
                        <p style="margin: 5px 0;"><strong>Titel:</strong> ${quote.title}</p>
                        <p style="margin: 5px 0;"><strong>Total:</strong> ${formatCurrency(quote.total)}</p>
                        <p style="margin: 5px 0; color: #f44336; font-weight: 600;">❌ Afvist: ${new Date(quote.date).toLocaleDateString('da-DK')}</p>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button onclick="viewQuote(${quote.id})" style="padding: 10px 20px; background: #2196f3; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                            👁️ Se Tilbud
                        </button>
                        <button onclick="moveRejectedBackToQuote(${quote.id})" style="padding: 10px 20px; background: #9e9e9e; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                            ◀ Rykke til Tilbud
                        </button>
                        <button onclick="deleteQuote(${quote.id})" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                            🗑️ Slet
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Accept quote (convert to order)
async function acceptQuote(quoteId) {
    if (!confirm('Acceptér dette tilbud som ordre?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/quotes/${quoteId}/accept`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to accept quote');
        }
        
        const order = await response.json();
        
        alert(`✅ Tilbud accepteret som ordre ${order.order_number}!`);
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
        const response = await fetch(`http://localhost:4000/api/quotes/${quoteId}/reject`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to reject quote');
        }
        
        alert('❌ Tilbud afvist');
        await loadQuotes();
        
    } catch (error) {
        console.error('Reject quote error:', error);
        alert('Kunne ikke afvise tilbud: ' + error.message);
    }
}

// Move order back to quote status
async function moveOrderBackToQuote(quoteId) {
    if (!confirm('Rykke denne ordre tilbage til tilbud status?\n\nOrdren vil blive flyttet tilbage til Tilbud tabben.')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/quotes/${quoteId}/revert`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || 'Failed to revert order');
        }
        
        await response.json(); // Wait for response
        
        alert('✅ Ordre rykket tilbage til tilbud!');
        await loadOrders(); // Reload orders tab
        
    } catch (error) {
        console.error('Revert order error:', error);
        alert('Kunne ikke rykke ordre tilbage: ' + error.message);
    }
}

// Create extra work for an order
async function createExtraWork(parentOrderId) {
    const modal = document.createElement('div');
    modal.id = 'extraWorkModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10001; display: flex; align-items: center; justify-content: center; overflow-y: auto;';
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 10px; padding: 30px; max-width: 1000px; width: 90%; max-height: 90vh; overflow-y: auto; margin: 20px;">
            <h2 style="margin: 0 0 20px 0; color: #ff9800;">➕ Opret Ekstraarbejde</h2>
            <p style="color: #666; margin-bottom: 30px;">Ekstraarbejde oprettes som en under-ordre knyttet til hoved-ordren.</p>
            
            <form id="extraWorkForm" onsubmit="event.preventDefault(); saveExtraWork(${parentOrderId});">
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Titel *</label>
                    <input type="text" id="extraWorkTitle" required placeholder="F.eks. Ekstra gulvbelægning i gang" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Beskrivelse/Noter</label>
                    <textarea id="extraWorkNotes" rows="3" placeholder="Interne noter om ekstraarbejdet..." style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px; resize: vertical;"></textarea>
                </div>
                
                <div style="margin-bottom: 30px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">Arbejdslinjer</h3>
                        <button type="button" onclick="addExtraWorkLine()" style="padding: 8px 16px; background: #ff9800; color: white; border: none; border-radius: 5px; cursor: pointer;">
                            ➕ Tilføj Linje
                        </button>
                    </div>
                    <div id="extraWorkLinesContainer"></div>
                </div>
                
                <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin-bottom: 30px; border: 2px solid #ff9800;">
                    <div style="display: flex; justify-content: flex-end; gap: 15px; font-size: 16px;">
                        <div>
                            <strong>Subtotal:</strong> <span id="extraWorkSubtotal">0,00 kr.</span>
                        </div>
                        <div>
                            <strong>Moms (25%):</strong> <span id="extraWorkVat">0,00 kr.</span>
                        </div>
                        <div style="font-size: 20px; color: #ff9800;">
                            <strong>TOTAL:</strong> <span id="extraWorkTotal">0,00 kr.</span>
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="closeExtraWorkModal()" style="padding: 12px 24px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        Annuller
                    </button>
                    <button type="submit" style="padding: 12px 24px; background: #ff9800; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        💾 Opret Ekstraarbejde
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Initialize with one empty line
    extraWorkLines = [createEmptyLine()];
    renderExtraWorkLines();
    calculateExtraWorkTotals();
}

// Extra work lines management
let extraWorkLines = [];

function renderExtraWorkLines() {
    const container = document.getElementById('extraWorkLinesContainer');
    
    if (!extraWorkLines || extraWorkLines.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Ingen linjer endnu. Klik "➕ Tilføj Linje"</p>';
        return;
    }
    
    container.innerHTML = extraWorkLines.map((line, index) => `
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 2px solid #e0e0e0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong>Linje ${index + 1}</strong>
                <button type="button" onclick="removeExtraWorkLine(${index})" style="padding: 5px 10px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    🗑️ Fjern
                </button>
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Beskrivelse *</label>
                <textarea id="extraLineDesc${index}" rows="2" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; resize: vertical;" onchange="updateExtraWorkLine(${index})">${line.description || ''}</textarea>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 2fr; gap: 10px;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Antal *</label>
                    <input type="number" id="extraLineQty${index}" value="${line.quantity || 1}" min="0" step="0.01" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" onchange="updateExtraWorkLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Enhed *</label>
                    <select id="extraLineUnit${index}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" onchange="updateExtraWorkLine(${index})">
                        ${UNITS.map(unit => `<option value="${unit}" ${line.unit === unit ? 'selected' : ''}>${unit}</option>`).join('')}
                    </select>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">E.pris *</label>
                    <input type="number" id="extraLinePrice${index}" value="${line.unit_price || 0}" min="0" step="0.01" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" onchange="updateExtraWorkLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Rabat %</label>
                    <input type="number" id="extraLineDiscount${index}" value="${line.discount_percent || 0}" min="0" max="100" step="0.1" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;" onchange="updateExtraWorkLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Total</label>
                    <div id="extraLineTotal${index}" style="padding: 8px; background: white; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; font-weight: 600; color: #ff9800;">
                        ${formatCurrency(calculateLineTotal(line))}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function addExtraWorkLine() {
    extraWorkLines.push(createEmptyLine());
    renderExtraWorkLines();
}

function removeExtraWorkLine(index) {
    if (confirm('Fjern denne linje?')) {
        extraWorkLines.splice(index, 1);
        renderExtraWorkLines();
        calculateExtraWorkTotals();
    }
}

function updateExtraWorkLine(index) {
    const line = extraWorkLines[index];
    line.description = document.getElementById(`extraLineDesc${index}`).value;
    line.quantity = parseFloat(document.getElementById(`extraLineQty${index}`).value) || 0;
    line.unit = document.getElementById(`extraLineUnit${index}`).value;
    line.unit_price = parseFloat(document.getElementById(`extraLinePrice${index}`).value) || 0;
    line.discount_percent = parseFloat(document.getElementById(`extraLineDiscount${index}`).value) || 0;
    
    document.getElementById(`extraLineTotal${index}`).textContent = formatCurrency(calculateLineTotal(line));
    calculateExtraWorkTotals();
}

function calculateExtraWorkTotals() {
    let subtotal = 0;
    
    if (extraWorkLines) {
        extraWorkLines.forEach(line => {
            subtotal += calculateLineTotal(line);
        });
    }
    
    const vat = subtotal * 0.25;
    const total = subtotal + vat;
    
    document.getElementById('extraWorkSubtotal').textContent = formatCurrency(subtotal);
    document.getElementById('extraWorkVat').textContent = formatCurrency(vat);
    document.getElementById('extraWorkTotal').textContent = formatCurrency(total);
}

async function saveExtraWork(parentOrderId) {
    const title = document.getElementById('extraWorkTitle').value.trim();
    const notes = document.getElementById('extraWorkNotes').value.trim();
    
    if (!title) {
        alert('Indtast en titel');
        return;
    }
    
    if (!extraWorkLines || extraWorkLines.length === 0) {
        alert('Tilføj mindst én linje');
        return;
    }
    
    // Validate lines
    for (let i = 0; i < extraWorkLines.length; i++) {
        const line = extraWorkLines[i];
        if (!line.description || !line.description.trim()) {
            alert(`Linje ${i + 1}: Beskrivelse mangler`);
            return;
        }
        if (!line.quantity || line.quantity <= 0) {
            alert(`Linje ${i + 1}: Antal skal være større end 0`);
            return;
        }
        if (line.unit_price === undefined || line.unit_price < 0) {
            alert(`Linje ${i + 1}: Enhedspris skal være 0 eller højere`);
            return;
        }
    }
    
    const data = {
        title,
        notes: notes || null,
        lines: extraWorkLines
    };
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/quotes/${parentOrderId}/extra-work`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create extra work');
        }
        
        const extraWork = await response.json();
        
        closeExtraWorkModal();
        alert(`✅ Ekstraarbejde ${extraWork.full_order_number} oprettet!`);
        
        // Refresh workspace or navigate to the new extra work
        await openOrderWorkspace(extraWork.id);
        
    } catch (error) {
        console.error('Create extra work error:', error);
        alert('Kunne ikke oprette ekstraarbejde: ' + error.message);
    }
}

function closeExtraWorkModal() {
    const modal = document.getElementById('extraWorkModal');
    if (modal) {
        modal.remove();
    }
    extraWorkLines = [];
}

// Initialize quotes page
async function initQuotesPage() {
    await loadCustomers();
    await loadQuotes();
    switchOrderTab('quotes'); // Start on quotes tab
}

// Export functions
window.loadQuotes = loadQuotes;
window.showCreateQuote = showCreateQuote;
window.viewQuote = viewQuote;
window.editQuote = editQuote;
window.deleteQuote = deleteQuote;
window.sendQuote = sendQuote;
window.backToQuotesList = backToQuotesList;
window.showCustomersManagement = showCustomersManagement;
window.initQuotesPage = initQuotesPage;
window.addQuoteLine = addQuoteLine;
window.removeLine = removeLine;
window.updateLine = updateLine;
window.saveQuote = saveQuote;
window.saveAndPreviewQuote = saveAndPreviewQuote;
window.downloadQuotePDF = downloadQuotePDF;
window.showQuickCreateCustomer = showQuickCreateCustomer;
window.loadCustomersTable = loadCustomersTable;
window.showCreateCustomer = showCreateCustomer;
window.editCustomer = editCustomer;
window.updateCustomer = updateCustomer;
window.deleteCustomer = deleteCustomer;
window.closeCustomerModal = closeCustomerModal;
window.saveCustomerForm = saveCustomerForm;
// New tab system exports
window.switchOrderTab = switchOrderTab;
window.filterQuotesByStatus = filterQuotesByStatus;
window.filterInvoicesByStatus = filterInvoicesByStatus;
window.loadInvoicing = loadInvoicing;
window.loadOrders = loadOrders;
window.loadInvoiced = loadInvoiced;
window.loadRejected = loadRejected;
window.createInvoiceFromOrder = createInvoiceFromOrder;
window.viewInvoice = viewInvoice;
window.sendInvoice = sendInvoice;
window.acceptQuote = acceptQuote;
window.moveOrderBackToQuote = moveOrderBackToQuote;
window.createExtraWork = createExtraWork;

// --- ORDER WORKSPACE SYSTEM ---

let currentWorkspaceOrder = null;
let currentWorkspaceInvoice = null;
let workspaceExpenses = [];
let workspaceDocuments = [];
let workspaceTimeline = [];
let workspaceNotes = [];
let currentWorkspaceTab = 'overview';

// Open order workspace
async function openOrderWorkspace(orderId) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/orders/${orderId}/workspace`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load workspace');
        
        const data = await response.json();
        currentWorkspaceOrder = data.order;
        currentWorkspaceInvoice = data.invoice;
        workspaceExpenses = data.expenses.items;
        workspaceDocuments = data.documents;
        workspaceTimeline = data.timeline;
        workspaceNotes = data.notes;
        
        renderWorkspace(data);
    } catch (error) {
        console.error('Error loading workspace:', error);
        alert('Kunne ikke indlæse workspace: ' + error.message);
    }
}

// Render workspace
function renderWorkspace(data) {
    // Hide other views
    document.getElementById('quotesListView').style.display = 'none';
    document.getElementById('quotesFormView').style.display = 'none';
    document.getElementById('quotesPreviewView').style.display = 'none';
    document.getElementById('quotesCustomersView').style.display = 'none';
    
    // Show orders tab (reuse for workspace)
    const ordersTab = document.getElementById('orderTabOrders');
    if (ordersTab) {
        ordersTab.style.display = 'block';
    }
    
    const container = document.getElementById('ordersContainer');
    
    const fullOrderNumber = data.order.is_extra_work && data.order.parent_order_id 
        ? `${data.order.order_number}-${String(data.order.sub_number).padStart(2, '0')}`
        : data.order.order_number;
    
    container.innerHTML = `
        <div style="max-width: 1400px; margin: 0 auto;">
            <!-- Back button -->
            <div style="margin-bottom: 20px;">
                <button onclick="closeWorkspace()" style="padding: 10px 20px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    ◀ Tilbage til Ordrer
                </button>
            </div>
            
            <!-- Workspace Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <h1 style="margin: 0 0 10px 0; font-size: 32px;">📦 Ordre ${fullOrderNumber}</h1>
                        <p style="margin: 5px 0; font-size: 18px; opacity: 0.9;">${data.order.title}</p>
                        <p style="margin: 5px 0; opacity: 0.8;">Kunde: ${data.order.company_name}</p>
                    </div>
                    <div style="text-align: right;">
                        <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">Omsætning</div>
                            <div style="font-size: 28px; font-weight: 600;">${formatCurrency(data.financials.revenue)}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px;">
                            <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">Profit</div>
                            <div style="font-size: 28px; font-weight: 600;">${formatCurrency(data.financials.profit)}</div>
                            <div style="font-size: 12px; opacity: 0.8;">Margin: ${data.financials.profit_margin}%</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Tabs -->
            <div style="display: flex; gap: 10px; margin-bottom: 30px; border-bottom: 2px solid #e0e0e0;">
                <button onclick="switchWorkspaceTab('overview')" id="workspaceTabOverview" style="padding: 15px 25px; background: #667eea; color: white; border: none; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; font-size: 14px;">
                    📊 Oversigt
                </button>
                <button onclick="switchWorkspaceTab('expenses')" id="workspaceTabExpenses" style="padding: 15px 25px; background: transparent; color: #666; border: none; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; font-size: 14px;">
                    💰 Udgifter (${workspaceExpenses.length})
                </button>
                <button onclick="switchWorkspaceTab('documents')" id="workspaceTabDocuments" style="padding: 15px 25px; background: transparent; color: #666; border: none; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; font-size: 14px;">
                    📎 Dokumenter (${workspaceDocuments.length})
                </button>
                <button onclick="switchWorkspaceTab('timeline')" id="workspaceTabTimeline" style="padding: 15px 25px; background: transparent; color: #666; border: none; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; font-size: 14px;">
                    🕐 Timeline (${workspaceTimeline.length})
                </button>
                <button onclick="switchWorkspaceTab('notes')" id="workspaceTabNotes" style="padding: 15px 25px; background: transparent; color: #666; border: none; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: 600; font-size: 14px;">
                    📝 Noter (${workspaceNotes.length})
                </button>
            </div>
            
            <!-- Tab Content -->
            <div id="workspaceContent"></div>
        </div>
    `;
    
    switchWorkspaceTab('overview');
}

// Switch workspace tab
function switchWorkspaceTab(tab) {
    currentWorkspaceTab = tab;
    
    // Update button styles
    ['overview', 'expenses', 'documents', 'timeline', 'notes'].forEach(t => {
        const btn = document.getElementById(`workspaceTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (btn) {
            if (t === tab) {
                btn.style.background = '#667eea';
                btn.style.color = 'white';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = '#666';
            }
        }
    });
    
    // Render content
    const content = document.getElementById('workspaceContent');
    
    if (tab === 'overview') {
        renderWorkspaceOverview(content);
    } else if (tab === 'expenses') {
        renderWorkspaceExpenses(content);
    } else if (tab === 'documents') {
        renderWorkspaceDocuments(content);
    } else if (tab === 'timeline') {
        renderWorkspaceTimeline(content);
    } else if (tab === 'notes') {
        renderWorkspaceNotes(content);
    }
}

// Render overview tab with pie chart
function renderWorkspaceOverview(container) {
    const totalExpenses = workspaceExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const revenue = currentWorkspaceOrder.total || 0;
    const profit = revenue - totalExpenses;
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
            <!-- Left column: Stats and Chart -->
            <div>
                <!-- Stats cards -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px;">
                    <div style="background: white; padding: 20px; border-radius: 10px; border: 2px solid #e0e0e0;">
                        <div style="color: #666; font-size: 14px; margin-bottom: 5px;">💰 Omsætning</div>
                        <div style="font-size: 28px; font-weight: 600; color: #667eea;">${formatCurrency(revenue)}</div>
                    </div>
                    <div style="background: white; padding: 20px; border-radius: 10px; border: 2px solid #e0e0e0;">
                        <div style="color: #666; font-size: 14px; margin-bottom: 5px;">📊 Udgifter</div>
                        <div style="font-size: 28px; font-weight: 600; color: #f44336;">${formatCurrency(totalExpenses)}</div>
                    </div>
                    <div style="background: white; padding: 20px; border-radius: 10px; border: 2px solid #e0e0e0;">
                        <div style="color: #666; font-size: 14px; margin-bottom: 5px;">✅ Profit</div>
                        <div style="font-size: 28px; font-weight: 600; color: ${profit >= 0 ? '#4caf50' : '#f44336'};">${formatCurrency(profit)}</div>
                    </div>
                    <div style="background: white; padding: 20px; border-radius: 10px; border: 2px solid #e0e0e0;">
                        <div style="color: #666; font-size: 14px; margin-bottom: 5px;">📈 Margin</div>
                        <div style="font-size: 28px; font-weight: 600; color: ${profit >= 0 ? '#4caf50' : '#f44336'};">${revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0}%</div>
                    </div>
                </div>
                
                <!-- Profit Chart -->
                <div style="background: white; padding: 30px; border-radius: 10px; border: 2px solid #e0e0e0;">
                    <h3 style="margin: 0 0 20px 0;">🥧 Profit Oversigt</h3>
                    <canvas id="profitChart" width="400" height="480"></canvas>
                </div>
            </div>
            
            <!-- Right column: Quick info -->
            <div>
                <div style="background: white; padding: 30px; border-radius: 10px; border: 2px solid #e0e0e0; margin-bottom: 20px;">
                    <h3 style="margin: 0 0 20px 0;">📋 Ordre Detaljer</h3>
                    <div style="display: grid; gap: 15px;">
                        <div style="padding-bottom: 15px; border-bottom: 1px solid #e0e0e0;">
                            <div style="color: #666; font-size: 13px; margin-bottom: 5px;">Ordre Nummer</div>
                            <div style="font-weight: 600; font-size: 16px;">${currentWorkspaceOrder.order_number}</div>
                        </div>
                        <div style="padding-bottom: 15px; border-bottom: 1px solid #e0e0e0;">
                            <div style="color: #666; font-size: 13px; margin-bottom: 5px;">Kunde</div>
                            <div style="font-weight: 600; font-size: 16px;">${currentWorkspaceOrder.company_name}</div>
                        </div>
                        <div style="padding-bottom: 15px; border-bottom: 1px solid #e0e0e0;">
                            <div style="color: #666; font-size: 13px; margin-bottom: 5px;">Status</div>
                            <div style="font-weight: 600; font-size: 16px; color: #4caf50;">✅ Accepteret</div>
                        </div>
                        <div style="padding-bottom: 15px; border-bottom: 1px solid #e0e0e0;">
                            <div style="color: #666; font-size: 13px; margin-bottom: 5px;">Accepteret</div>
                            <div style="font-weight: 600; font-size: 16px;">${new Date(currentWorkspaceOrder.accepted_at).toLocaleDateString('da-DK')}</div>
                        </div>
                        <div>
                            <div style="color: #666; font-size: 13px; margin-bottom: 5px;">Oprettet af</div>
                            <div style="font-weight: 600; font-size: 16px;">${currentWorkspaceOrder.created_by_name}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Quick actions -->
                <div style="background: white; padding: 30px; border-radius: 10px; border: 2px solid #e0e0e0;">
                    <h3 style="margin: 0 0 20px 0;">⚡ Hurtige Handlinger</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button onclick="switchWorkspaceTab('expenses')" style="padding: 12px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; text-align: left;">
                            ➕ Tilføj Udgift
                        </button>
                        <button onclick="switchWorkspaceTab('documents')" style="padding: 12px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; text-align: left;">
                            📎 Upload Dokument
                        </button>
                        <button onclick="switchWorkspaceTab('notes')" style="padding: 12px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; text-align: left;">
                            📝 Tilføj Note
                        </button>
                        ${renderInvoiceButton()}
                        <button onclick="createExtraWork(${currentWorkspaceOrder.id})" style="padding: 12px 20px; background: #ff9800; color: white; border: none; border-radius: 5px; cursor: pointer; text-align: left;">
                            ➕ Ekstraarbejde
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Draw pie chart (simple Canvas implementation)
    setTimeout(() => {
        drawProfitChart(revenue, totalExpenses);
    }, 100);
}

// Draw profit chart
function drawProfitChart(revenue, expenses) {
    const canvas = document.getElementById('profitChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 150;
    
    const profit = revenue - expenses;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (revenue === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Ingen data endnu', centerX, centerY);
        return;
    }
    
    // Calculate percentages
    const profitPercent = Math.max(0, (profit / revenue));
    const expensePercent = (expenses / revenue);
    
    // Draw expense slice (red)
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI * expensePercent);
    ctx.closePath();
    ctx.fillStyle = '#f44336';
    ctx.fill();
    
    // Draw profit slice (green)
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, 2 * Math.PI * expensePercent, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = '#4caf50';
    ctx.fill();
    
    // Draw center circle (white)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.6, 0, 2 * Math.PI);
    ctx.fillStyle = 'white';
    ctx.fill();
    
    // Draw percentages
    ctx.fillStyle = '#333';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${(profitPercent * 100).toFixed(1)}%`, centerX, centerY - 10);
    ctx.font = '14px Arial';
    ctx.fillText('Profit', centerX, centerY + 10);
    
    // Legend (positioned lower to avoid overlap with chart)
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(50, canvas.height - 80, 20, 20);
    ctx.fillStyle = '#333';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Profit: ${formatCurrency(profit)}`, 80, canvas.height - 65);
    
    ctx.fillStyle = '#f44336';
    ctx.fillRect(50, canvas.height - 50, 20, 20);
    ctx.fillStyle = '#333';
    ctx.fillText(`Udgifter: ${formatCurrency(expenses)}`, 80, canvas.height - 35);
}

// Render expenses tab
function renderWorkspaceExpenses(container) {
    const totalExpenses = workspaceExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    container.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 10px; border: 2px solid #e0e0e0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                <div>
                    <h3 style="margin: 0 0 10px 0;">💰 Udgifter</h3>
                    <p style="margin: 0; color: #666;">Total udgifter: <strong>${formatCurrency(totalExpenses)}</strong></p>
                </div>
                <button onclick="showAddExpense()" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">
                    ➕ Tilføj Udgift
                </button>
            </div>
            
            <div id="expensesList"></div>
        </div>
    `;
    
    renderExpensesList();
}

// Render expenses list
function renderExpensesList() {
    const container = document.getElementById('expensesList');
    
    if (workspaceExpenses.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">💰</div>
                <h3>Ingen udgifter endnu</h3>
                <p>Tilføj udgifter for at tracke projektets omkostninger</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #f5f5f5;">
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0;">Dato</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0;">Beskrivelse</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0;">Kategori</th>
                    <th style="padding: 15px; text-align: right; border-bottom: 2px solid #e0e0e0;">Beløb</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid #e0e0e0;">Tilføjet af</th>
                    <th style="padding: 15px; text-align: center; border-bottom: 2px solid #e0e0e0;">Handlinger</th>
                </tr>
            </thead>
            <tbody>
                ${workspaceExpenses.map(exp => `
                    <tr style="border-bottom: 1px solid #e0e0e0;">
                        <td style="padding: 15px;">${new Date(exp.expense_date).toLocaleDateString('da-DK')}</td>
                        <td style="padding: 15px;">${exp.description}</td>
                        <td style="padding: 15px;">${exp.category || '-'}</td>
                        <td style="padding: 15px; text-align: right; font-weight: 600; color: #f44336;">${formatCurrency(exp.amount)}</td>
                        <td style="padding: 15px;">${exp.created_by_name}</td>
                        <td style="padding: 15px; text-align: center;">
                            <button onclick="editExpense(${exp.id})" style="padding: 6px 12px; margin-right: 5px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                ✏️ Rediger
                            </button>
                            <button onclick="deleteExpense(${exp.id})" style="padding: 6px 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                🗑️ Slet
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Show add expense dialog
function showAddExpense() {
    const modal = document.createElement('div');
    modal.id = 'expenseModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; width: 90%;">
            <h2 style="margin: 0 0 20px 0;">➕ Tilføj Udgift</h2>
            
            <form id="expenseForm" onsubmit="event.preventDefault(); saveExpense();">
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Beskrivelse *</label>
                    <textarea id="expenseDescription" required rows="3" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px; resize: vertical;"></textarea>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Beløb (DKK) *</label>
                        <input type="number" id="expenseAmount" required min="0" step="0.01" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Dato</label>
                        <input type="date" id="expenseDate" value="${new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                </div>
                
                <div style="margin-bottom: 30px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kategori</label>
                    <select id="expenseCategory" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                        <option value="">Vælg kategori...</option>
                        <option value="Materialer">Materialer</option>
                        <option value="Arbejdskraft">Arbejdskraft</option>
                        <option value="Transport">Transport</option>
                        <option value="Værktøj">Værktøj</option>
                        <option value="Andet">Andet</option>
                    </select>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="closeExpenseModal()" style="padding: 12px 24px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        Annuller
                    </button>
                    <button type="submit" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        💾 Gem Udgift
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Close expense modal
function closeExpenseModal() {
    const modal = document.getElementById('expenseModal');
    if (modal) modal.remove();
}

// Save expense
async function saveExpense() {
    const description = document.getElementById('expenseDescription').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const expense_date = document.getElementById('expenseDate').value;
    const category = document.getElementById('expenseCategory').value;
    
    if (!description || !amount) {
        alert('Udfyld beskrivelse og beløb');
        return;
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/orders/${currentWorkspaceOrder.id}/expenses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ description, amount, expense_date, category })
        });
        
        if (!response.ok) throw new Error('Failed to add expense');
        
        const expense = await response.json();
        workspaceExpenses.unshift(expense);
        
        closeExpenseModal();
        alert('✅ Udgift tilføjet!');
        
        // Refresh workspace
        await openOrderWorkspace(currentWorkspaceOrder.id);
        switchWorkspaceTab('expenses');
        
    } catch (error) {
        console.error('Add expense error:', error);
        alert('Kunne ikke tilføje udgift: ' + error.message);
    }
}

// Edit expense
function editExpense(expenseId) {
    const expense = workspaceExpenses.find(e => e.id === expenseId);
    if (!expense) return;
    
    const modal = document.createElement('div');
    modal.id = 'expenseModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 10px; padding: 30px; max-width: 600px; width: 90%;">
            <h2 style="margin: 0 0 20px 0;">✏️ Rediger Udgift</h2>
            
            <form id="expenseForm" onsubmit="event.preventDefault(); updateExpense(${expenseId});">
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Beskrivelse *</label>
                    <textarea id="expenseDescription" required rows="3" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px; resize: vertical;">${expense.description}</textarea>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Beløb (DKK) *</label>
                        <input type="number" id="expenseAmount" required min="0" step="0.01" value="${expense.amount}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Dato</label>
                        <input type="date" id="expenseDate" value="${expense.expense_date}" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                    </div>
                </div>
                
                <div style="margin-bottom: 30px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kategori</label>
                    <select id="expenseCategory" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                        <option value="">Vælg kategori...</option>
                        <option value="Materialer" ${expense.category === 'Materialer' ? 'selected' : ''}>Materialer</option>
                        <option value="Arbejdskraft" ${expense.category === 'Arbejdskraft' ? 'selected' : ''}>Arbejdskraft</option>
                        <option value="Transport" ${expense.category === 'Transport' ? 'selected' : ''}>Transport</option>
                        <option value="Værktøj" ${expense.category === 'Værktøj' ? 'selected' : ''}>Værktøj</option>
                        <option value="Andet" ${expense.category === 'Andet' ? 'selected' : ''}>Andet</option>
                    </select>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="closeExpenseModal()" style="padding: 12px 24px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        Annuller
                    </button>
                    <button type="submit" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        💾 Gem Ændringer
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Update expense
async function updateExpense(expenseId) {
    const description = document.getElementById('expenseDescription').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const expense_date = document.getElementById('expenseDate').value;
    const category = document.getElementById('expenseCategory').value;
    
    if (!description || !amount) {
        alert('Udfyld beskrivelse og beløb');
        return;
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/orders/${currentWorkspaceOrder.id}/expenses/${expenseId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ description, amount, expense_date, category })
        });
        
        if (!response.ok) throw new Error('Failed to update expense');
        
        closeExpenseModal();
        alert('✅ Udgift opdateret!');
        
        // Refresh workspace
        await openOrderWorkspace(currentWorkspaceOrder.id);
        switchWorkspaceTab('expenses');
        
    } catch (error) {
        console.error('Update expense error:', error);
        alert('Kunne ikke opdatere udgift: ' + error.message);
    }
}

// Delete expense
async function deleteExpense(expenseId) {
    if (!confirm('Slet denne udgift?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/orders/${currentWorkspaceOrder.id}/expenses/${expenseId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to delete expense');
        
        alert('✅ Udgift slettet!');
        
        // Refresh
        await openOrderWorkspace(currentWorkspaceOrder.id);
        switchWorkspaceTab('expenses');
        
    } catch (error) {
        console.error('Delete expense error:', error);
        alert('Kunne ikke slette udgift: ' + error.message);
    }
}

// Render documents tab (placeholder)
function renderWorkspaceDocuments(container) {
    container.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 10px; border: 2px solid #e0e0e0;">
            <h3 style="margin: 0 0 20px 0;">📎 Dokumenter</h3>
            <p style="color: #666;">Dokument upload funktionalitet kommer snart...</p>
        </div>
    `;
}

// Convert UTC timestamp to local Danish time
function convertUTCtoLocal(utcDateString) {
    // If timestamp doesn't have 'Z' suffix, add it to indicate UTC
    let dateStr = utcDateString;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        dateStr = dateStr + 'Z';
    }
    
    const date = new Date(dateStr);
    
    // Format: DD.MM.YYYY HH:MM:SS
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

// Render timeline tab (placeholder)
function renderWorkspaceTimeline(container) {
    container.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 10px; border: 2px solid #e0e0e0;">
            <h3 style="margin: 0 0 20px 0;">🕐 Timeline</h3>
            ${workspaceTimeline.length === 0 ? 
                '<p style="color: #666; text-align: center; padding: 40px;">Ingen aktiviteter endnu</p>' :
                workspaceTimeline.map(entry => `
                    <div style="padding: 15px; border-left: 3px solid #667eea; margin-bottom: 15px; background: #f9f9f9;">
                        <div style="font-weight: 600; margin-bottom: 5px;">${entry.description}</div>
                        <div style="font-size: 12px; color: #666;">${entry.user_name} • ${convertUTCtoLocal(entry.created_at)}</div>
                    </div>
                `).join('')
            }
        </div>
    `;
}

// Render notes tab (placeholder)
function renderWorkspaceNotes(container) {
    container.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 10px; border: 2px solid #e0e0e0;">
            <h3 style="margin: 0 0 20px 0;">📝 Noter</h3>
            <p style="color: #666;">Noter funktionalitet kommer snart...</p>
        </div>
    `;
}

// Close workspace
function closeWorkspace() {
    currentWorkspaceOrder = null;
    switchOrderTab('orders');
    loadOrders();
}

// Render invoice button based on invoice status
function renderInvoiceButton() {
    if (currentWorkspaceInvoice) {
        // Invoice exists - show "See Invoice" button
        return `
            <button onclick="viewInvoice(${currentWorkspaceInvoice.id})" style="padding: 12px 20px; background: #2196f3; color: white; border: none; border-radius: 5px; cursor: pointer; text-align: left;">
                👁️ Se Faktura ${currentWorkspaceInvoice.invoice_number}
            </button>
        `;
    } else {
        // No invoice - show "Create Invoice" button
        return `
            <button onclick="createInvoiceFromOrder(${currentWorkspaceOrder.id})" style="padding: 12px 20px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer; text-align: left;">
                💰 Opret Faktura
            </button>
        `;
    }
}

// Move rejected quote back to sent status
async function moveRejectedBackToQuote(quoteId) {
    if (!confirm('Rykke dette afviste tilbud tilbage til tilbudsfasen?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`http://localhost:4000/api/quotes/${quoteId}/revert`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || 'Failed to revert quote');
        }
        
        alert('✅ Tilbud rykket tilbage til tilbudsfasen!');
        await loadRejected();
        
    } catch (error) {
        console.error('Revert quote error:', error);
        alert('Kunne ikke rykke tilbud tilbage: ' + error.message);
    }
}

// Export contacts functions
window.loadCustomerContacts = loadCustomerContacts;
window.showAddContact = showAddContact;
window.saveContact = saveContact;
window.editContact = editContact;
window.updateContact = updateContact;
window.deleteContact = deleteContact;
window.closeContactModal = closeContactModal;

// Export workspace functions
window.openOrderWorkspace = openOrderWorkspace;
window.switchWorkspaceTab = switchWorkspaceTab;
window.closeWorkspace = closeWorkspace;
window.showAddExpense = showAddExpense;
window.closeExpenseModal = closeExpenseModal;
window.saveExpense = saveExpense;
window.editExpense = editExpense;
window.updateExpense = updateExpense;
window.deleteExpense = deleteExpense;
window.deleteInvoice = deleteInvoice;
window.deleteInvoiceFromPreview = deleteInvoiceFromPreview;
window.rejectQuote = rejectQuote;
window.moveRejectedBackToQuote = moveRejectedBackToQuote;
