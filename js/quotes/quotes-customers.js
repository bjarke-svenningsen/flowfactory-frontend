// js/quotes/quotes-customers.js - Customer and contact person management

let allCustomers = [];
let customerContacts = [];

// Load customers
async function loadCustomers() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/customers', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load customers');
        
        allCustomers = await response.json();
    } catch (error) {
        console.error('Error loading customers:', error);
        allCustomers = [];
    }
}

// Show customers management
function showCustomersManagement() {
    // This will be implemented in the HTML
    document.getElementById('quotesListView').style.display = 'none';
    document.getElementById('quotesCustomersView').style.display = 'block';
    loadCustomersTable();
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
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/customers', {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/customers/${customerId}`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/customers/${customerId}`, {
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

// Load contacts for a customer
async function loadCustomerContacts(customerId) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/customers/${customerId}/contacts`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/customers/${customerId}/contacts`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/customers/${customerId}/contacts/${contactId}`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/customers/${customerId}/contacts/${contactId}`, {
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

// Export functions
window.allCustomers = allCustomers;
window.loadCustomers = loadCustomers;
window.showCustomersManagement = showCustomersManagement;
window.loadCustomersTable = loadCustomersTable;
window.showCreateCustomer = showCreateCustomer;
window.showQuickCreateCustomer = showQuickCreateCustomer;
window.editCustomer = editCustomer;
window.updateCustomer = updateCustomer;
window.deleteCustomer = deleteCustomer;
window.closeCustomerModal = closeCustomerModal;
window.saveCustomerForm = saveCustomerForm;
window.loadCustomerContacts = loadCustomerContacts;
window.showAddContact = showAddContact;
window.saveContact = saveContact;
window.editContact = editContact;
window.updateContact = updateContact;
window.deleteContact = deleteContact;
window.closeContactModal = closeContactModal;
