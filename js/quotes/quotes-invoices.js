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
        'draft': 'Ikke sendt',
        'sent': 'Sendt',
        'paid': 'Betalt'
    };
    const cardClass = {
        'draft': 'list-card--draft',
        'sent': 'list-card--sent',
        'paid': 'list-card--paid'
    };
    
    let html = `<div class="list-section-head"><span class="title">Faktura-kartotek</span><span class="badge badge--invoiced">${invoices.length}</span></div>`;
    invoices.forEach(invoice => {
        // v106.4i: type-maerke - Aconto (delbetaling) / Slutfaktura
        // v106.4j: type-maerke - Aconto / Slutfaktura / Kreditnota
        const typeBadge = invoice.invoice_type === 'aconto'
            ? '<span class="badge badge--sent">Aconto</span>'
            : invoice.invoice_type === 'creditnote'
            ? '<span class="badge badge--sent">Kreditnota</span>'
            : '<span class="badge badge--accepted">Slutfaktura</span>';
        html += `
            <div class="list-card ${cardClass[invoice.status] || 'list-card--draft'}">
                <div class="list-card-head">
                    <h4 class="list-card-title">${invoice.invoice_type === 'creditnote' ? 'Kreditnota ' : 'Faktura '}${invoice.invoice_number}</h4>
                    ${typeBadge}
                    <span class="badge ${badgeClass[invoice.status] || 'badge--draft'}">${statusText[invoice.status] || 'Ikke sendt'}</span>
                </div>
                <div class="list-card-grid">
                    <div class="list-card-field"><span class="label">Kunde</span><span class="value">${invoice.customer_name}</span></div>
                    <div class="list-card-field"><span class="label">Ordre</span><span class="value">${invoice.full_order_number}</span></div>
                    <div class="list-card-field"><span class="label">Forfald</span><span class="value">${new Date(invoice.due_date).toLocaleDateString('da-DK')}</span></div>
                    <div class="list-card-total"><span class="label">Total</span>${formatCurrency(invoice.total)}</div>
                </div>
                <div class="list-card-actions">
                    ${btn('secondary', 'eye', 'Se Faktura', { onclick: `viewInvoice(${invoice.id})` })}
                    ${invoice.status === 'draft' ? btn('primary', 'send', 'Godkend og send', { onclick: `sendInvoice(${invoice.id})` }) : ''}
                    ${invoice.status === 'draft' ? btn('secondary', 'check', 'Godkend uden at sende', { onclick: `approveInvoiceWithoutSending(${invoice.id})` }) : ''}
                    ${invoice.invoice_type !== 'creditnote' && invoice.status === 'sent' ? btn('secondary', 'check', 'Markér Betalt', { onclick: `markInvoicePaid(${invoice.id})` }) : ''}
                    ${invoice.invoice_type !== 'creditnote' && invoice.status !== 'draft' ? btn('secondary', 'undo-2', 'Kreditnota', { onclick: `createCreditNote(${invoice.id})` }) : ''}
                    ${invoice.status === 'draft' ? btn('icon', 'trash-2', null, { title: 'Slet Udkast', onclick: `deleteInvoice(${invoice.id})` }) : ''}
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
// v106.4i: invoiceType = 'aconto' (delbetaling) | 'final' (slutfaktura, afslutter sagen)
async function createInvoiceFromOrder(orderId, invoiceType, amount, percent, description) {
    const type = invoiceType || 'final';

    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/invoices/from-order/${orderId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ invoice_type: type, amount: amount || undefined, percent: percent || undefined, description: description || undefined })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create invoice');
        }

        const invoice = await response.json();

        alert(`Faktura ${invoice.invoice_number} oprettet!`);

        // Refresh kartotek + fane-taellinger (slutfaktura flytter sager til Afsluttet)
        loadInvoiced();
        if (typeof loadInProgress === 'function') loadInProgress();
        if (typeof loadCompleted === 'function') loadCompleted();
        if (typeof loadOrderTabCounts === 'function') loadOrderTabCounts();

        // Refresh workspace hvis det er aabent
        if (typeof currentWorkspaceOrder !== 'undefined' && currentWorkspaceOrder && currentWorkspaceOrder.id === orderId) {
            await openOrderWorkspace(orderId);
        }

    } catch (error) {
        console.error('Create invoice error:', error);
        alert('Kunne ikke oprette faktura: ' + error.message);
    }
}

// v106.4j: modal til valg af aconto/slutfaktura med beloeb/procent + aconto-status
let invoiceTypeModalData = null;

async function openInvoiceTypeModal(orderId) {
    document.getElementById('invoiceTypeModal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'invoiceTypeModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:10000;';
    overlay.innerHTML = '<div style="background:var(--surface);border-radius:12px;padding:28px;width:min(460px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.3);"><p style="color:var(--text-muted);margin:0;">Indlæser ordre...</p></div>';
    document.body.appendChild(overlay);

    let subtotal = 0, acontoInvoiced = 0;
    let invsList = [];
    let orderTerms = 'Netto 14 dage';
    try {
        const token = sessionStorage.getItem('token');
        const resp = await fetch('/api/orders/' + orderId + '/workspace', { headers: { 'Authorization': 'Bearer ' + token } });
        if (resp.ok) {
            const data = await resp.json();
            subtotal = Number(data.order && (data.order.live_subtotal ?? data.order.subtotal)) || 0; // v106.4s: live vaerdi
            const invs = data.invoices || [];
            invsList = invs;
            orderTerms = (data.order && data.order.terms) || orderTerms;
            // v106.4k: udkast taeller med med det samme - restbeloebet afspejler alle aconto'er
            acontoInvoiced = invs.reduce((s, i) => {
                if (i.invoice_type === 'aconto') return s + (Number(i.subtotal) || 0);
                if (i.invoice_type === 'creditnote' && invs.some(a => a.id === i.credit_of && a.invoice_type === 'aconto')) return s - (Number(i.subtotal) || 0);
                return s;
            }, 0);
        }
    } catch (e) { /* falder tilbage til 0 */ }

    invoiceTypeModalData = { orderId, subtotal, acontoInvoiced, terms: orderTerms };
    renderInvoiceTypeModalContent('aconto');
    if (window.lucide) { try { lucide.createIcons(); } catch (e) { /* ignore */ } }
}

function renderInvoiceTypeModalContent(selectedType) {
    const overlay = document.getElementById('invoiceTypeModal');
    if (!overlay || !invoiceTypeModalData) return;
    const d = invoiceTypeModalData;
    const rest = Math.max(d.subtotal - d.acontoInvoiced, 0);
    const boxStyle = 'background:var(--surface);border-radius:12px;padding:28px;width:min(480px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:90vh;overflow-y:auto;';
    const optStyle = 'display:flex;gap:10px;align-items:flex-start;padding:14px;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;cursor:pointer;';
    const inpStyle = 'width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-muted);color:var(--text);';
    const fmt = v => new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(v || 0);
    const isFinal = selectedType === 'final';

    overlay.innerHTML = `
        <div style="${boxStyle}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
                <h3 style="margin:0;font-size:17px;">Opret faktura</h3>
                ${btn('ghost', 'x', '', { onclick: 'closeInvoiceTypeModal()' })}
            </div>
            <label style="${optStyle}">
                <input type="radio" name="invoiceTypeRadio" value="aconto" ${isFinal ? '' : 'checked'} onchange="renderInvoiceTypeModalContent('aconto')" style="margin-top:3px;">
                <span><strong>Aconto faktura</strong><br><span style="font-size:13px;color:var(--text-muted);">Delbetaling. Sagen forbliver &aring;ben, og der kan oprettes flere fakturaer.</span></span>
            </label>
            ${isFinal ? `
            <div style="margin:-4px 0 10px 34px;padding:10px 12px;background:var(--surface-muted);border-radius:8px;font-size:13px;color:var(--text);">
                <div style="display:flex;justify-content:space-between;"><span>Ordre (ekskl. moms):</span><strong>${fmt(d.subtotal)}</strong></div>
                ${d.acontoInvoiced > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Heraf aconto:</span><strong>&minus;${fmt(d.acontoInvoiced)}</strong></div>` : ''}
                <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);margin-top:6px;padding-top:6px;"><span>Restbel&oslash;b:</span><strong>${fmt(rest)}</strong></div>
            </div>
            ` : `
            <div style="margin:-4px 0 12px 34px;">
                <div style="margin-bottom:10px;">
                    <label style="font-size:12px;color:var(--text-muted);">Beskrivelse (valgfri)</label>
                    <input type="text" id="invModalDesc" placeholder="fx Indskud p&aring; k&oslash;kken..." style="${inpStyle}">
                </div>
                <div style="display:flex;gap:10px;margin-bottom:10px;">
                    <div style="flex:1;">
                        <label style="font-size:12px;color:var(--text-muted);">Beloeb (kr, ekskl. moms)</label>
                        <input type="number" id="invModalAmount" min="0" step="0.01" placeholder="fx 50000" oninput="invoiceModalCalc('amount')" style="${inpStyle}">
                    </div>
                    <div style="flex:0 0 130px;">
                        <label style="font-size:12px;color:var(--text-muted);">Procent af ordre</label>
                        <input type="number" id="invModalPercent" min="0" max="100" step="0.5" placeholder="fx 50" oninput="invoiceModalCalc('percent')" style="${inpStyle}">
                    </div>
                </div>
                <div id="invModalPreview" style="font-size:13px;color:var(--text);background:var(--surface-muted);border-radius:8px;padding:10px 12px;"></div>
            </div>
            `}
            <label style="${optStyle}margin-bottom:18px;">
                <input type="radio" name="invoiceTypeRadio" value="final" ${isFinal ? 'checked' : ''} onchange="renderInvoiceTypeModalContent('final')" style="margin-top:3px;">
                <span><strong>Slutfaktura</strong><br><span style="font-size:13px;color:var(--text-muted);">Hele ordren minus aconto. Afslutter sagen automatisk. Kun &eacute;n slutfaktura pr. sag.</span></span>
            </label>
            <div style="margin-bottom:14px;">
                <div id="invModalDuePreview" style="font-size:12px;color:var(--text-muted);background:var(--surface-muted);border-radius:8px;padding:8px 12px;"></div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;">
                ${btn('secondary', 'x', 'Annuller', { onclick: 'closeInvoiceTypeModal()' })}
                ${btn('primary', 'receipt', 'Opret Faktura', { onclick: 'submitInvoiceType(' + d.orderId + ')' })}
            </div>
        </div>`;
    if (!isFinal) invoiceModalCalc();
    invoiceModalTermsPreview();
}

// v106.5b: dansk dato til preview (samme som backendens danishToday)
function danishTodayPreview() {
    const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen' }).format(new Date());
    const p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12);
}
// v106.5: forfalds-preview - samme regler som backendens parsePaymentTerms (read-only, laeser sagens terms)
function parseTermsDuePreview(text) {
    const base = danishTodayPreview();
    const fmtD = d => d.toLocaleDateString('da-DK');
    const str = String(text || '').trim();
    if (!str) { const d = new Date(base); d.setDate(d.getDate() + 14); return fmtD(d); }
    let m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return fmtD(new Date(+m[1], +m[2] - 1, +m[3]));
    m = str.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return fmtD(new Date(y, +m[2] - 1, +m[1])); }
    if (/\bl[øo]bende\s+m[åa]ned|\bl\.?\s?m\.\b/i.test(str)) {
        const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0);
        const dmatch = str.match(/(\d+)\s*(?:dage|dag|dags)/i);
        monthEnd.setDate(monthEnd.getDate() + (dmatch ? +dmatch[1] : 0));
        return fmtD(monthEnd);
    }
    m = str.match(/(\d+)\s*(?:dage|dag|dags)/i);
    if (m) { const d = new Date(base); d.setDate(d.getDate() + (+m[1])); return fmtD(d); }
    // v106.6i: "Netto 5" (uden ordet "dage") - samme regel som backendens parsePaymentTerms
    m = str.match(/netto\s*(\d+)/i);
    if (m) { const d = new Date(base); d.setDate(d.getDate() + (+m[1])); return fmtD(d); }
    return fmtD(base);
}
function invoiceModalTermsPreview() {
    const d = invoiceTypeModalData;
    const pv = document.getElementById('invModalDuePreview');
    if (!d || !pv) return;
    const terms = d.terms || 'Netto 14 dage';
    pv.innerHTML = 'Betalingsbetingelser: <strong style="color:var(--text);">' + terms + '</strong> &nbsp;&rarr;&nbsp; Forfaldsdato: <strong style="color:var(--text);">' + parseTermsDuePreview(terms) + '</strong> &nbsp;<span style="font-size:11px;">(s&aelig;ttes p&aring; tilbuddet - kan redigeres p&aring; fakturaen)</span>';
}

function invoiceModalCalc(fromField) {
    const d = invoiceTypeModalData; if (!d) return;
    const amtEl = document.getElementById('invModalAmount');
    const pctEl = document.getElementById('invModalPercent');
    if (!amtEl || !pctEl) return;
    if (fromField === 'amount' && amtEl.value && d.subtotal > 0) {
        const v = parseFloat(amtEl.value);
        if (!isNaN(v) && v > 0) pctEl.value = Math.round((v / d.subtotal) * 1000) / 10;
    } else if (fromField === 'percent' && pctEl.value) {
        const v = parseFloat(pctEl.value);
        if (!isNaN(v) && v > 0) amtEl.value = Math.round(d.subtotal * v) / 100;
    }
    const a = parseFloat(amtEl.value) || 0;
    const vat = Math.round(a * 0.25 * 100) / 100;
    const fmt = v => new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(v || 0);
    const pv = document.getElementById('invModalPreview');
    if (pv) pv.innerHTML = a > 0
        ? 'Subtotal: <strong>' + fmt(a) + '</strong> ekskl. moms &nbsp;&bull;&nbsp; Moms (25%): <strong>' + fmt(vat) + '</strong> &nbsp;&bull;&nbsp; Total: <strong>' + fmt(a + vat) + '</strong>'
        : '<span style="color:var(--text-muted);">Indtast beloeb eller procent for at se fakturaens beloeb</span>';
}

function closeInvoiceTypeModal() {
    document.getElementById('invoiceTypeModal')?.remove();
    invoiceTypeModalData = null;
}

// v106.4p: kreditnota-knap i workspace - vaeg den sendte/betalte faktura der skal krediteres
function openCreditNotePicker() {
    document.getElementById('creditNotePickerModal')?.remove();
    const candidates = (typeof workspaceInvoices !== 'undefined' ? workspaceInvoices : [])
        .filter(i => i.invoice_type !== 'creditnote' && (i.status === 'sent' || i.status === 'paid'));
    const overlay = document.createElement('div');
    overlay.id = 'creditNotePickerModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:10000;';
    const fmt = v => new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(v || 0);
    const rows = candidates.length ? candidates.map(i => `
        <div onclick="closeCreditNotePicker(); createCreditNote(${i.id});" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;cursor:pointer;background:var(--surface-muted);">
            <div>
                <div style="font-weight:600;">${i.invoice_number} &middot; ${i.invoice_type === 'aconto' ? 'Aconto' : 'Slutfaktura'}</div>
                <div style="font-size:12px;color:var(--text-muted);">${new Date(i.invoice_date).toLocaleDateString('da-DK')} &middot; ${i.status === 'paid' ? 'Betalt' : 'Sendt'}</div>
            </div>
            <strong>${fmt(i.total)}</strong>
        </div>`).join('') : '<p style="color:var(--text-muted);margin:0;">Ingen sendte eller betalte fakturaer at kreditere endnu.</p>';
    overlay.innerHTML = `
        <div style="background:var(--surface);border-radius:12px;padding:28px;width:min(480px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.3);max-height:90vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
                <h3 style="margin:0;font-size:17px;">V&aelig;lg faktura at kreditere</h3>
                ${btn('ghost', 'x', '', { onclick: 'closeCreditNotePicker()' })}
            </div>
            ${rows}
        </div>`;
    document.body.appendChild(overlay);
    if (window.lucide) { try { lucide.createIcons(); } catch (e) { /* ignore */ } }
}

function closeCreditNotePicker() {
    document.getElementById('creditNotePickerModal')?.remove();
}

function submitInvoiceType(orderId) {
    const radio = document.querySelector('input[name="invoiceTypeRadio"]:checked');
    const type = radio ? radio.value : 'final';
    if (type === 'aconto') {
        const amt = parseFloat(document.getElementById('invModalAmount')?.value);
        if (!amt || amt <= 0) {
            alert('Angiv et beloeb eller en procent for aconto-fakturaen');
            return;
        }
        const desc = (document.getElementById('invModalDesc')?.value || '').trim();
        closeInvoiceTypeModal();
        createInvoiceFromOrder(orderId, 'aconto', amt, undefined, desc);
        return;
    }
    closeInvoiceTypeModal();
    createInvoiceFromOrder(orderId, 'final');
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

// v106.4o: genbrugeligt faktura-ark (preview + workspace inline-preview)
function buildInvoiceSheetHTML(invoice) {
    return `
            <div class="quote-sheet">
                <!-- Minimal Header -->
                <div style="display: flex; justify-content: space-between; align-items: start; padding-bottom: 30px; border-bottom: 1px solid var(--text); margin-bottom: 40px;">
                    <div style="background: transparent !important; margin-top: 0; padding: 0;">
                        <img src="seestlogo.png" alt="SG Seest Gulvteknik ApS" style="height: 80px; width: auto; display: block; background: transparent !important; background-color: transparent !important; margin: 0; padding: 0;">
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0 0 15px 0; font-size: 24px; font-weight: 700; color: var(--text);">${invoice.invoice_type === 'creditnote' ? 'KREDITNOTA' : (invoice.invoice_type === 'aconto' ? 'ACONTO FAKTURA' : 'FAKTURA')}</h2>
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
    `;
}

// Render invoice preview
function renderInvoicePreview(invoice) {
    window.currentPreviewInvoice = invoice;
    // Hide all other views
    document.getElementById('quotesListView').style.display = 'none';
    document.getElementById('quotesFormView').style.display = 'none';
    document.getElementById('quotesPreviewView').style.display = 'none';
    document.getElementById('quotesCustomersView').style.display = 'none';
    // v106.4p: skjul alle fane-indhold foerst, saa fx Afsluttet-listen ikke hang over faktura-arket
    document.querySelectorAll('[id^="orderTab"]').forEach(el => { el.style.display = 'none'; });
    
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
                        <i data-lucide="send"></i> Godkend og send
                    </button>
                    <button onclick="approveInvoiceWithoutSending(${invoice.id})" class="btn btn-secondary">
                        <i data-lucide="check"></i> Godkend uden at sende
                    </button>
                ` : ''}
                ${invoice.invoice_type === 'creditnote' && invoice.status === 'draft' ? `
                    <button onclick="toggleInvoiceLineEditor(${invoice.id})" class="btn btn-secondary">
                        <i data-lucide="pencil"></i> Rediger linjer
                    </button>
                ` : ''}
                ${invoice.invoice_type !== 'creditnote' && invoice.status !== 'draft' ? `
                    <button onclick="createCreditNote(${invoice.id})" class="btn btn-secondary">
                        <i data-lucide="undo-2"></i> Opret Kreditnota
                    </button>
                ` : ''}
                ${invoice.invoice_type !== 'creditnote' && invoice.status === 'sent' ? `
                    <button onclick="markInvoicePaid(${invoice.id})" class="btn btn-primary">
                        <i data-lucide="check"></i> Markér Betalt
                    </button>
                ` : ''}
                <button onclick="window.print()" class="btn btn-secondary">
                    <i data-lucide="printer"></i> Print / PDF
                </button>
                ${invoice.status === 'draft' ? `
                    <button onclick="deleteInvoiceFromPreview(${invoice.id})" class="btn btn-danger toolbar-end">
                        <i data-lucide="trash-2"></i> Slet
                    </button>
                ` : ''}
            </div>
                </button>
            </div>
            
            ${buildInvoiceSheetHTML(invoice)}
        </div>
    `;
    if (window.lucide) { try { lucide.createIcons(); } catch (e) { /* ignore */ } }
}

// v106.4n: markér sendt faktura som betalt (sgConfirm erstatter native confirm)
function markInvoicePaid(invoiceId) {
    sgConfirm('Markér som betalt', 'Er betalingen modtaget? Fakturaen markeres som Betalt.', async () => {
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`/api/invoices/${invoiceId}/mark-paid`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Kunne ikke markere som betalt');
            }
            alert('Faktura markeret som betalt');
            loadInvoiced();
            if (typeof loadOrderTabCounts === 'function') loadOrderTabCounts();
            // v106.4o: opdater inline-preview i workspace hvis den er aaben for denne faktura
            if (currentWorkspaceOrder && document.getElementById('wsInvoicePreview')) {
                if (typeof refreshWorkspaceInvoicePreview === 'function') refreshWorkspaceInvoicePreview(invoiceId);
            } else if (window.currentPreviewInvoice && window.currentPreviewInvoice.id === invoiceId) {
                viewInvoice(invoiceId);
            }
        } catch (error) {
            console.error('Mark paid error:', error);
            alert('Kunne ikke markere som betalt: ' + error.message);
        }
    });
}

// Send invoice (v106.4i: sgConfirm erstatter native confirm, som browseren blokerer)
function sendInvoice(invoiceId) {
    sgConfirm('Send faktura', 'Send denne faktura til kunden via email?', async () => {
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
            // v106.4o: opdater workspace-preview hvis sendt derfra
            if (currentWorkspaceOrder && typeof refreshWorkspaceInvoicePreview === 'function') {
                refreshWorkspaceInvoicePreview(invoiceId);
            }
            
        } catch (error) {
            console.error('Send invoice error:', error);
            alert('Kunne ikke sende faktura: ' + error.message);
        }
    });
}

// v106.6i: godkend faktura UDEN at sende den til kunden (print/PDF eller egen mail).
// Saettes til 'sent' -> has_approved_invoice -> stepper "Faktureret" + Fakturering-fanen.
function approveInvoiceWithoutSending(invoiceId) {
    sgConfirm('Godkend uden at sende', 'Fakturaen godkendes og rykker ordren videre til "Faktureret" - men der sendes IKKE en email til kunden. Fortsæt?', async () => {
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`/api/invoices/${invoiceId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: 'sent' })
            });
            if (!response.ok) {
                const e = await response.json().catch(() => ({}));
                throw new Error(e.error || 'Kunne ikke godkende faktura');
            }
            alert('Faktura godkendt (ikke sendt til kunde)');
            loadInvoiced();
            if (typeof loadOrderTabCounts === 'function') loadOrderTabCounts();
            if (currentWorkspaceOrder && typeof refreshWorkspaceInvoicePreview === 'function') {
                refreshWorkspaceInvoicePreview(invoiceId);
            }
        } catch (error) {
            console.error('Approve invoice error:', error);
            alert('Kunne ikke godkende faktura: ' + error.message);
        }
    });
}

// Delete invoice
function deleteInvoice(invoiceId) {
    sgConfirm('Slet udkast', 'Er du sikker på at du vil slette dette udkast?', async () => {
    
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
        // v106.4o: opdater workspace-listen og luk inline-preview hvis slettet derfra
        if (currentWorkspaceOrder) {
            if (typeof refreshWorkspaceInvoicesFromServer === 'function') refreshWorkspaceInvoicesFromServer();
            if (typeof closeWorkspaceInvoicePreview === 'function') closeWorkspaceInvoicePreview();
        }
        
    } catch (error) {
        console.error('Delete invoice error:', error);
        alert('Kunne ikke slette faktura: ' + error.message);
    }
    });
}

// Delete invoice from preview (redirects back to list)
function deleteInvoiceFromPreview(invoiceId) {
    sgConfirm('Slet udkast', 'Er du sikker på at du vil slette dette udkast?', async () => {
    
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
    });
}

// Export functions
// v106.4j: kreditnota + redigering af linjer i udkast
async function createCreditNote(invoiceId) {
    sgConfirm('Opret kreditnota', 'Opret en kreditnota for denne faktura?\n\nAlle linjer kopieres med minus foran, og du kan redigere dem inden sending.', async () => {
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch('/api/invoices/' + invoiceId + '/creditnote', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Kunne ikke oprette kreditnota');
            }
            const credit = await response.json();
            alert('Kreditnota ' + credit.invoice_number + ' oprettet som udkast');
            loadInvoiced();
            // v106.4o: bliv i workspace hvis kreditnotaen oprettes derfra
            if (currentWorkspaceOrder) {
                if (typeof refreshWorkspaceInvoicesFromServer === 'function') refreshWorkspaceInvoicesFromServer();
                if (typeof showWorkspaceInvoicePreview === 'function') showWorkspaceInvoicePreview(credit.id);
            } else {
                renderInvoicePreview(credit);
            }
        } catch (error) {
            console.error('Creditnote error:', error);
            alert('Kunne ikke oprette kreditnota: ' + error.message);
        }
    });
}

let invoiceLineEditor = null;

function toggleInvoiceLineEditor(invoiceId) {
    if (!window.currentPreviewInvoice || window.currentPreviewInvoice.id !== invoiceId) return;
    invoiceLineEditor = JSON.parse(JSON.stringify(window.currentPreviewInvoice));
    if (!Array.isArray(invoiceLineEditor.lines) || invoiceLineEditor.lines.length === 0) {
        invoiceLineEditor.lines = [{ description: '', quantity: -1, unit: 'stk', unit_price: 0, discount_percent: 0, line_total: 0 }];
    }
    renderInvoiceLineEditor();
}


function invEscAttr(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function renderInvoiceLineEditor() {
    const inv = invoiceLineEditor;
    if (!inv) return;
    const container = document.getElementById('invoicingContainer');
    const inp = 'padding:6px 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);width:100%;box-sizing:border-box;font-size:12px;';
    const rows = inv.lines.map((line, i) => `
        <tr>
            <td style="padding:6px;"><input class="ed-desc" value="${invEscAttr(line.description)}" style="${inp}"></td>
            <td style="padding:6px;width:80px;"><input class="ed-qty" type="number" step="0.01" value="${line.quantity}" style="${inp}" oninput="invEditorLineTotal(${i})"></td>
            <td style="padding:6px;width:70px;"><input class="ed-unit" value="${invEscAttr(line.unit || 'stk')}" style="${inp}"></td>
            <td style="padding:6px;width:110px;"><input class="ed-price" type="number" step="0.01" value="${line.unit_price}" style="${inp}" oninput="invEditorLineTotal(${i})"></td>
            <td style="padding:6px;width:70px;"><input class="ed-disc" type="number" step="1" value="${line.discount_percent || 0}" style="${inp}" oninput="invEditorLineTotal(${i})"></td>
            <td style="padding:6px;width:110px;text-align:right;font-weight:600;font-size:12px;color:var(--text);" class="ed-total">${formatCurrency(line.line_total)}</td>
            <td style="padding:6px;width:44px;text-align:center;"><button class="btn btn-icon btn-danger" title="Fjern linje" onclick="removeEditorLine(${i})"><i data-lucide="x"></i></button></td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div class="quote-sheet-wrap">
            <div class="preview-actions">
                <button onclick="viewInvoice(${inv.id})" class="btn btn-secondary"><i data-lucide="arrow-left"></i> Tilbage</button>
                <div style="flex:1;text-align:center;"><strong>Rediger linjer - kreditnota ${inv.invoice_number}</strong></div>
                <button onclick="addEditorLine()" class="btn btn-secondary"><i data-lucide="plus"></i> Tilfoej linje</button>
                <button onclick="saveInvoiceLineEdits(${inv.id})" class="btn btn-primary"><i data-lucide="save"></i> Gem</button>
            </div>
            <div class="quote-sheet">
                <div class="doc-table-scroll">
                <table style="width:100%;border-collapse:collapse;" id="invEditLines">
                    <thead>
                        <tr style="border-bottom:2px solid var(--text);">
                            <th style="padding:10px 6px;text-align:left;font-size:12px;">Beskrivelse</th>
                            <th style="padding:10px 6px;text-align:center;font-size:12px;">Antal</th>
                            <th style="padding:10px 6px;text-align:center;font-size:12px;">Enhed</th>
                            <th style="padding:10px 6px;text-align:right;font-size:12px;">E.pris</th>
                            <th style="padding:10px 6px;text-align:right;font-size:12px;">Rabat %</th>
                            <th style="padding:10px 6px;text-align:right;font-size:12px;">Total</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                </div>
                <p style="font-size:12px;color:var(--text-muted);margin-top:20px;">Totalerne (subtotal, moms og at-betale) genberegnes automatisk ved gem.</p>
            </div>
        </div>`;
    if (window.lucide) { try { lucide.createIcons(); } catch (e) { /* ignore */ } }
}

function invEditorLineTotal(i) {
    const trs = document.querySelectorAll('#invEditLines tbody tr');
    const tr = trs[i]; if (!tr) return;
    const qty = parseFloat(tr.querySelector('.ed-qty').value) || 0;
    const price = parseFloat(tr.querySelector('.ed-price').value) || 0;
    const disc = parseFloat(tr.querySelector('.ed-disc').value) || 0;
    tr.querySelector('.ed-total').textContent = formatCurrency((qty * price) * (1 - disc / 100));
}

function addEditorLine() {
    if (!invoiceLineEditor) return;
    invoiceLineEditor.lines.push({ description: '', quantity: -1, unit: 'stk', unit_price: 0, discount_percent: 0, line_total: 0 });
    renderInvoiceLineEditor();
}

function removeEditorLine(i) {
    if (!invoiceLineEditor) return;
    invoiceLineEditor.lines.splice(i, 1);
    renderInvoiceLineEditor();
}


// v106.4j: exports
window.loadInvoiced = loadInvoiced;
window.viewInvoice = viewInvoice;
window.renderInvoicePreview = renderInvoicePreview;
window.sendInvoice = sendInvoice;
window.approveInvoiceWithoutSending = approveInvoiceWithoutSending;
window.deleteInvoice = deleteInvoice;
window.deleteInvoiceFromPreview = deleteInvoiceFromPreview;
window.createInvoiceFromOrder = createInvoiceFromOrder;
window.openInvoiceTypeModal = openInvoiceTypeModal;
window.renderInvoiceTypeModalContent = renderInvoiceTypeModalContent;
window.invoiceModalCalc = invoiceModalCalc;
window.closeInvoiceTypeModal = closeInvoiceTypeModal;
window.submitInvoiceType = submitInvoiceType;
window.createCreditNote = createCreditNote;
window.openCreditNotePicker = openCreditNotePicker;
window.closeCreditNotePicker = closeCreditNotePicker;
window.toggleInvoiceLineEditor = toggleInvoiceLineEditor;
window.renderInvoiceLineEditor = renderInvoiceLineEditor;
window.invEscAttr = invEscAttr;
window.invEditorLineTotal = invEditorLineTotal;
window.addEditorLine = addEditorLine;
window.removeEditorLine = removeEditorLine;
window.saveInvoiceLineEdits = saveInvoiceLineEdits;
window.buildInvoiceSheetHTML = buildInvoiceSheetHTML;
window.markInvoicePaid = markInvoicePaid;
window.filterInvoicesByStatus = filterInvoicesByStatus;
window.editInvoiceNotes = editInvoiceNotes;
window.saveInvoiceNotes = saveInvoiceNotes;
window.setInvoicedFilter = setInvoicedFilter;
async function saveInvoiceLineEdits(invoiceId) {
    if (!invoiceLineEditor) return;
    const trs = [...document.querySelectorAll('#invEditLines tbody tr')];
    const lines = trs.map(tr => ({
        description: tr.querySelector('.ed-desc').value || 'Linje',
        quantity: parseFloat(tr.querySelector('.ed-qty').value) || 0,
        unit: tr.querySelector('.ed-unit').value || 'stk',
        unit_price: parseFloat(tr.querySelector('.ed-price').value) || 0,
        discount_percent: parseFloat(tr.querySelector('.ed-disc').value) || 0
    }));
    if (lines.length === 0) {
        alert('Kreditnotaen skal have mindst en linje');
        return;
    }
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/invoices/' + invoiceId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ lines: lines, notes: invoiceLineEditor.notes })
        });
        if (!response.ok) {
            const e = await response.json();
            throw new Error(e.error || 'Kunne ikke gemme kreditnota');
        }
        alert('Kreditnota gemt!');
        invoiceLineEditor = null;
        loadInvoiced();
        viewInvoice(invoiceId);
    } catch (error) {
        console.error('Save creditnote error:', error);
        alert('Kunne ikke gemme kreditnota: ' + error.message);
    }
}