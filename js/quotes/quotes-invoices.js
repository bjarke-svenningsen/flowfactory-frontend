// js/quotes/quotes-invoices.js - Invoice management functionality

let currentInvoiceFilter = 'all';

// Load invoiced tab (orders with invoices)
async function loadInvoiced() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/invoices', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load invoices');
        
        const data = await response.json();
        
        // Handle both array format and object format (defensive programming)
        const invoices = Array.isArray(data) ? data : (data.invoices || []);
        
        renderTabSlice('invoiced', invoices, renderInvoicedContent);
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
            <div class="list-empty">
                <div class="icon-box"><i data-lucide="coins"></i></div>
                <h3>Der er ingen fakturaer endnu</h3>
                <p>Opret en faktura fra en accepteret ordre</p>
            </div>
        `;
        return;
    }
    
    const badgeClass = {
        'draft': 'badge--draft',
        'sent': 'badge--sent',
        'paid': 'badge--accepted'
    };
    const statusText = {
        'draft': 'Udkast',
        'sent': 'Sendt',
        'paid': 'Betalt'
    };
    const cardClass = {
        'draft': 'list-card--draft',
        'sent': 'list-card--sent',
        'paid': 'list-card--paid'
    };
    
    let html = `<div class="list-section-head"><span class="title">Fakturerede ordrer og fakturaer</span><span class="badge badge--invoiced">${invoices.length}</span></div>`;
    invoices.forEach(invoice => {
        html += `
            <div class="list-card ${cardClass[invoice.status] || 'list-card--draft'}">
                <div class="list-card-head">
                    <h4 class="list-card-title">Faktura ${invoice.invoice_number}</h4>
                    <span class="badge ${badgeClass[invoice.status] || 'badge--draft'}">${statusText[invoice.status] || 'Udkast'}</span>
                </div>
                <div class="list-card-grid">
                    <div class="list-card-field"><span class="label">Kunde</span><span class="value">${invoice.customer_name}</span></div>
                    <div class="list-card-field"><span class="label">Ordre</span><span class="value">${invoice.full_order_number}</span></div>
                    <div class="list-card-field"><span class="label">Forfald</span><span class="value">${new Date(invoice.due_date).toLocaleDateString('da-DK')}</span></div>
                    <div class="list-card-total"><span class="label">Total</span>${formatCurrency(invoice.total)}</div>
                </div>
                <div class="list-card-actions">
                    ${btn('secondary', 'eye', 'Se Faktura', { onclick: `viewInvoice(${invoice.id})` })}
                    ${btn(invoice.status === 'draft' ? 'primary' : 'secondary', 'send', 'Send', { onclick: `sendInvoice(${invoice.id})` })}
                    ${btn('icon', 'trash-2', null, { title: 'Slet Faktura', onclick: `deleteInvoice(${invoice.id})` })}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

// Filter invoices by status
function filterInvoicesByStatus(status) {
    currentInvoiceFilter = status;
    
    // Update filter pills — styres KUN af .active-klassen
    ['InvAll', 'Accepted', 'Invoiced'].forEach(s => {
        const btn = document.getElementById(`filter${s}`);
        if (btn) {
            btn.classList.toggle('active', (s === 'InvAll' && status === 'all') || s.toLowerCase() === status);
        }
    });
    
    // No filters in invoiced tab anymore - just reload
    loadInvoiced();
}

// Create invoice from order
async function createInvoiceFromOrder(orderId) {
    if (!confirm('Opret faktura for denne ordre?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/invoices/from-order/${orderId}`, {
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
        
        alert(`Faktura ${invoice.invoice_number} oprettet!`);
        
        // Refresh workspace if open, otherwise reload invoiced tab
        if (typeof currentWorkspaceOrder !== 'undefined' && currentWorkspaceOrder && currentWorkspaceOrder.id === orderId) {
            await openOrderWorkspace(orderId);
        } else {
            loadInvoiced();
        }
        
    } catch (error) {
        console.error('Create invoice error:', error);
        alert('Kunne ikke oprette faktura: ' + error.message);
    }
}

// View invoice
async function viewInvoice(invoiceId) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/invoices/${invoiceId}`, {
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
        <div class="quote-sheet-wrap">
            <div class="preview-actions">
                <button onclick="switchOrderTab('invoiced'); loadInvoiced();" class="btn btn-secondary">
                    <i data-lucide="arrow-left"></i> Tilbage
                </button>
                ${invoice.status === 'draft' ? `
                    <button onclick="sendInvoice(${invoice.id})" class="btn btn-primary">
                        <i data-lucide="send"></i> Send til Kunde
                    </button>
                ` : ''}
                <button onclick="window.print()" class="btn btn-secondary">
                    <i data-lucide="printer"></i> Print / PDF
                </button>
                <button onclick="deleteInvoiceFromPreview(${invoice.id})" class="btn btn-danger toolbar-end">
                    <i data-lucide="trash-2"></i> Slet
                </button>
            </div>
            
            <div class="quote-sheet">
                <!-- Minimal Header -->
                <div style="display: flex; justify-content: space-between; align-items: start; padding-bottom: 30px; border-bottom: 1px solid var(--text); margin-bottom: 40px;">
                    <div style="background: transparent !important; margin-top: 0; padding: 0;">
                        <img src="seestlogo.png" alt="SG Seest Gulvteknik ApS" style="height: 80px; width: auto; display: block; background: transparent !important; background-color: transparent !important; margin: 0; padding: 0;">
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0 0 15px 0; font-size: 24px; font-weight: 700; color: var(--text);">FAKTURA</h2>
                        <table style="border-collapse: collapse; margin-left: auto;">
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: var(--text-muted);">Kundenummer:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: var(--text); font-weight: 600;">${invoice.customer_id || 'N/A'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: var(--text-muted);">Faktura nr.:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: var(--text); font-weight: 600;">${invoice.invoice_number}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: var(--text-muted);">Ordre nr.:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: var(--text); font-weight: 600;">${invoice.full_order_number}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: var(--text-muted);">Dato:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: var(--text);">${new Date(invoice.invoice_date).toLocaleDateString('da-DK')}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: var(--text-muted);">Forfaldsdato:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: var(--text);">${new Date(invoice.due_date).toLocaleDateString('da-DK')}</td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <!-- Customer Info -->
                <div style="margin-bottom: 40px;">
                    <h3 style="margin: 0 0 10px 0; color: var(--text); font-size: 13px; font-weight: 700;">KUNDE:</h3>
                    <p style="margin: 0 0 3px 0; font-weight: 600; font-size: 13px; color: var(--text);">${invoice.company_name}</p>
                    ${invoice.contact_person ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: var(--text-muted);">Att: ${invoice.contact_person}</p>` : ''}
                    ${invoice.address ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: var(--text-muted);">${invoice.address}</p>` : ''}
                    ${invoice.postal_code && invoice.city ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: var(--text-muted);">${invoice.postal_code} ${invoice.city}</p>` : ''}
                    ${invoice.customer_email ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: var(--text-muted);">${invoice.customer_email}</p>` : ''}
                    ${invoice.customer_phone ? `<p style="margin: 0; font-size: 12px; color: var(--text-muted);">${invoice.customer_phone}</p>` : ''}
                </div>
                
                ${invoice.requisition_number ? `
                    <div style="margin-bottom: 30px;">
                        <p style="margin: 0; font-size: 12px; color: var(--text-muted);"><strong>Rekvisitionsnummer:</strong> ${invoice.requisition_number}</p>
                    </div>
                ` : ''}
                
                <!-- Lines Table -->
                <div class="doc-table-scroll">
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
                        ${invoice.lines.map(line => `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 10px; vertical-align: top; color: var(--text); font-size: 12px;">${line.description}</td>
                                <td style="padding: 10px; text-align: center; color: var(--text); font-size: 12px;">${line.quantity}</td>
                                <td style="padding: 10px; text-align: center; color: var(--text); font-size: 12px;">${line.unit}</td>
                                <td style="padding: 10px; text-align: right; color: var(--text); font-size: 12px;">${formatCurrency(line.unit_price)}</td>
                                <td style="padding: 10px; text-align: right; color: var(--text); font-size: 12px;">${line.discount_percent}%</td>
                                <td style="padding: 10px; text-align: right; font-weight: 600; color: var(--text); font-size: 12px;">${formatCurrency(line.line_total)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
                
                <!-- Totals -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
                    <div style="min-width: 320px;">
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                            <span style="font-size: 12px; color: var(--text);">Subtotal:</span>
                            <strong style="font-size: 12px; color: var(--text);">${formatCurrency(invoice.subtotal)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border);">
                            <span style="font-size: 12px; color: var(--text);">Moms (25%):</span>
                            <strong style="font-size: 12px; color: var(--text);">${formatCurrency(invoice.vat_amount)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 15px 0; border-top: 2px solid var(--text); margin-top: 10px;">
                            <span style="font-size: 14px; font-weight: 700; color: var(--text);">AT BETALE:</span>
                            <strong style="font-size: 16px; font-weight: 700; color: var(--text);">${formatCurrency(invoice.total)}</strong>
                        </div>
                    </div>
                </div>
                
                <!-- Payment Terms -->
                <div style="margin-bottom: 25px; padding: 15px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
                    <h3 style="margin: 0 0 8px 0; color: var(--text); font-size: 12px; font-weight: 700;">BETALINGSBETINGELSER:</h3>
                    <p style="margin: 0; color: var(--text); font-size: 11px; line-height: 1.5;">${invoice.payment_terms}</p>
                </div>
                
                ${invoice.notes ? `
                    <div style="margin-bottom: 25px; padding: 15px 0; border-bottom: 1px solid var(--border);">
                        <h3 style="margin: 0 0 8px 0; color: var(--text); font-size: 12px; font-weight: 700;">NOTER:</h3>
                        <p style="margin: 0; color: var(--text); font-size: 11px; line-height: 1.5; white-space: pre-wrap;">${invoice.notes}</p>
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
    `;
    if (window.lucide) { try { lucide.createIcons(); } catch (e) { /* ignore */ } }
}

// Send invoice
async function sendInvoice(invoiceId) {
    if (!confirm('Send denne faktura til kunden via email?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/invoices/${invoiceId}/send`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to send invoice');
        }
        
        alert('Faktura sendt til kunde');
        loadInvoiced();
        
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
        const response = await fetch(`/api/invoices/${invoiceId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete invoice');
        }
        
        alert('Faktura slettet!');
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
        const response = await fetch(`/api/invoices/${invoiceId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete invoice');
        }
        
        alert('Faktura slettet!');
        switchOrderTab('invoiced');
        loadInvoiced();
        
    } catch (error) {
        console.error('Delete invoice error:', error);
        alert('Kunne ikke slette faktura: ' + error.message);
    }
}

// Export functions
window.loadInvoiced = loadInvoiced;
window.filterInvoicesByStatus = filterInvoicesByStatus;
window.createInvoiceFromOrder = createInvoiceFromOrder;
window.viewInvoice = viewInvoice;
window.sendInvoice = sendInvoice;
window.deleteInvoice = deleteInvoice;
window.deleteInvoiceFromPreview = deleteInvoiceFromPreview;
