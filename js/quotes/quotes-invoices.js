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
