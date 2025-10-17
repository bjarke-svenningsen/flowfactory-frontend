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
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/quotes', {
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

// View quote - Opens workspace if order, otherwise preview
async function viewQuote(quoteId) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/quotes/${quoteId}`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/quotes/${quoteId}`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/quotes/${quoteId}`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/quotes/${quoteId}/send`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/customers/${customerId}/contacts`, {
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
            ? `https://flowfactory-frontend.onrender.com/api/quotes/${currentQuote.id}`
            : 'https://flowfactory-frontend.onrender.com/api/quotes';
        
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
    
    // Ensure lines is an array
    if (!currentQuote.lines || !Array.isArray(currentQuote.lines)) {
        console.error('Invalid quote lines:', currentQuote.lines);
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: #f44336;">⚠️ Kunne ikke indlæse tilbudslinjer. Prøv at genindlæse siden.</div>';
        return;
    }
    
    // Professional PDF-style preview matching invoice design
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
            
            <div style="background: white; padding: 60px;">
                <!-- Minimal Header -->
                <div style="display: flex; justify-content: space-between; align-items: start; padding-bottom: 30px; border-bottom: 1px solid #000; margin-bottom: 40px;">
                    <div>
                        <img src="flowfactory-logo.png" alt="FlowFactory ApS" style="height: 100px; width: auto; display: block; background: white; padding: 10px;">
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0 0 15px 0; font-size: 24px; font-weight: 700; color: #000;">TILBUD</h2>
                        <table style="border-collapse: collapse; margin-left: auto;">
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: #666;">Kundenummer:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: #000; font-weight: 600;">${currentQuote.customer_id || 'N/A'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: #666;">Tilbud nr.:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: #000; font-weight: 600;">${currentQuote.quote_number}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: #666;">Dato:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: #000;">${new Date(currentQuote.date).toLocaleDateString('da-DK')}</td>
                            </tr>
                            ${currentQuote.valid_until ? `
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: #666;">Gyldig til:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: #000;">${new Date(currentQuote.valid_until).toLocaleDateString('da-DK')}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>
                </div>
                
                <!-- Customer Info -->
                <div style="margin-bottom: 40px;">
                    <h3 style="margin: 0 0 10px 0; color: #000; font-size: 13px; font-weight: 700;">KUNDE:</h3>
                    <p style="margin: 0 0 3px 0; font-weight: 600; font-size: 13px; color: #000;">${currentQuote.company_name}</p>
                    ${currentQuote.contact_person_name ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: #666;">Att: ${currentQuote.contact_person_name}${currentQuote.contact_person_title ? ` - ${currentQuote.contact_person_title}` : ''}</p>` : 
                      currentQuote.contact_person ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: #666;">Att: ${currentQuote.contact_person}</p>` : ''}
                    ${currentQuote.att_person && !currentQuote.contact_person_name ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: #666;">Att: ${currentQuote.att_person}</p>` : ''}
                    ${currentQuote.address ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: #666;">${currentQuote.address}</p>` : ''}
                    ${currentQuote.postal_code && currentQuote.city ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: #666;">${currentQuote.postal_code} ${currentQuote.city}</p>` : ''}
                    ${currentQuote.contact_person_email ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: #666;">${currentQuote.contact_person_email}</p>` : 
                      currentQuote.customer_email ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: #666;">${currentQuote.customer_email}</p>` : ''}
                    ${currentQuote.contact_person_phone ? `<p style="margin: 0; font-size: 12px; color: #666;">${currentQuote.contact_person_phone}</p>` : 
                      currentQuote.customer_phone ? `<p style="margin: 0; font-size: 12px; color: #666;">${currentQuote.customer_phone}</p>` : ''}
                </div>
                
                <!-- Title/Description -->
                <div style="margin-bottom: 30px;">
                    <h3 style="margin: 0; font-size: 14px; color: #000; font-weight: 700;">Tilbud på: ${currentQuote.title}</h3>
                    ${currentQuote.requisition_number ? `<p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">Rekvisitionsnummer: ${currentQuote.requisition_number}</p>` : ''}
                </div>
                
                <!-- Lines Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                    <thead>
                        <tr style="border-bottom: 2px solid #000;">
                            <th style="padding: 12px 10px; text-align: left; font-weight: 700; font-size: 12px; color: #000;">Beskrivelse</th>
                            <th style="padding: 12px 10px; text-align: center; font-weight: 700; font-size: 12px; color: #000; width: 80px;">Antal</th>
                            <th style="padding: 12px 10px; text-align: center; font-weight: 700; font-size: 12px; color: #000; width: 80px;">Enhed</th>
                            <th style="padding: 12px 10px; text-align: right; font-weight: 700; font-size: 12px; color: #000; width: 110px;">E.pris</th>
                            <th style="padding: 12px 10px; text-align: right; font-weight: 700; font-size: 12px; color: #000; width: 70px;">Rabat</th>
                            <th style="padding: 12px 10px; text-align: right; font-weight: 700; font-size: 12px; color: #000; width: 120px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${currentQuote.lines.map(line => {
                            const lineTotal = calculateLineTotal(line);
                            return `
                                <tr style="border-bottom: 1px solid #ddd;">
                                    <td style="padding: 10px; vertical-align: top; color: #000; font-size: 12px;">${line.description}</td>
                                    <td style="padding: 10px; text-align: center; color: #000; font-size: 12px;">${line.quantity}</td>
                                    <td style="padding: 10px; text-align: center; color: #000; font-size: 12px;">${line.unit}</td>
                                    <td style="padding: 10px; text-align: right; color: #000; font-size: 12px;">${formatCurrency(line.unit_price)}</td>
                                    <td style="padding: 10px; text-align: right; color: #000; font-size: 12px;">${line.discount_percent}%</td>
                                    <td style="padding: 10px; text-align: right; font-weight: 600; color: #000; font-size: 12px;">${formatCurrency(lineTotal)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                
                <!-- Totals -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
                    <div style="min-width: 320px;">
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ddd;">
                            <span style="font-size: 12px; color: #000;">Subtotal:</span>
                            <strong style="font-size: 12px; color: #000;">${formatCurrency(currentQuote.subtotal)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ddd;">
                            <span style="font-size: 12px; color: #000;">Moms (25%):</span>
                            <strong style="font-size: 12px; color: #000;">${formatCurrency(currentQuote.vat_amount)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 15px 0; border-top: 2px solid #000; margin-top: 10px;">
                            <span style="font-size: 14px; font-weight: 700; color: #000;">TOTAL:</span>
                            <strong style="font-size: 16px; font-weight: 700; color: #000;">${formatCurrency(currentQuote.total)}</strong>
                        </div>
                    </div>
                </div>
                
                <!-- Payment Terms -->
                ${currentQuote.terms ? `
                    <div style="margin-bottom: 25px; padding: 15px 0; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd;">
                        <h3 style="margin: 0 0 8px 0; color: #000; font-size: 12px; font-weight: 700;">BETALINGSBETINGELSER:</h3>
                        <p style="margin: 0; color: #000; font-size: 11px; line-height: 1.5; white-space: pre-wrap;">${currentQuote.terms}</p>
                    </div>
                ` : ''}
                
                ${currentQuote.attachments && currentQuote.attachments.length > 0 ? `
                    <div style="margin-bottom: 25px; padding: 15px 0; border-bottom: 1px solid #ddd;">
                        <h3 style="margin: 0 0 8px 0; color: #000; font-size: 12px; font-weight: 700;">VEDHÆFTEDE DOKUMENTER:</h3>
                        ${currentQuote.attachments.map(att => `
                            <div style="margin: 5px 0; color: #000; font-size: 11px;">${att.original_name}</div>
                        `).join('')}
                    </div>
                ` : ''}
                
                <!-- Footer -->
                <div style="border-top: 1px solid #000; padding-top: 20px; margin-top: 40px; text-align: center;">
                    <p style="margin: 0; color: #666; font-size: 11px;">
                        FlowFactory ApS • Erhvervsvej 123 • 8600 Silkeborg • CVR: 12345678<br>
                        Email: kontakt@flowfactory.dk • Telefon: +45 12 34 56 78 • www.flowfactory.dk
                    </p>
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/quotes/${quoteId}/accept`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/quotes/${quoteId}/reject`, {
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

// Tab switching
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

// Load orders tab (accepted quotes not yet invoiced)
async function loadOrders() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/quotes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load quotes');
        
        const allQuotes = await response.json();
        // Filter: only accepted orders that are NOT extra work (main orders only)
        const orders = allQuotes.filter(q => q.status === 'accepted' && !q.is_extra_work);
        
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

// Load rejected tab
async function loadRejected() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/quotes', {
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

// Move order back to quote status
async function moveOrderBackToQuote(quoteId) {
    if (!confirm('Rykke denne ordre tilbage til tilbud status?\n\nOrdren vil blive flyttet tilbage til Tilbud tabben.')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/quotes/${quoteId}/revert`, {
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

// Move rejected quote back to sent status
async function moveRejectedBackToQuote(quoteId) {
    if (!confirm('Rykke dette afviste tilbud tilbage til tilbudsfasen?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/quotes/${quoteId}/revert`, {
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

// Initialize quotes page
async function initQuotesPage() {
    await loadCustomers();
    await loadQuotes();
    
    // Check if URL is a workspace URL (e.g., #/orders/123/workspace)
    const hash = window.location.hash;
    const isWorkspaceURL = hash.match(/^#\/orders\/\d+\/workspace$/);
    
    // Only switch to quotes tab if NOT restoring a workspace
    if (!isWorkspaceURL) {
        switchOrderTab('quotes'); // Start on quotes tab
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
window.loadOrders = loadOrders;
window.loadRejected = loadRejected;
window.acceptQuote = acceptQuote;
window.rejectQuote = rejectQuote;
window.moveOrderBackToQuote = moveOrderBackToQuote;
window.moveRejectedBackToQuote = moveRejectedBackToQuote;
window.loadQuoteContactPersons = loadQuoteContactPersons;
