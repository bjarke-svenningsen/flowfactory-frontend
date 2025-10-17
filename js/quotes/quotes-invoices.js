// js/quotes/quotes-invoices.js - Invoice management functionality

let currentInvoiceFilter = 'all';

// Load invoiced tab (orders with invoices)
async function loadInvoiced() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/invoices', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load invoices');
        
        const data = await response.json();
        
        // Handle both array format and object format (defensive programming)
        const invoices = Array.isArray(data) ? data : (data.invoices || []);
        
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

// Filter invoices by status
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

// Create invoice from order
async function createInvoiceFromOrder(orderId) {
    if (!confirm('Opret faktura for denne ordre?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/invoices/from-order/${orderId}`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/invoices/${invoiceId}`, {
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
            
            <div style="background: white; padding: 60px; border: 1px solid #000;">
                <!-- Minimal Header -->
                <div style="display: flex; justify-content: space-between; align-items: start; padding-bottom: 30px; border-bottom: 1px solid #000; margin-bottom: 40px;">
                    <div>
                        <h1 style="margin: 0 0 5px 0; color: #000; font-size: 24px; font-weight: 700;">FlowFactory ApS</h1>
                        <p style="margin: 0; color: #666; font-size: 12px;">Erhvervsvej 123, 8600 Silkeborg</p>
                        <p style="margin: 0; color: #666; font-size: 12px;">CVR: 12345678</p>
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0 0 15px 0; font-size: 24px; font-weight: 700; color: #000;">FAKTURA</h2>
                        <table style="border-collapse: collapse; margin-left: auto;">
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: #666;">Kundenummer:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: #000; font-weight: 600;">${invoice.customer_id || 'N/A'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: #666;">Faktura nr.:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: #000; font-weight: 600;">${invoice.invoice_number}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: #666;">Ordre nr.:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: #000; font-weight: 600;">${invoice.full_order_number}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: #666;">Dato:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: #000;">${new Date(invoice.invoice_date).toLocaleDateString('da-DK')}</td>
                            </tr>
                            <tr>
                                <td style="padding: 3px 10px 3px 0; font-size: 12px; color: #666;">Forfaldsdato:</td>
                                <td style="padding: 3px 0; font-size: 12px; color: #000;">${new Date(invoice.due_date).toLocaleDateString('da-DK')}</td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <!-- Customer Info -->
                <div style="margin-bottom: 40px;">
                    <h3 style="margin: 0 0 10px 0; color: #000; font-size: 13px; font-weight: 700;">KUNDE:</h3>
                    <p style="margin: 0 0 3px 0; font-weight: 600; font-size: 13px; color: #000;">${invoice.company_name}</p>
                    ${invoice.contact_person ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: #666;">Att: ${invoice.contact_person}</p>` : ''}
                    ${invoice.address ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: #666;">${invoice.address}</p>` : ''}
                    ${invoice.postal_code && invoice.city ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: #666;">${invoice.postal_code} ${invoice.city}</p>` : ''}
                    ${invoice.customer_email ? `<p style="margin: 0 0 3px 0; font-size: 12px; color: #666;">${invoice.customer_email}</p>` : ''}
                    ${invoice.customer_phone ? `<p style="margin: 0; font-size: 12px; color: #666;">${invoice.customer_phone}</p>` : ''}
                </div>
                
                ${invoice.requisition_number ? `
                    <div style="margin-bottom: 30px;">
                        <p style="margin: 0; font-size: 12px; color: #666;"><strong>Rekvisitionsnummer:</strong> ${invoice.requisition_number}</p>
                    </div>
                ` : ''}
                
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
                        ${invoice.lines.map(line => `
                            <tr style="border-bottom: 1px solid #ddd;">
                                <td style="padding: 10px; vertical-align: top; color: #000; font-size: 12px;">${line.description}</td>
                                <td style="padding: 10px; text-align: center; color: #000; font-size: 12px;">${line.quantity}</td>
                                <td style="padding: 10px; text-align: center; color: #000; font-size: 12px;">${line.unit}</td>
                                <td style="padding: 10px; text-align: right; color: #000; font-size: 12px;">${formatCurrency(line.unit_price)}</td>
                                <td style="padding: 10px; text-align: right; color: #000; font-size: 12px;">${line.discount_percent}%</td>
                                <td style="padding: 10px; text-align: right; font-weight: 600; color: #000; font-size: 12px;">${formatCurrency(line.line_total)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <!-- Totals -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
                    <div style="min-width: 320px;">
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ddd;">
                            <span style="font-size: 12px; color: #000;">Subtotal:</span>
                            <strong style="font-size: 12px; color: #000;">${formatCurrency(invoice.subtotal)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ddd;">
                            <span style="font-size: 12px; color: #000;">Moms (25%):</span>
                            <strong style="font-size: 12px; color: #000;">${formatCurrency(invoice.vat_amount)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 15px 0; border-top: 2px solid #000; margin-top: 10px;">
                            <span style="font-size: 14px; font-weight: 700; color: #000;">AT BETALE:</span>
                            <strong style="font-size: 16px; font-weight: 700; color: #000;">${formatCurrency(invoice.total)}</strong>
                        </div>
                    </div>
                </div>
                
                <!-- Payment Terms -->
                <div style="margin-bottom: 25px; padding: 15px 0; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd;">
                    <h3 style="margin: 0 0 8px 0; color: #000; font-size: 12px; font-weight: 700;">BETALINGSBETINGELSER:</h3>
                    <p style="margin: 0; color: #000; font-size: 11px; line-height: 1.5;">${invoice.payment_terms}</p>
                </div>
                
                ${invoice.notes ? `
                    <div style="margin-bottom: 25px; padding: 15px 0; border-bottom: 1px solid #ddd;">
                        <h3 style="margin: 0 0 8px 0; color: #000; font-size: 12px; font-weight: 700;">NOTER:</h3>
                        <p style="margin: 0; color: #000; font-size: 11px; line-height: 1.5; white-space: pre-wrap;">${invoice.notes}</p>
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

// Send invoice
async function sendInvoice(invoiceId) {
    if (!confirm('Send denne faktura til kunden via email?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/invoices/${invoiceId}/send`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to send invoice');
        }
        
        alert('✅ Faktura sendt til kunde');
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/invoices/${invoiceId}`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/invoices/${invoiceId}`, {
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

// Export functions
window.loadInvoiced = loadInvoiced;
window.filterInvoicesByStatus = filterInvoicesByStatus;
window.createInvoiceFromOrder = createInvoiceFromOrder;
window.viewInvoice = viewInvoice;
window.sendInvoice = sendInvoice;
window.deleteInvoice = deleteInvoice;
window.deleteInvoiceFromPreview = deleteInvoiceFromPreview;
