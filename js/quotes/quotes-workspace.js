// js/quotes/quotes-workspace.js - Order workspace management

// Montor-rolle: Ledelsen = is_admin, alle andre = Montor (laesetilstand uden oekonomi)
function isQuotesMontor() {
    return window.currentUser && !window.currentUser.is_admin;
}

let currentWorkspaceOrder = null;
let workspaceInvoices = []; // v106.4j: alle fakturaer + kreditnotaer for ordren
let workspaceExpenses = [];
let workspaceDocuments = [];
let workspaceTimeline = [];
let workspaceNotes = [];
let workspaceExtraWorkOrders = [];
let workspaceFinancials = null;
let workspaceMaterials = [];
let currentWorkspaceTab = 'overview';
let extraWorkLines = [];
let parentOrderId = null; // Track parent order for back navigation

// Add global CSS for work description lists (load once on page load)
if (!document.getElementById('workDescGlobalStyles')) {
    const style = document.createElement('style');
    style.id = 'workDescGlobalStyles';
    style.textContent = `
        #workDescEditor .ql-editor ul,
        #workDescEditor .ql-editor ol {
            padding-left: 50px !important;
            margin-left: 10px !important;
        }
        #workDescContent ul,
        #workDescContent ol {
            padding-left: 50px !important;
            margin: 10px 0 10px 10px !important;
        }
    `;
    document.head.appendChild(style);
}

// Open order workspace
async function openOrderWorkspace(orderId, fromParentId = null) {
    console.log('=== openOrderWorkspace called ===');
    console.log('orderId:', orderId);
    console.log('fromParentId:', fromParentId);
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/orders/${orderId}/workspace`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load workspace');
        
    const data = await response.json();
    
    console.log('Received workspace data:', data.order);
    console.log('Order ID from backend:', data.order.id);
    console.log('Order number from backend:', data.order.order_number);
    console.log('Is extra work?', data.order.is_extra_work);
    console.log('DOCUMENTS COUNT:', data.documents.length);
    console.log('DOCUMENTS DATA:', data.documents);
        
        // If this is extra work being opened from parent, save parent ID
        if (data.order.is_extra_work && data.order.parent_order_id && fromParentId === null) {
            // When opening extra work, set parent to the parent_order_id from data
            parentOrderId = data.order.parent_order_id;
        } else if (fromParentId) {
            // Explicitly passed parent (when clicking from parent workspace)
            parentOrderId = fromParentId;
        } else {
            // Opening main order - clear parent
            parentOrderId = null;
        }
        
        currentWorkspaceOrder = data.order;
        currentWorkspaceInvoice = data.invoice;
        workspaceInvoices = data.invoices || (data.invoice ? [data.invoice] : []);
        workspaceExpenses = data.expenses.items;
        workspaceDocuments = data.documents;
        workspaceTimeline = data.timeline;
        workspaceNotes = data.notes;
        workspaceMaterials = data.materials || [];
        workspaceExtraWorkOrders = data.extra_work_orders || [];
        workspaceFinancials = data.financials;
        
        // Update browser URL with current order
        const url = `#/orders/${orderId}/workspace`;
        history.pushState({ orderId, parentOrderId }, '', url);
        
        renderWorkspace(data);
    } catch (error) {
        console.error('Error loading workspace:', error);
        alert('Kunne ikke indlæse workspace: ' + error.message);
    }
}

// Render workspace
function renderWorkspace(data) {
    // Hide other views (safely check if elements exist)
    const quotesListView = document.getElementById('quotesListView');
    const quotesFormView = document.getElementById('quotesFormView');
    const quotesPreviewView = document.getElementById('quotesPreviewView');
    const quotesCustomersView = document.getElementById('quotesCustomersView');
    
    if (quotesListView) quotesListView.style.display = 'none';
    if (quotesFormView) quotesFormView.style.display = 'none';
    if (quotesPreviewView) quotesPreviewView.style.display = 'none';
    if (quotesCustomersView) quotesCustomersView.style.display = 'none';
    
    // v83 FIX (tab-mixing): Workspace genbruger ordersContainer i orderTabOrders,
    // men topfanerne skal afspejle ordrens stage - ellers bliver "Godkendte Ordre"
    // understreget selv naar ordren er igangvaerende/afsluttet (og "Afsluttede"-
    // listen laakker ind under workspace'et).
    // v106.6h: afsluttede ordrer fremhaever nu "Afsluttede"-fanen (ikke Godkendte Ordre)
    const isOrderInProgress = data.order.order_stage === 'in_progress';
    const isOrderCompleted = data.order.order_stage === 'completed';
    const activeTopTab = isOrderInProgress ? 'in_progress' : (isOrderCompleted ? 'completed' : 'orders');

    // Show orders tab (reuse for workspace)
    const ordersTab = document.getElementById('orderTabOrders');
    if (ordersTab) {
        ordersTab.style.display = 'block';
    }

    // Update tab buttons — styres KUN af .active-klassen (gul understregning)
    const tabs = ['quotes', 'orders', 'in_progress', 'invoiced', 'rejected', 'customers'];
    tabs.forEach(t => {
        const name = t === 'in_progress' ? 'InProgress' : t.charAt(0).toUpperCase() + t.slice(1);
        const btn = document.getElementById(`tab${name}`);
        if (btn) {
            btn.classList.toggle('active', t === activeTopTab);
        }
    });

    // Skjul alle andre fane-indhold end orderTabOrders, sa ingen liste staar under workspace
    // v106.6h: orderTabCompleted med nu (Afsluttede-sager-listen laakte ellers ind under workspace)
    ['orderTabQuotes', 'orderTabInProgress', 'orderTabCompleted', 'orderTabInvoiced', 'orderTabRejected', 'orderTabCustomers'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    const container = document.getElementById('ordersContainer');
    // BUG FIX: Guard clause - only render if container exists
    if (!container) {
        console.warn('ordersContainer not found, cannot render workspace');
        return;
    }
    
    // v106.4r: brug backend-verificeret full_order_number (sub-ordrer fx "0001-02")
    const fullOrderNumber = data.order.full_order_number || data.order.order_number;
    
    container.innerHTML = `
        <div style="max-width: 1400px; margin: 0 auto;">
            <!-- Ordre-stepper: Godkendt → Igangværende → Faktureret -->
            ${renderStageStepper(data.order)}
            <!-- Back button -->
            <div style="margin-bottom: 12px;">
                <button onclick="closeWorkspace()" class="btn-secondary" style="min-height: 40px;">
                    ← Tilbage til Ordrer
                </button>
            </div>
            
            <!-- Workspace Header (v102: kompakt med donut for Timer/Materialer/Profit) -->
            <div class="card" style="padding: 18px 24px; margin-bottom: 24px; display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; align-items: center;">
                <div style="min-width: 220px;">
                    <h1 style="margin: 0 0 4px 0; font-size: 22px;">Ordre ${fullOrderNumber}
                        ${!isQuotesMontor() ? `<span style="display: inline-block; vertical-align: middle; margin-left: 10px; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; ${data.order.is_extra_work ? 'background: var(--color-orange, #e67e22); color: #fff; border: 1px solid var(--color-orange, #e67e22);' : `background: var(--accent-soft, #fff7e6); color: var(--color-orange, #e67e22); border: 1px solid var(--accent, #f0a030);`}">${data.order.is_extra_work ? 'Ekstraarbejde' : (data.order.order_type === 'consumption' ? 'Forbrugssag' : 'Kalkulation')}</span>` : ''}
                    </h1>
                    <p style="margin: 0; color: var(--color-text-muted); font-size: 14px;">${data.order.title} • ${data.order.company_name}</p>
                </div>
                ${isQuotesMontor() ? '' : renderHeaderEconomy(data)}
            </div>
            
            <!-- Tabs (underline-stil) -->
            <div class="tab-underline" style="margin-bottom: 28px;">
                <button onclick="switchWorkspaceTab('overview')" id="workspaceTabOverview" class="tab-underline-btn active">Oversigt</button>
                <button onclick="switchWorkspaceTab('materials')" id="workspaceTabMaterials" class="tab-underline-btn">Timer & Materialer (${workspaceMaterials.length})</button>
                <!-- v106.6g: Dokumenter vises nu for ALLE roller - montorer skal se tegninger/billeder og kan selv uploade -->
                <button onclick="switchWorkspaceTab('documents')" id="workspaceTabDocuments" class="tab-underline-btn">Dokumenter (${workspaceDocuments.length})</button>
                ${isQuotesMontor() ? '' : `
                <button onclick="switchWorkspaceTab('timeline')" id="workspaceTabTimeline" class="tab-underline-btn">Timeline (${workspaceTimeline.length})</button>
                <button onclick="switchWorkspaceTab('notes')" id="workspaceTabNotes" class="tab-underline-btn">Noter (${workspaceNotes.length})</button>
                `}
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
    
    // Update button styles (underline-stil)
    ['overview', 'expenses', 'materials', 'documents', 'timeline', 'notes'].forEach(t => {
        const btn = document.getElementById(`workspaceTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (btn) {
            btn.classList.toggle('active', t === tab);
            btn.style.background = 'transparent';
            btn.style.color = '';
        }
    });
    
    // Render content
    const content = document.getElementById('workspaceContent');
    
    if (tab === 'overview') {
        renderWorkspaceOverview(content);
        } else if (tab === 'materials') {
        renderWorkspaceMaterials(content);
    } else if (tab === 'documents') {
        renderWorkspaceDocuments(content);
    } else if (tab === 'timeline') {
        renderWorkspaceTimeline(content);
    } else if (tab === 'notes') {
        renderWorkspaceNotes(content);
    }
}

// v102: Kompakt oekonomi-boks i workspace-headeren: SVG-donut (Timer/Materialer/Profit) + timeforbrug i alt
function renderHeaderEconomy(data) {
    const lines = workspaceMaterials || [];
    const fin = data.financials || {};
    let timeCost = 0, materialCost = 0, totalHours = 0;
    lines.forEach(l => {
        const cost = parseFloat(l.total_cost) || 0;
        if (isTimeLine(l)) {
            timeCost += cost;
            totalHours += parseFloat(l.quantity) || 0;
        } else {
            materialCost += cost;
        }
    });
    const revenue = parseFloat(fin.revenue) || 0;
    const profit = parseFloat(fin.profit) || 0;
    const coverage = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';

    // Donut-segmenter: timer + materialer + overskud (profit) som rest
    const parts = [
        { label: 'Timer', value: Math.max(timeCost, 0), color: '#7C2D12' },
        { label: 'Materialer', value: Math.max(materialCost, 0), color: '#9F86C0' },
        { label: 'Profit', value: Math.max(profit, 0), color: '#8BB8E8' }
    ];
    const total = parts.reduce((sum, p) => sum + p.value, 0);
    const R = 34, C = 2 * Math.PI * R;
    let offset = 0, segs = '';
    if (total > 0) {
        parts.forEach(p => {
            const frac = p.value / total;
            segs += `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${p.color}" stroke-width="30" stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-offset * C).toFixed(2)}" transform="rotate(-90 50 50)"></circle>`;
            offset += frac;
        });
    } else {
        segs = `<circle cx="50" cy="50" r="${R}" fill="none" stroke="#E5E7EB" stroke-width="30"></circle>`;
    }
    const legend = parts.map(p => `<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-muted);"><span style="width: 9px; height: 9px; border-radius: 50%; background: ${p.color}; display: inline-block;"></span>${p.label}</span>`).join('');
    return `
                <div style="display: flex; align-items: center; gap: 24px; flex-wrap: wrap;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <svg width="104" height="104" viewBox="0 0 100 100" role="img" aria-label="Fordeling af timer, materialer og profit">${segs}</svg>
                        <div style="display: flex; gap: 14px;">${legend}</div>
                    </div>
                    <div style="display: grid; gap: 8px;">
                        <div>
                            <div style="font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums;">${totalHours.toFixed(2)} timer</div>
                            <div style="font-size: 12px; color: var(--text-muted);">Timeforbrug i alt</div>
                        </div>
                        <div>
                            <div style="font-size: 16px; font-weight: 600; color: ${profit >= 0 ? 'var(--color-green)' : 'var(--color-red)'};">${coverage}%</div>
                            <div style="font-size: 12px; color: var(--text-muted);">Dækningsbidrag</div>
                        </div>
                    </div>
                </div>`;
}

// Render overview tab with pie chart
function renderWorkspaceOverview(container) {
    // Montoer (v83): Pænt overblik med ordreinfo + kundens kontaktinfo.
    // Ingen oeconomi, ingen timeline - kun det montoren skal bruge i felten.
    if (isQuotesMontor()) {
        const o = currentWorkspaceOrder;
        const address = o.order_address || o.address;
        const postalCity = `${o.order_postal_code || o.postal_code || ''} ${o.order_city || o.city || ''}`.trim();
        container.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <!-- Kontaktinfo -->
                <div style="background: var(--surface); padding: 16px; border-radius: 10px; border: 1px solid var(--border); margin: 0;">
                    <h3 style="margin: 0 0 15px 0;">Kundens Kontaktinfo</h3>
                    <div style="display: grid; gap: 8px;">
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Kontaktperson</div>
                            <div style="font-weight: 600; font-size: 14px;">${o.contact_person_name || o.contact_person || 'Ikke angivet'}</div>
                        </div>
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Telefon</div>
                            <div style="font-weight: 600; font-size: 14px;">${o.contact_person_phone || o.customer_phone || 'Ikke angivet'}</div>
                        </div>
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Email</div>
                            <div style="font-weight: 600; font-size: 14px;">${o.contact_person_email || o.customer_email || 'Ikke angivet'}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Ordre Adresse</div>
                            <div style="font-weight: 600; font-size: 14px;">
                                ${address || 'Ikke angivet'}<br>
                                ${postalCity}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Ordreinfo -->
                <div style="background: var(--surface); padding: 16px; border-radius: 10px; border: 1px solid var(--border); margin: 0;">
                    <h3 style="margin: 0 0 15px 0;">Ordre Information</h3>
                    <div style="display: grid; gap: 8px;">
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Ordre Nummer</div>
                            <div style="font-weight: 600; font-size: 14px;">${o.order_number}</div>
                        </div>
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Firma</div>
                            <div style="font-weight: 600; font-size: 14px;">${o.company_name}</div>
                        </div>
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Status</div>
                            ${getStageBadge(o)}
                        </div>
                        ${o.accepted_at ? `
                        <div>
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Accepteret</div>
                            <div style="font-weight: 600; font-size: 14px;">${new Date(o.accepted_at).toLocaleDateString('da-DK')}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            <div style="background: var(--surface); padding: 16px; border-radius: 10px; border: 1px solid var(--border); margin-top: 30px;">
                <h3 style="margin: 0 0 10px 0;">Arbejdsbeskrivelse</h3>
                <div style="min-height: 60px; padding: 15px; background: var(--surface-muted); border-radius: 5px; border: 1px solid var(--border); font-size: 14px;">
                    ${currentWorkspaceOrder.work_description || '<em style="color: var(--text-muted);">Ingen beskrivelse endnu...</em>'}
                </div>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 20px;">Økonomi og dokumenter er ikke synlige her. Registrér timer via "Min Tid" og materialer/kørsel under "Timer & Materialer".</p>
        `;
        return;
    }
    // Use aggregated financials from backend (includes main order + extra work)
    const revenue = workspaceFinancials ? workspaceFinancials.revenue : (currentWorkspaceOrder.total || 0);
    const totalExpenses = workspaceFinancials ? workspaceFinancials.expenses : workspaceExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const profit = workspaceFinancials ? workspaceFinancials.profit : (revenue - totalExpenses);
    const profitMargin = workspaceFinancials ? workspaceFinancials.profit_margin : (revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0);
    
    // Check if we have extra work (split stats available)
    const hasExtraWork = workspaceExtraWorkOrders && workspaceExtraWorkOrders.length > 0;
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <!-- Left column: Stats and Chart -->
            <div style="display: flex; flex-direction: column; gap: 20px;">
                ${hasExtraWork ? `
                    <!-- Split Statistics Cards -->
                    <div style="background: var(--surface); padding: 18px; border-radius: 10px; border: 1px solid var(--border); margin: 0;">
                        <h3 style="margin: 0 0 12px 0; color: var(--text);">Opdelt Statistik</h3>
                        
                        <!-- Revenue -->
                        <div style="margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <div style="font-weight: 600; font-size: 14px;">Omsætning</div>
                                <div style="font-size: 16px; font-weight: 600; color: var(--color-accent-hover);">${formatCurrency(workspaceFinancials.revenue)}</div>
                            </div>
                            <div style="padding-left: 20px; font-size: 13px; color: var(--text-muted);">
                                <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                                    <div>└─ Hovedordre:</div>
                                    <div style="font-weight: 600;">${formatCurrency(workspaceFinancials.revenue_main)}</div>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                                    <div>└─ Ekstraarbejde (${workspaceExtraWorkOrders.length}):</div>
                                    <div style="font-weight: 600;">${formatCurrency(workspaceFinancials.revenue_extra)}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div style="border-top: 1px solid var(--border); margin: 12px 0;"></div>
                        
                        <!-- Expenses -->
                        <div style="margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <div style="font-weight: 600; font-size: 14px;">Udgifter</div>
                                <div style="font-size: 16px; font-weight: 600; color: var(--color-red);">${formatCurrency(workspaceFinancials.expenses)}</div>
                            </div>
                            <div style="padding-left: 20px; font-size: 13px; color: var(--text-muted);">
                                <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                                    <div>└─ Hovedordre:</div>
                                    <div style="font-weight: 600;">${formatCurrency(workspaceFinancials.expenses_main || 0)}</div>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                                    <div>└─ Ekstraarbejde (${workspaceExtraWorkOrders.length}):</div>
                                    <div style="font-weight: 600;">${formatCurrency(workspaceFinancials.expenses_extra || 0)}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div style="border-top: 1px solid var(--border); margin: 12px 0;"></div>
                        
                        <!-- Profit -->
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <div style="font-weight: 600; font-size: 14px;">Profit</div>
                                <div style="font-size: 20px; font-weight: 600; color: ${profit >= 0 ? 'var(--color-green)' : 'var(--color-red)'};">${formatCurrency(workspaceFinancials.profit)} (${profitMargin}%)</div>
                            </div>
                            <div style="padding-left: 20px; font-size: 13px; color: var(--text-muted);">
                                <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                                    <div>└─ Hovedordre:</div>
                                    <div style="font-weight: 600;">${formatCurrency(workspaceFinancials.profit_main || 0)}</div>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                                    <div>└─ Ekstraarbejde (${workspaceExtraWorkOrders.length}):</div>
                                    <div style="font-weight: 600;">${formatCurrency(workspaceFinancials.profit_extra || 0)}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : `
                    <!-- Simple Stats cards (no extra work) -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0;">
                        <div style="background: var(--surface); padding: 16px; border-radius: 10px; border: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 14px; margin-bottom: 5px;">Omsætning</div>
                            <div style="font-size: 20px; font-weight: 600; color: var(--color-accent-hover);">${formatCurrency(revenue)}</div>
                        </div>
                        <div style="background: var(--surface); padding: 16px; border-radius: 10px; border: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 14px; margin-bottom: 5px;">Udgifter</div>
                            <div style="font-size: 20px; font-weight: 600; color: var(--color-red);">${formatCurrency(totalExpenses)}</div>
                        </div>
                        <div style="background: var(--surface); padding: 16px; border-radius: 10px; border: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 14px; margin-bottom: 5px;">Profit</div>
                            <div style="font-size: 20px; font-weight: 600; color: ${profit >= 0 ? 'var(--color-green)' : 'var(--color-red)'};">${formatCurrency(profit)}</div>
                        </div>
                        <div style="background: var(--surface); padding: 16px; border-radius: 10px; border: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 14px; margin-bottom: 5px;">Dækningsbidrag</div>
                            <div style="font-size: 20px; font-weight: 600; color: ${profit >= 0 ? 'var(--color-green)' : 'var(--color-red)'};">${revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0}%</div>
                        </div>
                    </div>
                `}
                
                <!-- Ordre Detaljer (NEW - replaces Profit Chart) -->
                <div style="background: var(--surface); padding: 16px; border-radius: 10px; border: 1px solid var(--border); margin: 0; min-height: 250px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">Ordre Detaljer</h3>
                        <button id="orderDetailsEditBtn" onclick="toggleOrderDetailsEdit()" class="btn btn-primary btn-sm" style="display: ${isQuotesMontor() ? 'none' : ''};">
                            Rediger
                        </button>
                    </div>
                    
                    <!-- Read Mode -->
                    <div id="orderDetailsReadMode" style="display: grid; gap: 12px;">
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Kontaktperson</div>
                            <div id="orderDetailsContactName" style="font-weight: 600; font-size: 14px;">${currentWorkspaceOrder.contact_person_name || currentWorkspaceOrder.contact_person || 'Ikke angivet'}</div>
                        </div>
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Telefon</div>
                            <div id="orderDetailsPhone" style="font-weight: 600; font-size: 14px;">${currentWorkspaceOrder.contact_person_phone || currentWorkspaceOrder.customer_phone || 'Ikke angivet'}</div>
                        </div>
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Email</div>
                            <div id="orderDetailsEmail" style="font-weight: 600; font-size: 14px;">${currentWorkspaceOrder.contact_person_email || currentWorkspaceOrder.customer_email || 'Ikke angivet'}</div>
                        </div>
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Sagstype</div>
                            <div id="orderDetailsOrderType" style="font-weight: 600; font-size: 14px;">${currentWorkspaceOrder.order_type === 'consumption' ? 'Forbrug' : 'Kalkulation'}${currentWorkspaceOrder.is_extra_work ? ' - Ekstraarbejde' : ''}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Ordre Adresse</div>
                            <div id="orderDetailsAddress" style="font-weight: 600; font-size: 14px;">
                                ${currentWorkspaceOrder.order_address || currentWorkspaceOrder.address || 'Ikke angivet'}<br>
                                ${currentWorkspaceOrder.order_postal_code || currentWorkspaceOrder.postal_code || ''} ${currentWorkspaceOrder.order_city || currentWorkspaceOrder.city || ''}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Edit Mode (hidden) -->
                    <div id="orderDetailsEditMode" style="display: none;">
                        <div style="display: grid; gap: 8px;">
                            <div>
                                <label style="display: block; color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Kontaktperson</label>
                                <select id="orderDetailsContactSelect" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                                    <option value="">Vælg kontaktperson...</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Sagstype</label>
                                <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                        <input type="radio" name="orderDetailsOrderType" value="consumption" ${currentWorkspaceOrder.order_type !== 'calculation' ? 'checked' : ''} style="width: 16px; height: 16px;"> Forbrug
                                    </label>
                                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                        <input type="radio" name="orderDetailsOrderType" value="calculation" ${currentWorkspaceOrder.order_type === 'calculation' ? 'checked' : ''} style="width: 16px; height: 16px;"> Kalkulation
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label style="display: block; color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Ordre Adresse</label>
                                <input type="text" id="orderDetailsAddressInput" value="${currentWorkspaceOrder.order_address || currentWorkspaceOrder.address || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 10px;">
                                <div>
                                    <label style="display: block; color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Postnummer</label>
                                    <input type="text" id="orderDetailsPostalInput" value="${currentWorkspaceOrder.order_postal_code || currentWorkspaceOrder.postal_code || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                                </div>
                                <div>
                                    <label style="display: block; color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">By</label>
                                    <input type="text" id="orderDetailsCityInput" value="${currentWorkspaceOrder.order_city || currentWorkspaceOrder.city || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end;">
                            <button onclick="cancelOrderDetailsEdit()" class="btn btn-secondary btn-sm">
                                Annuller
                            </button>
                            ${btn('primary', 'save', 'Gem', { onclick: 'saveOrderDetails()', small: true })}
                        </div>
                    </div>
                </div>
                ${hasExtraWork ? `
                <!-- v106.4p: Ekstraarbejde i venstre kolonne (klikbare bokse) -->
                <div style="background: var(--surface); padding: 18px; border-radius: 10px; border: 1px solid var(--color-orange);">
                    <h3 style="margin: 0 0 10px 0; color: var(--color-orange); display:flex;align-items:center;gap:8px;"><i data-lucide="hammer"></i> Ekstraarbejde (${workspaceExtraWorkOrders.length})</h3>
                    <div style="display: grid; gap: 8px;">
                        ${workspaceExtraWorkOrders.map(extraOrder => `
                            <div onclick="openOrderWorkspace(${extraOrder.id}, ${currentWorkspaceOrder.id})" style="background: var(--accent-soft); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--color-orange); cursor: pointer;">
                                <div style="font-weight: 600; color: var(--color-orange); font-size: 12px;">Ordre ${extraOrder.full_order_number}</div>
                                <div style="font-size: 12px; margin-top: 3px;">${extraOrder.title}</div>
                                <div style="display:flex;justify-content:space-between;margin-top:5px;font-size:11px;">
                                    <span style="color: var(--text-muted);">${new Date(extraOrder.created_at).toLocaleDateString('da-DK')}</span>
                                    <strong>${formatCurrency(extraOrder.subtotal ?? extraOrder.total)}</strong> <!-- v106.4s: EKSKL. moms -->
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
            
            <!-- Right column: Quick info -->
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div style="background: var(--surface); padding: 18px; border-radius: 10px; border: 1px solid var(--border);">
                    <h3 style="margin: 0 0 12px 0;">Kunde Information</h3>
                    <div style="display: grid; gap: 8px;">
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Ordre Nummer</div>
                            <div style="font-weight: 600; font-size: 14px;">${currentWorkspaceOrder.order_number}</div>
                        </div>
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Firma</div>
                            <div style="font-weight: 600; font-size: 14px;">${currentWorkspaceOrder.company_name}</div>
                        </div>
                        ${currentWorkspaceOrder.cvr_number || currentWorkspaceOrder.customer_cvr ? `
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">CVR Nummer</div>
                            <div style="font-weight: 600; font-size: 14px;">${currentWorkspaceOrder.cvr_number || currentWorkspaceOrder.customer_cvr}</div>
                        </div>
                        ` : ''}
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Status</div>
                            ${getStageBadge(currentWorkspaceOrder)}
                        </div>
                        ${currentWorkspaceOrder.accepted_at ? `
                        <div style="padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Accepteret</div>
                            <div style="font-weight: 600; font-size: 14px;">${new Date(currentWorkspaceOrder.accepted_at).toLocaleDateString('da-DK')}</div>
                        </div>
                        ` : ''}
                        <div>
                            <div style="color: var(--text-muted); font-size: 12px; margin-bottom: 3px;">Oprettet af</div>
                            <div style="font-weight: 600; font-size: 14px;">${currentWorkspaceOrder.created_by_name}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Quick actions: ens hvide knapper i grid (v83: skjules helt for montor) -->
                ${isQuotesMontor() ? '' : `
                <div class="quick-actions-card">
                    <h3 style="margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;"><i data-lucide="zap"></i> Hurtige Handlinger</h3>
                    <div class="quick-actions-grid">
                        <button onclick="viewOriginalQuote(${currentWorkspaceOrder.id})" class="quick-action-btn">
                            <i data-lucide="file-text"></i> Se Ordre
                        </button>
                        <button onclick="switchWorkspaceTab('materials')" class="quick-action-btn">
                            <i data-lucide="plus"></i> Tilføj Materiale
                        </button>
                        <button onclick="switchWorkspaceTab('documents')" class="quick-action-btn">
                            <i data-lucide="paperclip"></i> Upload Dokument
                        </button>
                        <button onclick="switchWorkspaceTab('notes')" class="quick-action-btn">
                            <i data-lucide="sticky-note"></i> Tilføj Note
                        </button>
                        ${!isQuotesMontor() && !currentWorkspaceOrder.is_extra_work ? `
                        <button onclick="createExtraWork(${currentWorkspaceOrder.id})" class="quick-action-btn accent-orange">

                            <i data-lucide="hammer"></i> Ekstraarbejde
                        </button>
                        ` : ''}
                        ${currentWorkspaceOrder.order_stage === 'completed' ? `
                        <button onclick="reopenOrder(${currentWorkspaceOrder.id})" class="quick-action-btn">
                            <i data-lucide="undo-2"></i> Genåbn
                        </button>
                        ` : ''}
                    </div>
                </div>
                `}
                <div id="workspaceInvoicesSection"></div>
            </div>
        </div>
        
        <!-- Arbejdsbeskrivelse Section (Full Width) -->
        <div style="background: var(--surface); padding: 20px; border-radius: 10px; border: 1px solid var(--border); margin-top: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;"><i data-lucide="clipboard-list"></i> Arbejdsbeskrivelse</h3>
                <button id="workDescEditBtn" onclick="toggleWorkDescriptionEdit()" class="btn-secondary">
                    <i data-lucide="pencil"></i> Rediger
                </button>
            </div>
            
            <!-- Read Mode (default) -->
            <div id="workDescReadMode" style="display: block;">
                <div id="workDescContent" style="min-height: 100px; padding: 15px; background: var(--surface-muted); border-radius: 5px; border: 1px solid var(--border);">
                    ${currentWorkspaceOrder.work_description || '<em style="color: var(--text-muted);">Ingen beskrivelse endnu...</em>'}
                </div>
            </div>
            
            <!-- Edit Mode (hidden) -->
            <div id="workDescEditMode" style="display: none;">
                <div id="workDescEditor" style="min-height: 200px; background: var(--surface);"></div>
                <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end;">
                    <button onclick="cancelWorkDescriptionEdit()" class="btn btn-secondary">
                        Annuller
                    </button>
                    ${btn('primary', 'save', 'Gem', { onclick: 'saveWorkDescription()' })}
                </div>
            </div>
        </div>
        
        <!-- v106.4p: (Ekstraarbejde er flyttet til venstre kolonne i oversigten) -->
        <!-- v106.4p: faktura-preview i fuld bredde, nederst i oversigten -->
        <div id="wsInvoicePreview"></div>
    `;
    
    // v106.4k: faktura-sektionen er altid synlig - render indholdet efter overview
    renderWorkspaceInvoicesSection();

}

// Render invoice button based on invoice status
// Render invoice button based on invoice status
// v106.4j: med fakturaer vises "Fakturaer (n)" som aabner listen i workspace
function renderInvoiceButton() {
    const invs = workspaceInvoices || [];
    if (invs.length > 0) {
        return `
            <button onclick="toggleWorkspaceInvoices()" class="quick-action-btn accent-blue">
                <i data-lucide="receipt"></i> Fakturaer (${invs.length})
            </button>`;
    }
    return `
        <button onclick="openInvoiceTypeModal(${currentWorkspaceOrder.id})" class="quick-action-btn accent-green">
            <i data-lucide="receipt-text"></i> Opret Faktura
        </button>`;
}

// v106.4j: vis/skjul faktura- & kreditnota-listen i workspace
function toggleWorkspaceInvoices() {
    const sec = document.getElementById('workspaceInvoicesSection');
    if (!sec) return;
    if (sec.style.display === 'none') {
        sec.style.display = 'block';
        renderWorkspaceInvoicesSection();
    } else {
        sec.style.display = 'none';
    }
}

// v106.4j: "Fakturaer & Kreditnotaer" - liste + opsummering (Faktureret / Krediteret / Rest)
function renderWorkspaceInvoicesSection() {
    const sec = document.getElementById('workspaceInvoicesSection');
    if (!sec || !currentWorkspaceOrder) return;
    const invs = workspaceInvoices || [];
    const fmt = v => new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(v || 0);
    // v106.4k: udkast taeller med med det samme
    // v106.4q: Faktureret/Rest er ALTID ekskl. moms (subtotal) - order.total er inkl. moms
    const invoiced = invs.filter(i => i.invoice_type !== 'creditnote').reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
    const credited = invs.filter(i => i.invoice_type === 'creditnote').reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
    const orderSubtotal = Number(currentWorkspaceOrder.live_subtotal ?? currentWorkspaceOrder.subtotal) || 0; // v106.4s: live vaerdi
    const rest = orderSubtotal - invoiced + credited;
    const typeLabel = i => i.invoice_type === 'creditnote' ? 'Kreditnota' : (i.invoice_type === 'aconto' ? 'Aconto' : 'Slutfaktura');
    const statusLabel = i => i.status === 'draft' ? 'Ikke sendt' : (i.status === 'sent' ? 'Sendt' : 'Betalt');
    const rows = invs.map(i => `
        <tr onclick="showWorkspaceInvoicePreview(${i.id})" style="cursor:pointer;border-bottom:1px solid var(--border);background:rgba(186,151,84,.07);">
            <td style="padding:8px 6px;font-size:12px;">${i.invoice_number}</td>
            <td style="padding:8px 6px;font-size:12px;">${typeLabel(i)}</td>
            <td style="padding:8px 6px;font-size:12px;">${statusLabel(i)}</td>
            <td style="padding:8px 6px;font-size:12px;">${new Date(i.invoice_date).toLocaleDateString('da-DK')}</td>
            <td style="padding:8px 6px;font-size:12px;text-align:right;font-weight:600;">${fmt(i.total)}</td>
            <td style="padding:8px 6px;text-align:right;">
                ${i.status === 'draft' ? `<button class="btn btn-icon btn-danger" title="Slet udkast" onclick="event.stopPropagation();deleteInvoice(${i.id})"><i data-lucide="trash-2"></i></button>` : ''}
                ${i.invoice_type !== 'creditnote' && i.status === 'sent' ? `<button class="btn btn-icon" title="Markér som betalt" style="color:var(--color-green);" onclick="event.stopPropagation();markInvoicePaid(${i.id})"><i data-lucide="check"></i></button>` : ''}
            </td>
        </tr>`).join('');

    sec.innerHTML = `
        <div style="background:var(--surface);padding:30px;border-radius:10px;border:2px solid var(--border);margin-top:30px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap;">
                <h3 style="margin:0;display:flex;align-items:center;gap:8px;"><i data-lucide="receipt"></i> Fakturaer &amp; Kreditnotaer</h3>
                <div style="display:flex;gap:10px;">
                    <button onclick="openInvoiceTypeModal(${currentWorkspaceOrder.id})" style="background:#E7F5EC;border:1px solid #CBE7D5;color:var(--color-green);border-radius:8px;padding:5px 12px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i data-lucide="plus" style="width:15px;height:15px;"></i> Opret Faktura</button>
                    <button onclick="openCreditNotePicker()" style="background:#FDECEC;border:1px solid #F2C6C0;color:#C0392B;border-radius:8px;padding:5px 12px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i data-lucide="undo-2" style="width:15px;height:15px;"></i> Opret Kreditnota</button>
                </div>
            </div>
            <div style="font-size:13px;color:var(--text);margin-bottom:15px;">
                Faktureret (ekskl. moms): <strong>${fmt(invoiced)}</strong>
                ${credited !== 0 ? ` &nbsp;&bull;&nbsp; Krediteret (ekskl. moms): <strong>${fmt(credited)}</strong>` : ''}
                &nbsp;&bull;&nbsp; Rest (ekskl. moms): <strong>${fmt(rest)}</strong>
                ${rest < 0 ? '<span style="color:#C0392B;">&nbsp;&#9888; Der er faktureret mere end ordrebeløbet (f.eks. slutfaktura + aconto) &mdash; kontrollér/slet udkastene.</span>' : ''}
            </div>
            <div class="doc-table-scroll">
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr style="border-bottom:2px solid var(--text);">
                    <th style="padding:8px 6px;text-align:left;font-size:12px;">Nr.</th>
                    <th style="padding:8px 6px;text-align:left;font-size:12px;">Type</th>
                    <th style="padding:8px 6px;text-align:left;font-size:12px;">Status</th>
                    <th style="padding:8px 6px;text-align:left;font-size:12px;">Dato</th>
                    <th style="padding:8px 6px;text-align:right;font-size:12px;">Total (inkl. moms)</th>
                    <th></th>
                </tr></thead>
                <tbody>${rows || '<tr><td colspan="6" style="padding:12px;font-size:12px;color:var(--text-muted);">Ingen fakturaer endnu</td></tr>'}</tbody>
            </table>
            </div>
        </div>`;
    if (window.lucide) { try { lucide.createIcons(); } catch (e) { /* ignore */ } }
}


// v106.4o: vis faktura inline i workspace (nederst i faktura-sektionen) - forlader ikke ordren
async function showWorkspaceInvoicePreview(invoiceId) {
    try {
        const token = sessionStorage.getItem('token');
        const res = await fetch(`/api/invoices/${invoiceId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Kunne ikke hente faktura');
        const invoice = await res.json();
        renderWorkspaceInvoicePreview(invoice);
        const box = document.getElementById('wsInvoicePreview');
        if (box) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
        console.error('Workspace invoice preview error:', error);
        alert('Kunne ikke indlæse faktura: ' + error.message);
    }
}

function renderWorkspaceInvoicePreview(invoice) {
    const box = document.getElementById('wsInvoicePreview');
    if (!box || typeof buildInvoiceSheetHTML !== 'function') return;
    window.currentPreviewInvoice = invoice;
    const actions = `
        <button onclick="closeWorkspaceInvoicePreview()" class="btn btn-secondary">
            <i data-lucide="x"></i> Luk
        </button>
        ${invoice.status === 'draft' && invoice.invoice_type !== 'creditnote' ? `
            <button onclick="sendInvoice(${invoice.id})" class="btn btn-primary">
                <i data-lucide="send"></i> Godkend og send
            </button>
            <button onclick="approveInvoiceWithoutSending(${invoice.id})" class="btn btn-secondary">
                <i data-lucide="check"></i> Godkend uden at sende
            </button>
        ` : ''}
        ${invoice.invoice_type !== 'creditnote' && invoice.status === 'sent' ? `
            <button onclick="markInvoicePaid(${invoice.id})" class="btn btn-primary">
                <i data-lucide="check"></i> Markér Betalt
            </button>
        ` : ''}
        ${invoice.invoice_type !== 'creditnote' && invoice.status !== 'draft' ? `
            <button onclick="createCreditNote(${invoice.id})" class="btn btn-secondary">
                <i data-lucide="undo-2"></i> Opret Kreditnota
            </button>
        ` : ''}
        <button onclick="window.print()" class="btn btn-secondary">
            <i data-lucide="printer"></i> Print / PDF
        </button>
        ${invoice.status === 'draft' ? `
            <button onclick="deleteInvoice(${invoice.id})" class="btn btn-danger toolbar-end">
                <i data-lucide="trash-2"></i> Slet
            </button>
        ` : ''}
    `;
    box.innerHTML = `
        <div style="margin-top:20px;border-top:2px solid var(--border);padding-top:20px;">
            <div class="preview-actions" style="margin-bottom:20px;">${actions}</div>
            <div class="quote-sheet-wrap">${buildInvoiceSheetHTML(invoice)}</div>
        </div>`;
    if (window.lucide) { try { lucide.createIcons(); } catch (e) { /* ignore */ }
    }
}

function refreshWorkspaceInvoicePreview(invoiceId) {
    // Genrender listen og hent fakturaen igen, saa status/belob er friske
    renderWorkspaceInvoicesSection();
    const box = document.getElementById('wsInvoicePreview');
    if (box && window.currentPreviewInvoice && window.currentPreviewInvoice.id === invoiceId) {
        showWorkspaceInvoicePreview(invoiceId);
    }
}

function closeWorkspaceInvoicePreview() {
    const box = document.getElementById('wsInvoicePreview');
    if (box) box.innerHTML = '';
    window.currentPreviewInvoice = null;
    // v106.6b: ryd op efter inline ordre-visning
    if (typeof currentQuote !== 'undefined' && currentQuote && currentQuote.is_order_view) currentQuote = null;
}

// v106.4o: genhent fakturaer fra server og genrender workspace-sektionen (bruges efter sletning)
async function refreshWorkspaceInvoicesFromServer() {
    if (!currentWorkspaceOrder) return;
    try {
        const token = sessionStorage.getItem('token');
        const res = await fetch(`/api/orders/${currentWorkspaceOrder.id}/workspace`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            workspaceInvoices = data.invoices || (data.invoice ? [data.invoice] : []);
        }
    } catch (error) {
        console.error('Refresh workspace invoices error:', error);
    }
    renderWorkspaceInvoicesSection();
}

// Render expenses tab
function renderWorkspaceExpenses(container) {
    const totalExpenses = workspaceExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    container.innerHTML = `
        <div style="background: var(--surface); padding: 30px; border-radius: 10px; border: 2px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                <div>
                    <h3 style="margin: 0 0 10px 0;">Udgifter</h3>
                    <p style="margin: 0; color: var(--text-muted);">Total udgifter: <strong>${formatCurrency(totalExpenses)}</strong></p>
                </div>
                <button onclick="showAddExpense()" class="btn btn-primary">
                    Tilføj Udgift
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
            <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
                <i data-lucide="coins" style="width:48px;height:48px;color:var(--text-muted);display:inline-block;margin-bottom:16px;"></i>
                <h3>Ingen udgifter endnu</h3>
                <p>Tilføj udgifter for at tracke projektets omkostninger</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: var(--surface-muted);">
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid var(--border);">Dato</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid var(--border);">Beskrivelse</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid var(--border);">Kategori</th>
                    <th style="padding: 15px; text-align: right; border-bottom: 2px solid var(--border);">Beløb</th>
                    <th style="padding: 15px; text-align: left; border-bottom: 2px solid var(--border);">Tilføjet af</th>
                    <th style="padding: 15px; text-align: center; border-bottom: 2px solid var(--border);">Handlinger</th>
                </tr>
            </thead>
            <tbody>
                ${workspaceExpenses.map(exp => `
                    <tr style="border-bottom: 1px solid var(--border);">
                        <td style="padding: 15px;">${new Date(exp.expense_date).toLocaleDateString('da-DK')}</td>
                        <td style="padding: 15px;">${exp.description}</td>
                        <td style="padding: 15px;">${exp.category || '-'}</td>
                        <td style="padding: 15px; text-align: right; font-weight: 600; color: var(--color-red);">${formatCurrency(exp.amount)}</td>
                        <td style="padding: 15px;">${exp.created_by_name}</td>
                        <td style="padding: 15px; text-align: center;">
                            <button onclick="editExpense(${exp.id})" class="btn btn-primary btn-sm">
                                Rediger
                            </button>
                            ${btn('danger', 'trash-2', 'Slet', { onclick: `deleteExpense(${exp.id})`, small: true, title: 'Slet udgift' })}
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
        <div style="background: var(--surface); border-radius: 10px; padding: 30px; max-width: 600px; width: 90%;">
            <h2 style="margin: 0 0 20px 0;">Tilføj Udgift</h2>
            
            <form id="expenseForm" onsubmit="event.preventDefault(); saveExpense();">
                <div style="margin-bottom: 20px; padding: 15px; background: var(--surface-muted); border: 1px solid var(--border); border-radius: 8px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Træk fra materiale-database <span style="font-weight: 400; color: var(--text-muted);">(valgfrit — søg på nr. eller navn, fx "8000")</span></label>
                    <input type="text" id="expenseMaterialSearch" autocomplete="off" placeholder="Søg materiale..." oninput="filterMaterialSearch(this.value)" onfocus="filterMaterialSearch(this.value)" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px; background: var(--surface);">
                    <div id="expenseMaterialResults" style="display: none; max-height: 220px; overflow-y: auto; border: 1px solid var(--border); border-radius: 5px; margin-top: 5px; background: var(--surface);"></div>
                    <div id="expenseMaterialSelected" style="display: none; margin-top: 10px; padding: 10px; background: var(--accent-soft); border-radius: 5px; font-size: 13px;"></div>
                </div>

                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Beskrivelse *</label>
                    <textarea id="expenseDescription" required rows="3" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px; resize: vertical;"></textarea>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Antal</label>
                        <input type="number" id="expenseQuantity" min="0" step="0.01" value="1" oninput="recalcExpenseAmount()" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Beløb (DKK) *</label>
                        <input type="number" id="expenseAmount" required min="0" step="0.01" oninput="clearExpenseMaterialLink()" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Dato</label>
                        <input type="date" id="expenseDate" value="${new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                    </div>
                </div>
                
                <div style="margin-bottom: 30px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kategori</label>
                    <select id="expenseCategory" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                        <option value="">Vælg kategori...</option>
                        <option value="Materialer">Materialer</option>
                        <option value="Arbejdskraft">Arbejdskraft</option>
                        <option value="Transport">Transport</option>
                        <option value="Værktøj">Værktøj</option>
                        <option value="Andet">Andet</option>
                    </select>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="closeExpenseModal()" class="btn btn-secondary">
                        Annuller
                    </button>
                    <button type="submit" class="btn btn-primary">
                        Gem Udgift
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    loadMaterialsForExpense();
}

// ===== Material search in expense modal =====
let expenseMaterialsCache = [];
let selectedExpenseMaterial = null;

async function loadMaterialsForExpense() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/materials', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) expenseMaterialsCache = await response.json();
    } catch (error) {
        console.error('Could not load materials:', error);
    }
}

function filterMaterialSearch(query) {
    const resultsDiv = document.getElementById('expenseMaterialResults');
    if (!resultsDiv) return;
    
    const q = (query || '').trim().toLowerCase();
    if (!q) {
        resultsDiv.style.display = 'none';
        resultsDiv.innerHTML = '';
        return;
    }
    
    const matches = expenseMaterialsCache.filter(m =>
        (m.material_number || '').toLowerCase().includes(q) ||
        (m.name || '').toLowerCase().includes(q)
    ).slice(0, 20);
    
    if (matches.length === 0) {
        resultsDiv.innerHTML = '<div style="padding: 10px; color: var(--text-muted); font-size: 13px;">Ingen materialer matcher</div>';
        resultsDiv.style.display = 'block';
        return;
    }
    
    resultsDiv.innerHTML = matches.map(m => `
        <div onclick="selectExpenseMaterial(${m.id})" style="padding: 10px; cursor: pointer; border-bottom: 1px solid var(--border-soft);" onmouseover="this.style.background='var(--surface-muted)'" onmouseout="this.style.background='white'">
            <strong>${m.material_number}</strong> — ${m.name}
            <span style="float: right; color: var(--text-muted); font-size: 12px;">Kost: ${formatCurrency(m.cost_price)} | Salg: ${formatCurrency(m.sales_price)} / ${m.unit || 'stk'}</span>
        </div>
    `).join('');
    resultsDiv.style.display = 'block';
}

function selectExpenseMaterial(materialId) {
    const material = expenseMaterialsCache.find(m => m.id === materialId);
    if (!material) return;
    
    selectedExpenseMaterial = material;
    
    // Fill description and amount from the material (cost price as expense)
    document.getElementById('expenseDescription').value = `${material.material_number} - ${material.name}`;
    const qty = parseFloat(document.getElementById('expenseQuantity').value) || 1;
    document.getElementById('expenseAmount').value = (material.cost_price * qty).toFixed(2);
    
    // Show selected material info
    const selectedDiv = document.getElementById('expenseMaterialSelected');
    selectedDiv.innerHTML = `<strong>${material.material_number} — ${material.name}</strong><br>
        Kostpris: ${formatCurrency(material.cost_price)} | Salgspris: ${formatCurrency(material.sales_price)} pr. ${material.unit || 'stk'} (beløb = antal × kostpris, kan redigeres)
        <button type="button" onclick="clearExpenseMaterialLink()" style="float: right; padding: 2px 8px; background: var(--text-muted); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Fjern</button>`;
    selectedDiv.style.display = 'block';
    
    // Hide search results
    document.getElementById('expenseMaterialResults').style.display = 'none';
    document.getElementById('expenseMaterialSearch').value = `${material.material_number}`;
}

function recalcExpenseAmount() {
    if (!selectedExpenseMaterial) return;
    const qty = parseFloat(document.getElementById('expenseQuantity').value) || 0;
    document.getElementById('expenseAmount').value = (selectedExpenseMaterial.cost_price * qty).toFixed(2);
}

function clearExpenseMaterialLink() {
    // Only clear when user manually edits the amount and a material is linked
    if (!selectedExpenseMaterial) return;
    const expected = (selectedExpenseMaterial.cost_price * (parseFloat(document.getElementById('expenseQuantity').value) || 1)).toFixed(2);
    const current = document.getElementById('expenseAmount').value;
    if (current !== expected) {
        selectedExpenseMaterial = null;
        const selectedDiv = document.getElementById('expenseMaterialSelected');
        if (selectedDiv) selectedDiv.style.display = 'none';
    }
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
    
    // Debug: Log which order we're adding expense to
    console.log('Adding expense to order:', currentWorkspaceOrder.id, currentWorkspaceOrder.order_number);
    console.log('Current workspace order:', currentWorkspaceOrder);
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/orders/${currentWorkspaceOrder.id}/expenses`, {
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
        alert('Udgift tilføjet!');
        
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
        <div style="background: var(--surface); border-radius: 10px; padding: 30px; max-width: 600px; width: 90%;">
            <h2 style="margin: 0 0 20px 0;">Rediger Udgift</h2>
            
            <form id="expenseForm" onsubmit="event.preventDefault(); updateExpense(${expenseId});">
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Beskrivelse *</label>
                    <textarea id="expenseDescription" required rows="3" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px; resize: vertical;">${expense.description}</textarea>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Beløb (DKK) *</label>
                        <input type="number" id="expenseAmount" required min="0" step="0.01" value="${expense.amount}" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Dato</label>
                        <input type="date" id="expenseDate" value="${expense.expense_date}" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                    </div>
                </div>
                
                <div style="margin-bottom: 30px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kategori</label>
                    <select id="expenseCategory" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                        <option value="">Vælg kategori...</option>
                        <option value="Materialer" ${expense.category === 'Materialer' ? 'selected' : ''}>Materialer</option>
                        <option value="Arbejdskraft" ${expense.category === 'Arbejdskraft' ? 'selected' : ''}>Arbejdskraft</option>
                        <option value="Transport" ${expense.category === 'Transport' ? 'selected' : ''}>Transport</option>
                        <option value="Værktøj" ${expense.category === 'Værktøj' ? 'selected' : ''}>Værktøj</option>
                        <option value="Andet" ${expense.category === 'Andet' ? 'selected' : ''}>Andet</option>
                    </select>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="closeExpenseModal()" class="btn btn-secondary">
                        Annuller
                    </button>
                    <button type="submit" class="btn btn-primary">
                        Gem Ændringer
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
        const response = await fetch(`/api/orders/${currentWorkspaceOrder.id}/expenses/${expenseId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ description, amount, expense_date, category })
        });
        
        if (!response.ok) throw new Error('Failed to update expense');
        
        closeExpenseModal();
        alert('Udgift opdateret!');
        
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
        const response = await fetch(`/api/orders/${currentWorkspaceOrder.id}/expenses/${expenseId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to delete expense');
        
        alert('Udgift slettet!');
        
        // Refresh
        await openOrderWorkspace(currentWorkspaceOrder.id);
        switchWorkspaceTab('expenses');
        
    } catch (error) {
        console.error('Delete expense error:', error);
        alert('Kunne ikke slette udgift: ' + error.message);
    }
}

// Render documents tab
function renderWorkspaceDocuments(container) {
    container.innerHTML = `
        <div style="background: var(--surface); padding: 30px; border-radius: 10px; border: 2px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                <div>
                    <h3 style="margin: 0 0 10px 0;"> Dokumenter</h3>
                    <p style="margin: 0; color: var(--text-muted);">Dokumenter tilknyttet denne ordre (${workspaceDocuments.length})</p>
                </div>
                <button onclick="showUploadDocument()" class="btn btn-primary">
                    <i data-lucide="upload"></i> Upload Dokument
                </button>
            </div>
            
            <div id="documentsList"></div>
        </div>
    `;
    
    renderDocumentsList();
}

// Render documents list
function renderDocumentsList() {
    const container = document.getElementById('documentsList');
    
    if (workspaceDocuments.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
                <div style="font-size: 64px; margin-bottom: 20px;"></div>
                <h3>Ingen dokumenter endnu</h3>
                <p>Upload dokumenter for at dele dem med teamet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div style="display: grid; gap: 8px;">
            ${workspaceDocuments.map(doc => {
                const icon = getDocumentIcon(doc.original_name);
                const size = formatFileSize(doc.file_size);
                const date = new Date(doc.created_at).toLocaleDateString('da-DK');
                const isAdminDoc = (doc.visibility || 'all') === 'admin';
                // v106.6g: montorer maa ikke slette; ledelsen faar synligheds-knap
                const montor = isQuotesMontor();
                
                return `
                    <div style="background: var(--surface-muted); padding: 20px; border-radius: 12px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 10px; ${isAdminDoc ? 'border-left: 4px solid var(--color-orange, #e67e22);' : ''}">
                        <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                            <div style="font-size: 32px;">${icon}</div>
                            <div style="flex: 1;">
                                <div style="font-weight: 600; margin-bottom: 5px;">${doc.original_name} ${isAdminDoc ? '<span style="display: inline-block; vertical-align: middle; margin-left: 6px; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: rgba(230, 126, 34, 0.12); color: var(--color-orange, #e67e22); border: 1px solid var(--color-orange, #e67e22);">Kun ledelsen</span>' : ''}</div>
                                <div style="font-size: 13px; color: var(--text-muted);">
                                    ${size} • ${doc.document_type || 'Dokument'} • Uploadet af ${doc.uploaded_by_name} • ${date}
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px; flex: 0 0 auto;">
                            ${btn('ghost', 'eye', 'Preview', { onclick: `previewDocument(${doc.id}, '${doc.original_name.replace(/'/g, "\\'")}')`, title: 'Vis dokument' })}
                            ${btn('ghost', 'download', 'Download', { onclick: `downloadDocument(${doc.id}, '${doc.original_name.replace(/'/g, "\\'")}')`, title: 'Download dokument' })}
                            ${!montor ? `<label style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; cursor: pointer; user-select: none; color: var(--text); white-space: nowrap;" title="Flueben = kun ledelsen kan se dokumentet. Ingen flueben = alle kan se det.">
                                <input type="checkbox" id="docVisChk${doc.id}" ${isAdminDoc ? 'checked' : ''} onchange="toggleDocumentVisibility(${doc.id}, this.checked)" style="width: 16px; height: 16px; accent-color: var(--accent, #f0a030); cursor: pointer;">
                                Kun ledelsen
                            </label>` : ''}
                            ${!montor ? btn('icon', 'trash-2', 'Slet dokument', { onclick: `deleteDocument(${doc.id})`, danger: true, attrs: 'style="color: var(--danger, #c0392b);"' }) : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    refreshIcons(); // v106.6c: konvertér lucide-ikoner (trash-2 var ellers usynlig)
}

// v106.6g: skift synlighed paa et dokument - kun ledelsen.
// v106.6h: explicit tilstand fra checkbox (checked = kun ledelsen, unchecked = alle)
async function toggleDocumentVisibility(documentId, checked) {
    const doc = workspaceDocuments.find(d => d.id === documentId);
    if (!doc || isQuotesMontor()) return;
    const next = checked ? 'admin' : 'all';
    const chk = document.getElementById(`docVisChk${documentId}`);
    if (chk) chk.disabled = true; // undlag dobbeltklik mens PATCH koerer
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/orders/${doc.order_id}/documents/${documentId}/visibility`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ visibility: next })
        });
        if (!response.ok) {
            const e = await response.json().catch(() => ({}));
            throw new Error(e.error || 'Kunne ikke skifte synlighed');
        }
        doc.visibility = next;
        renderDocumentsList();
    } catch (error) {
        console.error('Toggle document visibility error:', error);
        // rul checkbox tilbage ved fejl
        if (chk) { chk.checked = !checked; chk.disabled = false; }
        alert('Kunne ikke skifte synlighed: ' + error.message);
    }
}

// Get document icon
function getDocumentIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': '',
        'doc': '', 'docx': '',
        'xls': '', 'xlsx': '',
        'ppt': '', 'pptx': '',
        'jpg': '', 'jpeg': '', 'png': '', 'gif': '',
        'zip': '', 'rar': '',
        'txt': ''
    };
    return icons[ext] || '';
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// Show upload document dialog
function showUploadDocument() {
    const modal = document.createElement('div');
    modal.id = 'documentModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
    
    modal.innerHTML = `
        <div style="background: var(--surface); border-radius: 10px; padding: 30px; max-width: 500px; width: 90%;">
            <h2 style="margin: 0 0 20px 0;"> Upload Dokument</h2>
            
            <form id="documentForm" onsubmit="event.preventDefault(); uploadDocument();">
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Vælg fil *</label>
                    <input type="file" id="documentFile" required style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 30px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Dokument Type</label>
                    <select id="documentType" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                        <option value="general">Generelt</option>
                        <option value="contract">Kontrakt</option>
                        <option value="invoice">Faktura</option>
                        <option value="receipt">Kvittering</option>
                        <option value="photo">Foto</option>
                        <option value="drawing">Tegning</option>
                        <option value="transferred">Overført fra filer</option>
                    </select>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="closeDocumentModal()" class="btn btn-secondary">
                        Annuller
                    </button>
                    <button type="submit" class="btn btn-primary">
                        Upload
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Close document modal
function closeDocumentModal() {
    const modal = document.getElementById('documentModal');
    if (modal) modal.remove();
}

// Upload document
async function uploadDocument() {
    const fileInput = document.getElementById('documentFile');
    const documentTypeEl = document.getElementById('documentType');
    
    // Null check - make sure elements exist
    if (!fileInput || !documentTypeEl) {
        console.error('Upload form elements not found');
        alert('Fejl: Upload formularen blev ikke fundet');
        return;
    }
    
    const documentType = documentTypeEl.value;
    
    if (!fileInput.files || !fileInput.files[0]) {
        alert('Vælg en fil');
        return;
    }
    
    const file = fileInput.files[0];
    
    if (file.size > 100 * 1024 * 1024) {
        alert('Filen er for stor! Max 100MB');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/orders/${currentWorkspaceOrder.id}/documents`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if (!response.ok) throw new Error('Failed to upload document');
        
        const uploadedDoc = await response.json();
        if (uploadedDoc.warning) {
            alert('Advarsel: ' + uploadedDoc.warning);
        }
        workspaceDocuments.unshift(uploadedDoc);
        
        closeDocumentModal();
        alert('Dokument uploadet!');
        
        // Refresh documents list
        renderDocumentsList();
        
        // Update tab count
        const tab = document.getElementById('workspaceTabDocuments');
        if (tab) {
            tab.textContent = ` Dokumenter (${workspaceDocuments.length})`;
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        alert('Kunne ikke uploade dokument: ' + error.message);
    }
}

// MIME-typer pr. filendelse (til at tvinge inline-visning i preview)
const DOC_MIME_TYPES = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg', pjp: 'image/jpeg',
    png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', heic: 'image/heic',
    pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', md: 'text/plain',
    json: 'application/json', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function getDocMime(filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    return DOC_MIME_TYPES[ext] || 'application/octet-stream';
}

// Hent fil som Blob og returner objekt-URL (garanterer inline-visning uanset server-headers)
async function fetchDocBlobUrl(fileUrl, filename, withAuth) {
    const headers = {};
    if (withAuth) {
        const token = sessionStorage.getItem('token');
        if (token) headers['Authorization'] = 'Bearer ' + token;
    }
    const response = await fetch(fileUrl, { headers });
    if (!response.ok) throw new Error('Kunne ikke hente filen (' + response.status + ')');
    const blob = await response.blob();
    const typedBlob = new Blob([blob], { type: getDocMime(filename) });
    return URL.createObjectURL(typedBlob);
}

// Fælles preview-modal
function openDocPreviewModal(filename, blobUrl, previewHtml) {
    closePreviewModal();
    const modal = document.createElement('div');
    modal.id = 'documentPreviewModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(45,49,57,0.75); z-index: 10001; display: flex; align-items: center; justify-content: center;';
    modal.innerHTML = `
        <div style="position: relative; width: 92%; max-width: 1100px; height: 90%; background: var(--surface); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 8px 30px rgba(0,0,0,0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex: 0 0 auto; gap: 8px;">
                <h3 style="margin: 0; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${filename}</h3>
                <div style="display: flex; gap: 8px; flex: 0 0 auto;">
                    ${blobUrl ? `<a href="${blobUrl}" download="${filename}" class="btn btn-secondary"><i data-lucide="download"></i> Download</a>` : ''}
                    <button onclick="closePreviewModal()" class="btn btn-primary">Luk</button>
                </div>
            </div>
            <div style="flex: 1; min-height: 0; overflow: auto;">${previewHtml}</div>
        </div>
    `;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closePreviewModal();
    });
    document.body.appendChild(modal);
    refreshIcons();
}

// Lightbox til billeder: mørk overlay, centreret billede, X/Escape/klik udenfor lukker
function openDocImageLightbox(filename, blobUrl) {
    closePreviewModal();
    const modal = document.createElement('div');
    modal.id = 'documentPreviewModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.88); z-index: 10001; display: flex; align-items: center; justify-content: center; cursor: pointer;';
    modal.innerHTML = `
        <div style="position: relative; max-width: 90%; max-height: 90%; cursor: default;" onclick="event.stopPropagation()">
            <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 8px; z-index: 2;">
                <a href="${blobUrl}" download="${filename}" class="btn btn-secondary" title="Download">
                    <i data-lucide="download"></i>
                </a>
                <button onclick="closePreviewModal()" class="btn btn-primary" title="Luk" aria-label="Luk">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <img src="${blobUrl}" alt="${filename}" style="max-width: 90vw; max-height: 85vh; display: block; margin: 0 auto; border-radius: 8px;">
            <div style="text-align: center; color: white; margin-top: 14px; font-size: 14px;">${filename}</div>
        </div>
    `;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closePreviewModal();
    });
    const onKey = (e) => { if (e.key === 'Escape') closePreviewModal(); };
    document.addEventListener('keydown', onKey);
    modal._escHandler = onKey;
    document.body.appendChild(modal);
    refreshIcons();
}

// Indlæsnings-overlay (spinner) mens filen hentes
function openDocLoadingModal() {
    closePreviewModal();
    const modal = document.createElement('div');
    modal.id = 'documentPreviewModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(45,49,57,0.75); z-index: 10001; display: flex; align-items: center; justify-content: center;';
    modal.innerHTML = `
        <div style="background: var(--surface); border-radius: 14px; padding: 28px 36px; display: flex; align-items: center; gap: 14px;">
            <div class="preview-spinner" style="width: 22px; height: 22px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: docSpin 0.8s linear infinite;"></div>
            <span style="color: var(--text); font-weight: 500;">Indlæser preview…</span>
        </div>
    `;
    const style = document.createElement('style');
    style.textContent = '@keyframes docSpin { to { transform: rotate(360deg); } }';
    modal.appendChild(style);
    document.body.appendChild(modal);
}

// Preview document
async function previewDocument(documentId, filename) {
    const doc = workspaceDocuments.find(d => d.id === documentId);
    if (!doc) {
        alert('Dokument ikke fundet');
        return;
    }

    // Hent via API med login (virker for både disk- og R2-filer)
    const contentUrl = `/api/orders/${doc.order_id}/documents/${documentId}/content?disposition=inline`;
    const ext = (filename || '').split('.').pop().toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const pdfExtensions = ['pdf'];
    const textExtensions = ['txt', 'csv', 'md', 'json'];
    const videoExtensions = ['mp4', 'webm', 'mov'];
    const audioExtensions = ['mp3', 'wav', 'ogg'];
    const officeExtensions = ['doc', 'docx', 'xls', 'xlsx'];

    openDocLoadingModal();

    try {
        const blobUrl = await fetchDocBlobUrl(contentUrl, filename, true);

        if (imageExtensions.includes(ext)) {
            openDocImageLightbox(filename, blobUrl);
        } else if (pdfExtensions.includes(ext)) {
            openDocPreviewModal(filename, blobUrl,
                `<iframe src="${blobUrl}" style="width: 100%; height: 100%; border: none; border-radius: 8px;"></iframe>`
            );
        } else if (textExtensions.includes(ext)) {
            openDocPreviewModal(filename, blobUrl,
                `<pre id="docPreviewText" style="white-space: pre-wrap; font-family: inherit; font-size: 13px; color: var(--text); margin: 0;">Indlæser…</pre>`
            );
            fetch(blobUrl).then(r => r.text()).then(t => {
                const el = document.getElementById('docPreviewText');
                if (el) el.textContent = t;
            });
        } else if (videoExtensions.includes(ext)) {
            openDocPreviewModal(filename, blobUrl,
                `<video src="${blobUrl}" controls autoplay style="max-width: 100%; max-height: 100%; margin: 0 auto; display: block; border-radius: 8px;"></video>`
            );
        } else if (audioExtensions.includes(ext)) {
            openDocPreviewModal(filename, blobUrl,
                `<audio src="${blobUrl}" controls style="width: 100%; margin-top: 40px;"></audio>`
            );
        } else if (officeExtensions.includes(ext)) {
            openDocPreviewModal(filename, blobUrl,
                `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px; color: var(--text-muted);">
                    <i data-lucide="file-text" style="width: 48px; height: 48px;"></i>
                    <p style="margin: 0;">Denne filtype (${ext.toUpperCase()}) kan ikke forhåndsvises direkte i browseren.</p>
                    <a href="${blobUrl}" download="${filename}" class="btn btn-primary">
                        <i data-lucide="download"></i> Download filen
                    </a>
                </div>`
            );
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        } else {
            // Ukendt filtype: åbn i nyt faneblad via blob (inline hvis muligt)
            window.open(blobUrl, '_blank');
        }

    } catch (error) {
        console.error('Preview error:', error);
        openDocPreviewModal(filename, null,
            `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px; color: var(--text-muted);">
                <i data-lucide="alert-circle" style="width: 48px; height: 48px;"></i>
                <p style="margin: 0;">Kunne ikke indlæse preview. Prøv igen, eller download filen i stedet.</p>
            </div>`
        );
    }
}

// Close preview modal (frigør også blob-URLs)
function closePreviewModal() {
    const modal = document.getElementById('documentPreviewModal');
    if (!modal) return;
    modal.querySelectorAll('iframe[src^="blob:"], img[src^="blob:"], video[src^="blob:"], audio[src^="blob:"], a[href^="blob:"]').forEach(el => {
        const url = el.src || el.href;
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
    if (modal._escHandler) document.removeEventListener('keydown', modal._escHandler);
    modal.remove();
}

// Download document
async function downloadDocument(documentId, filename) {
    try {
        const token = sessionStorage.getItem('token');

        // Find document (tjek at den findes)
        const doc = workspaceDocuments.find(d => d.id === documentId);
        if (!doc) {
            alert('Dokument ikke fundet');
            return;
        }

        // Hent via API med login (virker for både disk- og R2-filer)
        const response = await fetch(`/api/orders/${doc.order_id}/documents/${documentId}/content?disposition=attachment`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Download fejlede');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (error) {
        console.error('Download error:', error);
        alert('Kunne ikke downloade dokument: ' + error.message);
    }
}

// Delete document
function deleteDocument(documentId) {
    // v106.4i: sgConfirm erstatter native confirm, som browseren kan blokere i stilhed
    sgConfirm('Slet dokument', 'Slet dette dokument?', async () => {
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/orders/${currentWorkspaceOrder.id}/documents/${documentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to delete document');
        
        alert('Dokument slettet!');
        
        // Remove from array
        workspaceDocuments = workspaceDocuments.filter(d => d.id !== documentId);
        
        // Refresh
        renderDocumentsList();
        
        // Update tab count
        const tab = document.getElementById('workspaceTabDocuments');
        if (tab) {
            tab.textContent = ` Dokumenter (${workspaceDocuments.length})`;
        }
        
    } catch (error) {
        console.error('Delete error:', error);
        alert('Kunne ikke slette dokument: ' + error.message);
    }
    });
}

// Render "Timer & Materialer" tab - shows labor and material lines on the order
function renderWorkspaceMaterials(container) {
    const lines = workspaceMaterials || [];
    const montor = isQuotesMontor();
    // v102: Tilfoej-knap til alle roller (var kun montorer - regression fra v96)
    const header = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h3 style="margin: 0;">⏱ Timer & Materialer</h3>
            <button onclick="openRegisterMaterialModal()" class="btn btn-primary btn-sm">
                + Registrer Materiale
            </button>
        </div>
    `;

    if (lines.length === 0) {
        container.innerHTML = `
            <div style="background: var(--surface); padding: 30px; border-radius: 10px; border: 2px solid var(--border);">
                ${header}
                <p style="color: var(--text-muted); text-align: center; padding: 40px;">Ingen timer eller materialer registreret på denne sag endnu.<br>
                <span style="font-size: 13px;">Timer registreret via "Min Tid" med denne sag valgt, dukker automatisk op her.</span></p>
            </div>
        `;
        return;
    }
    
    let totalCost = 0;
    let totalSale = 0;
    let totalHours = 0;
    
    const rows = lines.map(line => {
        const isTime = isTimeLine(line);
        const cost = parseFloat(line.total_cost) || 0;
        const sale = parseFloat(line.total_sale) || 0;
        totalCost += cost;
        totalSale += sale;
        if (isTime) totalHours += parseFloat(line.quantity) || 0;
        
        const editable = !montor && line.source !== 'time_entry';
        const descriptionHtml = isTime
            ? timeLineLabel(line)
            : (line.notes
                ? `${line.notes} <em style="color: var(--text-muted); font-size: 12px;">(uspecificeret)</em>`
                : ` ${line.material_name || 'Materiale'} (${line.material_number || '?'})`);
        const date = line.time_entry_date || (line.added_at ? line.added_at.substring(0, 10) : '');
        
        if (montor) {
            // Montor: ingen pris-kolonner
            return `
            <tr style="border-bottom: 1px solid var(--border-soft);">
                <td style="padding: 10px 12px; font-size: 13px; white-space: nowrap;">${date}</td>
                <td style="padding: 10px 12px; font-size: 13px;">${descriptionHtml}</td>
                <td style="padding: 10px 12px; font-size: 13px;">${line.added_by_name || '-'}</td>
                <td style="padding: 10px 12px; font-size: 13px; text-align: right;">${line.quantity} ${isTime ? 't' : (line.unit || '')}</td>
            </tr>
        `;
        }
        // v103: inline-redigering direkte i raekken (beskrivelse, antal, udgift, salg)
        const esc = v => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const inp = 'width: 100%; min-width: 70px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 5px; font-size: 13px; text-align: right; background: var(--surface);';
        const save = `saveInlineMaterialLine(${currentWorkspaceOrder.id}, ${line.id}, this)`;
        const descCell = editable
            ? `<td style="padding: 6px 8px; font-size: 13px; min-width: 220px;"><input type="text" value="${esc(line.notes || line.material_name)}" data-field="notes" onchange="${save}" title="${esc(line.material_number)}" style="${inp} text-align: left; min-width: 200px;"></td>`
            : `<td style="padding: 10px 12px; font-size: 13px;">${descriptionHtml}</td>`;
        const qtyCell = editable
            ? `<td style="padding: 6px 8px; font-size: 13px; text-align: right;"><input type="number" step="0.01" min="0.01" value="${line.quantity}" data-field="quantity" onchange="${save}" style="${inp}"></td>`
            : `<td style="padding: 10px 12px; font-size: 13px; text-align: right;">${line.quantity} ${isTime ? 't' : ''}</td>`;
        const costCell = editable
            ? `<td style="padding: 6px 8px; font-size: 13px; text-align: right;"><input type="number" step="0.01" min="0" value="${parseFloat(line.unit_cost) || 0}" data-field="unit_cost" onchange="${save}" style="${inp}"></td>`
            : `<td style="padding: 10px 12px; font-size: 13px; text-align: right;">${cost.toFixed(2)} kr</td>`;
        const saleCell = editable
            ? `<td style="padding: 6px 8px; font-size: 13px; text-align: right;"><input type="number" step="0.01" min="0" value="${parseFloat(line.unit_sale) || 0}" data-field="unit_sale" onchange="${save}" style="${inp} color: var(--success);"></td>`
            : `<td style="padding: 10px 12px; font-size: 13px; text-align: right; color: var(--success);">${(parseFloat(line.unit_sale) || 0).toFixed(2)} kr</td>`;
        // v105: rabat (Minuba-stil) - rabatten gaelder pr. enhed (125 kr. - 20% = 100 kr./stk);
        // total_sale er allerede rabatteret af backenden.
        const disc = parseFloat(line.discount_percent) || 0;
        const discCell = editable
            ? `<td style="padding: 6px 8px; font-size: 13px; text-align: right;"><input type="number" step="0.1" min="0" max="100" value="${disc}" data-field="discount_percent" onchange="${save}" style="${inp}"></td>`
            : `<td style="padding: 10px 12px; font-size: 13px; text-align: right;">${disc > 0 ? disc + '%' : '-'}</td>`;
        const totalCell = `<td style="padding: 10px 12px; font-size: 13px; text-align: right; font-weight: 600; color: var(--success);">${sale.toFixed(2)} kr</td>`;
        return `
            <tr style="border-bottom: 1px solid var(--border-soft);">
                <td style="padding: 10px 2px; white-space: nowrap;">
                    <button onclick="moveMaterialLine(${currentWorkspaceOrder.id}, ${line.id}, -1)" title="Flyt op" style="padding: 2px 5px; font-size: 11px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; line-height: 1;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">▲</button>
                    <button onclick="moveMaterialLine(${currentWorkspaceOrder.id}, ${line.id}, 1)" title="Flyt ned" style="padding: 2px 5px; font-size: 11px; border: 1px solid var(--border); background: var(--surface); border-radius: 4px; cursor: pointer; line-height: 1;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">▼</button>
                </td>
                <td style="padding: 10px 12px; font-size: 13px; white-space: nowrap;">${date}</td>
                ${descCell}
                <td style="padding: 10px 12px; font-size: 13px;">${line.added_by_name || '-'}</td>
                ${qtyCell}
                ${costCell}
                ${saleCell}
                ${discCell}
                ${totalCell}
            </tr>
        `;
    }).join('');
    
    const tableHead = montor ? `
                        <tr style="border-bottom: 2px solid var(--border); text-align: left;">
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Dato</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Beskrivelse</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Registreret af</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase; text-align: right;">Antal</th>
                        </tr>
` : `
                        <tr style="border-bottom: 2px solid var(--border); text-align: left;">
                            <th style="padding: 10px 6px; width: 44px;"></th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Dato</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Beskrivelse</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Registreret af</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase; text-align: right;">Antal</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase; text-align: right;">Udgift</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase; text-align: right;">Salgspris</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase; text-align: right;">Rbt%</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase; text-align: right;">Total</th>
                        </tr>
`;

    const tableFoot = montor ? `
                    <tfoot>
                        <tr style="border-top: 2px solid var(--border); font-weight: 700;">
                            <td colspan="3" style="padding: 12px; font-size: 13px;">I alt${totalHours > 0 ? ` (${totalHours.toFixed(2)} timer)` : ''}</td>
                            <td></td>
                        </tr>
                    </tfoot>
` : `
                    <tfoot>
                        <tr style="border-top: 2px solid var(--border); font-weight: 700;">
                            <td colspan="5" style="padding: 12px; font-size: 13px;">I alt${totalHours > 0 ? ` (${totalHours.toFixed(2)} timer)` : ''}</td>
                            <td style="padding: 12px; font-size: 13px; text-align: right; color: var(--danger);">${totalCost.toFixed(2)} kr</td>
                            <td></td>
                            <td></td>
                            <td style="padding: 12px; font-size: 13px; text-align: right; color: var(--success);">${totalSale.toFixed(2)} kr</td>
                        </tr>
                    </tfoot>
`;

    container.innerHTML = `
        <div style="background: var(--surface); padding: 30px; border-radius: 10px; border: 2px solid var(--border);">
            ${header}
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        ${tableHead}
                    </thead>
                    <tbody>${rows}</tbody>
                    ${tableFoot}
                </table>
            </div>
            ${montor
                ? `<p style="font-size: 12px; color: var(--text-muted); margin-top: 15px;">Kilometer/kørsel registreres som materiale — vælg "Kørsel" i kataloget og indtast antal km.</p>`
                : `<p style="font-size: 12px; color: var(--text-muted); margin-top: 15px;">Udgifterne er allerede trukket fra sagens overskud. Salgssøjlen viser linjernes fakturerbare værdi (relevant ved forbrugssager).</p>`
            }
        </div>
    `;
}

// ===== v103: hjaelper - taeller en linje som timeforbrug? (Min Tid eller materiale 8000/8001) =====
function isTimeLine(l) {
    if (!l) return false;
    if (l.source === 'time_entry') return true;
    const num = String(l.material_number || '');
    return num === '8000' || num === '8001';
}
// v105.1: kundevenligt navn paa timelinjer (8000 = alm., 8001 = weekend/overarbejde)
function timeLineLabel(l) {
    const num = String((l && l.material_number) || '');
    let name = num === '8001' ? 'Montørtimer weekend/overarbejde' : num === '8000' ? 'Montørtimer alm.' : 'Timeregistrering';
    if (l && l.source === 'time_entry' && l.time_entry_date) {
        const d = new Date(l.time_entry_date);
        if (!isNaN(d)) name += ` (${d.toLocaleDateString('da-DK')})`;
    }
    return name;
}

// ===== v103: inline-gem af materialelinje (alooser rediger-modal) =====
async function saveInlineMaterialLine(orderId, lineId, input) {
    const row = input.closest('tr');
    if (!row) return;
    const get = f => row.querySelector(`[data-field="${f}"]`);
    const body = {
        notes: (get('notes')?.value || '').trim() || null,
        quantity: parseFloat(get('quantity')?.value),
        unit_cost: parseFloat(get('unit_cost')?.value),
        unit_sale: parseFloat(get('unit_sale')?.value),
        discount_percent: parseFloat(get('discount_percent')?.value) || 0
    };
    if (!body.quantity || body.quantity <= 0) {
        alert('Indtast et gyldigt antal.');
        return;
    }
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/orders/${orderId}/materials/${lineId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.details ? `${errData.error}: ${errData.details}` : (errData.error || 'Kunne ikke gemme ændringerne.'));
        }
        // Genindlaes workspace, saa regnskab, donut og tabeller opdateres
        await openOrderWorkspace(orderId);
        switchWorkspaceTab('materials');
    } catch (error) {
        alert('Fejl: ' + error.message);
    }
}

// ===== v83: Montor - registrer materiale (inkl. kilometer/koersel) paa sag =====
let registerMaterialsCache = [];
let selectedRegisterMaterial = null;

async function openRegisterMaterialModal() {
    const modal = document.createElement('div');
    modal.id = 'registerMaterialModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10001; display: flex; align-items: center; justify-content: center; overflow-y: auto;';

    modal.innerHTML = `
        <div style="background: var(--surface); border-radius: 10px; padding: 30px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto; margin: 20px;">
            <h2 style="margin: 0 0 20px 0;">Registrer Materiale</h2>
            <p style="color: var(--text-muted); margin: 0 0 20px 0;">Ordre #${currentWorkspaceOrder.order_number} — vælg et materiale fra kataloget, eller skriv det selv, hvis det ikke findes.</p>
            <form onsubmit="event.preventDefault(); saveRegisterMaterial(${currentWorkspaceOrder.id});">
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Søg materiale</label>
                    <input type="text" id="registerMaterialSearch" oninput="filterRegisterMaterials()" placeholder="Søg efter navn eller nummer..." style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                </div>
                <div id="registerMaterialList" style="max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: 5px; margin-bottom: 20px;"></div>
                <div style="margin-bottom: 20px; padding: 15px; background: var(--surface-muted); border-radius: 5px; border: 1px dashed var(--border);">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Kan du ikke finde materialet? Skriv det her</label>
                    <input type="text" id="registerMaterialFreeText" oninput="clearRegisterMaterialSelection()" placeholder="F.eks. Epoxy primer" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                </div>
                <div style="margin-bottom: 30px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Antal *</label>
                    <input type="number" id="registerMaterialQty" step="0.01" min="0.01" placeholder="F.eks. 500 (km) eller 10 (kg)" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="closeRegisterMaterialModal()" class="btn btn-secondary">Annuller</button>
                    <button type="submit" class="btn btn-primary">Registrer</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    await loadRegisterMaterials();
}

function closeRegisterMaterialModal() {
    const modal = document.getElementById('registerMaterialModal');
    if (modal) modal.remove();
    selectedRegisterMaterial = null;
    registerMaterialsCache = [];
}

async function loadRegisterMaterials() {
    const listEl = document.getElementById('registerMaterialList');
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/materials', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Kunne ikke hente materialekataloget');
        registerMaterialsCache = await response.json();
        renderRegisterMaterialList('');
    } catch (error) {
        console.error('[materials] Kunne ikke hente materialekatalog:', error);
        if (listEl) listEl.innerHTML = '<p style="padding: 15px; color: var(--danger);">Kunne ikke hente materialekataloget.</p>';
    }
}

function renderRegisterMaterialList(search) {
    const listEl = document.getElementById('registerMaterialList');
    if (!listEl) return;
    const term = (search || '').toLowerCase().trim();
    const items = registerMaterialsCache.filter(m =>
        !term || (m.name || '').toLowerCase().includes(term) || (m.material_number || '').toLowerCase().includes(term)
    );

    if (items.length === 0) {
        listEl.innerHTML = '<p style="padding: 15px; color: var(--text-muted);">Ingen materialer matcher søgningen.</p>';
        return;
    }

    listEl.innerHTML = items.map(m => `
        <div class="register-material-item" data-id="${m.id}" onclick="selectRegisterMaterial(${m.id})" style="padding: 10px 15px; border-bottom: 1px solid var(--border-soft); cursor: pointer;">
            <div style="font-weight: 600; font-size: 14px;">${m.name} <span style="color: var(--text-muted); font-weight: 400;">(${m.material_number || '-'})</span></div>
            <div style="font-size: 12px; color: var(--text-muted);">${m.category || ''} ${m.unit ? '• pr. ' + m.unit : ''}</div>
        </div>
    `).join('');
}

function filterRegisterMaterials() {
    const search = document.getElementById('registerMaterialSearch');
    renderRegisterMaterialList(search ? search.value : '');
}

function selectRegisterMaterial(id) {
    selectedRegisterMaterial = registerMaterialsCache.find(m => m.id === id) || null;
    document.querySelectorAll('.register-material-item').forEach(el => {
        el.style.background = Number(el.dataset.id) === id ? 'var(--surface-muted)' : '';
    });
    // Rydder fritekst, saa der ikke registreres to ting paa én linje
    const freeTextEl = document.getElementById('registerMaterialFreeText');
    if (freeTextEl) freeTextEl.value = '';
}

function clearRegisterMaterialSelection() {
    if (selectedRegisterMaterial) {
        selectedRegisterMaterial = null;
        document.querySelectorAll('.register-material-item').forEach(el => {
            el.style.background = '';
        });
    }
}

async function saveRegisterMaterial(orderId) {
    const qtyEl = document.getElementById('registerMaterialQty');
    const freeTextEl = document.getElementById('registerMaterialFreeText');
    const quantity = parseFloat(qtyEl ? qtyEl.value : '');
    const freeText = freeTextEl ? freeTextEl.value.trim() : '';

    if (!selectedRegisterMaterial && !freeText) {
        alert('Vælg et materiale fra listen — eller skriv materialet i fritekstfeltet.');
        return;
    }
    if (!quantity || quantity <= 0) {
        alert('Indtast et gyldigt antal (fx km eller kg).');
        return;
    }

    try {
        const token = sessionStorage.getItem('token');
        const body = selectedRegisterMaterial
            ? { material_id: selectedRegisterMaterial.id, quantity }
            : { description: freeText, quantity };
        const response = await fetch(`/api/orders/${orderId}/materials`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.details ? `${errData.error}: ${errData.details}` : (errData.error || 'Kunne ikke registrere materialet. Prøv igen.'));
        }
        closeRegisterMaterialModal();
        await openOrderWorkspace(orderId);
        switchWorkspaceTab('materials');
    } catch (error) {
        console.error('[materials] Kunne ikke registrere materiale:', error);
        alert(error.message || 'Kunne ikke registrere materialet. Prøv igen.');
    }
}

// Render timeline tab
function renderWorkspaceTimeline(container) {
    container.innerHTML = `
        <div style="background: var(--surface); padding: 30px; border-radius: 10px; border: 2px solid var(--border);">
            <h3 style="margin: 0 0 20px 0;">Timeline</h3>
            ${workspaceTimeline.length === 0 ? 
                '<p style="color: var(--text-muted); text-align: center; padding: 40px;">Ingen aktiviteter endnu</p>' :
                workspaceTimeline.map(entry => `
                    <div style="padding: 15px; border-left: 3px solid var(--color-accent-hover); margin-bottom: 15px; background: var(--surface-muted);">
                        <div style="font-weight: 600; margin-bottom: 5px;">${entry.description}</div>
                        <div style="font-size: 12px; color: var(--text-muted);">${entry.user_name} • ${convertUTCtoLocal(entry.created_at)}</div>
                    </div>
                `).join('')
            }
        </div>
    `;
}

// Render notes tab (placeholder)
function renderWorkspaceNotes(container) {
    container.innerHTML = `
        <div style="background: var(--surface); padding: 30px; border-radius: 10px; border: 2px solid var(--border);">
            <h3 style="margin: 0 0 20px 0;"> Noter</h3>
            <p style="color: var(--text-muted);">Noter funktionalitet kommer snart...</p>
        </div>
    `;
}

// Close workspace
async function closeWorkspace() {
    // If we have a parent order ID, navigate back to it instead of closing
    if (parentOrderId) {
        const tempParentId = parentOrderId;
        parentOrderId = null; // Clear before opening parent
        await openOrderWorkspace(tempParentId);
        return;
    }
    
    // Otherwise, close workspace and go to orders list
    currentWorkspaceOrder = null;
    parentOrderId = null;
    
    // Update URL to clear workspace state
    history.pushState(null, '', '#/orders');
    
    switchOrderTab('orders');
    loadOrders();
}

// Create extra work for an order
async function createExtraWork(parentOrderId) {
    const modal = document.createElement('div');
    modal.id = 'extraWorkModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10001; display: flex; align-items: center; justify-content: center; overflow-y: auto;';
    
    modal.innerHTML = `
        <div style="background: var(--surface); border-radius: 10px; padding: 30px; max-width: 1000px; width: 90%; max-height: 90vh; overflow-y: auto; margin: 20px;">
            <h2 style="margin: 0 0 20px 0; color: var(--color-orange);">Opret Ekstraarbejde</h2>
            <p style="color: var(--text-muted); margin-bottom: 30px;">Ekstraarbejde oprettes som en under-ordre knyttet til hoved-ordren.</p>
            
            <form id="extraWorkForm" onsubmit="event.preventDefault(); saveExtraWork(${parentOrderId});">
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Titel *</label>
                    <input type="text" id="extraWorkTitle" required placeholder="F.eks. Ekstra gulvbelægning i gang" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Sagstype *</label>
                    <div style="display: flex; gap: 25px; flex-wrap: wrap;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="radio" name="extraWorkOrderType" value="consumption" checked style="width: 16px; height: 16px;">
                            <span><strong>Forbrug</strong> <span style="color: var(--text-muted); font-size: 13px;">— på regning (materiale-salg tæller med)</span></span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="radio" name="extraWorkOrderType" value="calculation" style="width: 16px; height: 16px;">
                            <span><strong>Kalkulation</strong> <span style="color: var(--text-muted); font-size: 13px;">— aftalt pris (materialer = udgift)</span></span>
                        </label>
                    </div>
                </div>
                
                <div style="margin-bottom: 12px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Beskrivelse/Noter</label>
                    <textarea id="extraWorkNotes" rows="3" placeholder="Interne noter om ekstraarbejdet..." style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px; resize: vertical;"></textarea>
                </div>
                
                <div style="margin-bottom: 30px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">Arbejdslinjer</h3>
                        ${btn('secondary', 'plus', 'Tilføj Linje', { onclick: 'addExtraWorkLine()', small: true })}
                    </div>
                    <div id="extraWorkLinesContainer"></div>
                </div>
                
                <div style="background: var(--accent-soft); padding: 20px; border-radius: 8px; margin-bottom: 30px; border: 2px solid var(--color-orange);">
                    <div style="display: flex; justify-content: flex-end; gap: 15px; font-size: 16px;">
                        <div>
                            <strong>Subtotal:</strong> <span id="extraWorkSubtotal">0,00 kr.</span>
                        </div>
                        <div>
                            <strong>Moms (25%):</strong> <span id="extraWorkVat">0,00 kr.</span>
                        </div>
                        <div style="font-size: 20px; color: var(--color-orange);">
                            <strong>TOTAL:</strong> <span id="extraWorkTotal">0,00 kr.</span>
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="closeExtraWorkModal()" class="btn btn-secondary">
                        Annuller
                    </button>
                    <button type="button" class="btn btn-primary" onclick="saveExtraWorkSafe(${parentOrderId})">Opret Ekstraarbejde</button>
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

function renderExtraWorkLines() {
    const container = document.getElementById('extraWorkLinesContainer');
    
    if (!extraWorkLines || extraWorkLines.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Ingen linjer endnu. Klik "Tilføj Linje"</p>';
        return;
    }
    
    container.innerHTML = extraWorkLines.map((line, index) => `
        <div style="background: var(--surface-muted); padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 2px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <strong>Linje ${index + 1}</strong>
                ${btn('danger', 'x', 'Fjern', { onclick: `removeExtraWorkLine(${index})`, small: true, title: 'Fjern linje' })}
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Beskrivelse *</label>
                <textarea id="extraLineDesc${index}" rows="2" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px; resize: vertical;" onchange="updateExtraWorkLine(${index})">${line.description || ''}</textarea>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 2fr; gap: 10px;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Antal *</label>
                    <input type="number" id="extraLineQty${index}" value="${line.quantity || 1}" min="0" step="0.01" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px;" onchange="updateExtraWorkLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Enhed *</label>
                    <select id="extraLineUnit${index}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px;" onchange="updateExtraWorkLine(${index})">
                        ${UNITS.map(unit => `<option value="${unit}" ${line.unit === unit ? 'selected' : ''}>${unit}</option>`).join('')}
                    </select>
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">E.pris *</label>
                    <input type="number" id="extraLinePrice${index}" value="${line.unit_price || 0}" min="0" step="0.01" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px;" onchange="updateExtraWorkLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Rabat %</label>
                    <input type="number" id="extraLineDiscount${index}" value="${line.discount_percent || 0}" min="0" max="100" step="0.1" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px;" onchange="updateExtraWorkLine(${index})">
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-size: 13px; font-weight: 600;">Total</label>
                    <div id="extraLineTotal${index}" style="padding: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; font-size: 13px; font-weight: 600; color: var(--color-orange);">
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

// v106.4q: direkte knap-kald (undgaar form-submit der kan blokeres) + synlig fejlhaandtering
function saveExtraWorkSafe(parentOrderId) {
    try {
        saveExtraWork(parentOrderId);
    } catch (e) {
        console.error('saveExtraWork fejlede:', e);
        alert('Kunne ikke oprette ekstraarbejde: ' + e.message);
    }
}

async function saveExtraWork(parentOrderId) {
    const title = document.getElementById('extraWorkTitle').value.trim();
    const notes = document.getElementById('extraWorkNotes').value.trim();
    const orderTypeEl = document.querySelector('input[name="extraWorkOrderType"]:checked');
    const order_type = orderTypeEl ? orderTypeEl.value : 'consumption';
    
    if (!title) {
        alert('Indtast en titel');
        return;
    }
    
    // v96: En linje taeller kun med, hvis den har en beskrivelse (se quotes-core.js)
    const filledLines = (extraWorkLines || []).filter(line =>
        line.description && line.description.trim()
    );
    
    if (order_type === 'calculation' && filledLines.length === 0) {
        alert('Tilføj mindst én linje');
        return;
    }
    
    // Validate lines
    for (let i = 0; i < filledLines.length; i++) {
        const line = filledLines[i];
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
        order_type,
        lines: filledLines
    };
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${parentOrderId}/extra-work`, {
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
        alert(`Ekstraarbejde ${extraWork.full_order_number} oprettet!`);
        
        // Refresh parent workspace to show the new extra work
        await openOrderWorkspace(parentOrderId);
        
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

// --- WORK DESCRIPTION RICH TEXT EDITOR ---

let workDescQuill = null;

function toggleWorkDescriptionEdit() {
    // Show edit mode
    document.getElementById('workDescReadMode').style.display = 'none';
    document.getElementById('workDescEditMode').style.display = 'block';
    
    // Initialize Quill if not already
    if (!workDescQuill) {
        workDescQuill = new Quill('#workDescEditor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'color': [] }, { 'background': [] }],
                    ['clean']
                ]
            }
        });
    }
    
    // Load current content (HTML)
    const currentContent = currentWorkspaceOrder.work_description || '';
    workDescQuill.root.innerHTML = currentContent;
}

function cancelWorkDescriptionEdit() {
    // Hide edit mode, show read mode
    document.getElementById('workDescEditMode').style.display = 'none';
    document.getElementById('workDescReadMode').style.display = 'block';
}

async function saveWorkDescription() {
    const htmlContent = workDescQuill.root.innerHTML;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/orders/${currentWorkspaceOrder.id}/work-description`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ work_description: htmlContent })
        });
        
        if (!response.ok) throw new Error('Failed to save');
        
        // Update current order object
        currentWorkspaceOrder.work_description = htmlContent;
        
        // Update read mode display
        document.getElementById('workDescContent').innerHTML = htmlContent || '<em style="color: var(--text-muted);">Ingen beskrivelse...</em>';
        
        // Switch back to read mode
        cancelWorkDescriptionEdit();
        
        alert('Arbejdsbeskrivelse gemt!');
    } catch (error) {
        console.error('Save work description error:', error);
        alert('Kunne ikke gemme: ' + error.message);
    }
}

// --- ORDER DETAILS EDIT MODE ---

async function toggleOrderDetailsEdit() {
    // Show edit mode
    document.getElementById('orderDetailsReadMode').style.display = 'none';
    document.getElementById('orderDetailsEditMode').style.display = 'block';
    
    // Load contact persons for dropdown
    await loadOrderDetailsContactPersons();
}

async function loadOrderDetailsContactPersons() {
    const customerId = currentWorkspaceOrder.customer_id;
    const contactSelect = document.getElementById('orderDetailsContactSelect');
    
    if (!contactSelect || !customerId) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/customers/${customerId}/contacts`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load contacts');
        
        const contacts = await response.json();
        
        // Populate dropdown
        contactSelect.innerHTML = '<option value="">Vælg kontaktperson...</option>';
        contacts.forEach(contact => {
            const option = document.createElement('option');
            option.value = contact.id;
            option.textContent = contact.name + (contact.title ? ` - ${contact.title}` : '');
            option.setAttribute('data-phone', contact.phone || '');
            option.setAttribute('data-email', contact.email || '');
            if (contact.is_primary) {
                option.textContent += '  (primær)';
            }
            contactSelect.appendChild(option);
        });
        
        // Select current contact if set
        if (currentWorkspaceOrder.contact_person_id) {
            contactSelect.value = currentWorkspaceOrder.contact_person_id;
        }
        
    } catch (error) {
        console.error('Error loading contacts:', error);
        alert('Kunne ikke indlæse kontaktpersoner: ' + error.message);
    }
}

function cancelOrderDetailsEdit() {
    // Hide edit mode, show read mode
    document.getElementById('orderDetailsEditMode').style.display = 'none';
    document.getElementById('orderDetailsReadMode').style.display = 'block';
}

async function saveOrderDetails() {
    const contactPersonId = document.getElementById('orderDetailsContactSelect').value;
    const orderAddress = document.getElementById('orderDetailsAddressInput').value.trim();
    const orderPostalCode = document.getElementById('orderDetailsPostalInput').value.trim();
    const orderCity = document.getElementById('orderDetailsCityInput').value.trim();
    const orderTypeEl = document.querySelector('input[name="orderDetailsOrderType"]:checked');
    const order_type = orderTypeEl ? orderTypeEl.value : (currentWorkspaceOrder.order_type || 'consumption');
    
    const data = {
        contact_person_id: contactPersonId ? parseInt(contactPersonId) : null,
        order_address: orderAddress || null,
        order_postal_code: orderPostalCode || null,
        order_city: orderCity || null,
        order_type
    };
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/orders/${currentWorkspaceOrder.id}/details`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) throw new Error('Failed to save');
        
        alert('Ordre detaljer opdateret!');
        
        // Refresh workspace to show updated data
        await openOrderWorkspace(currentWorkspaceOrder.id);
        
    } catch (error) {
        console.error('Save order details error:', error);
        alert('Kunne ikke gemme: ' + error.message);
    }
}

// Restore workspace from URL hash on page load
function restoreWorkspaceFromURL() {
    const hash = window.location.hash;
    
    // ONLY restore workspace if hash matches workspace pattern
    // Don't interfere with normal page navigation (e.g., #files, #chat, etc.)
    const match = hash.match(/^#\/orders\/(\d+)\/workspace$/);
    if (match) {
        const orderId = parseInt(match[1]);
        console.log('Restoring workspace for order:', orderId);
        openOrderWorkspace(orderId);
    }
    // If hash doesn't match workspace pattern, do nothing (let dashboard.js handle it)
}

// Call on page load ONLY if we have a workspace URL
// This prevents interfering with other pages
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const hash = window.location.hash;
        
        // ONLY restore if hash is EXPLICITLY a workspace URL
        // Don't restore based on currentPage to avoid interfering with other pages
        if (hash.startsWith('#/orders/') && hash.includes('/workspace')) {
            setTimeout(restoreWorkspaceFromURL, 100);
        }
    });
} else {
    const hash = window.location.hash;
    
    // ONLY restore if hash is EXPLICITLY a workspace URL
    if (hash.startsWith('#/orders/') && hash.includes('/workspace')) {
        setTimeout(restoreWorkspaceFromURL, 100);
    }
}

// Ordre-stepper: viser arbejdsstatus Godkendt → Igangværende → Afsluttet → Faktureret
// v106.6d: kun AKTUEL status er farvet m. ikon; oevrige er neutrale graa uden ikon
function renderStageStepper(order) {
    const steps = [
        { key: 'approved', icon: 'check-circle-2', label: 'Godkendt' },
        { key: 'in_progress', icon: 'loader', label: 'Igangværende' },
        { key: 'completed', icon: 'check', label: 'Afsluttet' },
        { key: 'invoiced', icon: 'receipt', label: 'Faktureret' }
    ];

    // v106.6d: 0 = godkendt, 1 = igangværende, 2 = afsluttet, 3 = faktureret
    let current = 0;
    if (order.order_stage === 'in_progress') current = 1;
    if (order.has_approved_invoice) current = 3;
    if (order.order_stage === 'completed') current = 2;

    let html = '<div class="order-stepper">';
    steps.forEach((step, i) => {
        if (i === current) {
            html += `<div class="order-stepper-step current"><i data-lucide="${step.icon}"></i> ${step.label}</div>`;
        } else {
            html += `<div class="order-stepper-step muted">${step.label}</div>`;
        }
        if (i < steps.length - 1) {
            html += '<div class="order-stepper-line"></div>';
        }
    });
    html += '</div>';
    return html;
}

// Status-badge for ordre: viser arbejdsstatus (Faktureret/Igangværende) eller quote-status
function getStageBadge(order) {
    // v106.6c: Afsluttet overstiger alt andet
    if (order.order_stage === 'completed') {
        return '<div style="font-weight: 600; font-size: 14px; color: var(--color-green);">Afsluttet</div>';
    }
    if (order.has_approved_invoice) {
        return '<div style="font-weight: 600; font-size: 14px; color: var(--color-green);">Faktureret</div>';
    }
    if (order.order_stage === 'in_progress') {
        return '<div style="font-weight: 600; font-size: 14px; color: #1E40AF;">Igangværende</div>';
    }
    return getStatusBadge(order.status);
}

// Helper function to get status badge HTML
function getStatusBadge(status) {
    const statusConfig = {
        'draft': { icon: '', text: 'Udkast', color: 'var(--text-muted)' },
        'sent': { icon: '', text: 'Sendt', color: 'var(--color-blue)' },
        'accepted': { icon: '', text: 'Accepteret', color: 'var(--color-green)' },
        'rejected': { icon: '', text: 'Afvist', color: 'var(--color-red)' }
    };
    
    const config = statusConfig[status] || statusConfig['draft'];
    return `<div style="font-weight: 600; font-size: 14px; color: ${config.color};">${config.icon} ${config.text}</div>`;
}

// View original quote from workspace
async function viewOriginalQuote(orderId) {
    const previewBox = document.getElementById('wsInvoicePreview');
    try {
        // v106.6i: cache-buster + retry (Render cold-start)
        const token = sessionStorage.getItem('token');
        const response = await sgFetchWithRetry(`/api/quotes/${orderId}?_=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load quote (HTTP ' + response.status + ')');

        const quote = await response.json();
        console.log('viewOriginalQuote: ordre hentet', { id: quote.id, status: quote.status, is_order: quote.is_order });

        // v105: det her er nu ORDRen - linjerne kommer fra ordrens timer/materialer
        // (inkl. rabat), ikke fra det oprindelige tilbud.
        const mats = workspaceMaterials || [];
        quote.lines = mats.map(l => ({
            description: isTimeLine(l) ? timeLineLabel(l) : (l.notes || l.material_name || 'Materiale'),
            quantity: parseFloat(l.quantity) || 0,
            unit: isTimeLine(l) ? 't' : (l.unit || 'stk'),
            unit_price: parseFloat(l.unit_sale) || 0,
            discount_percent: parseFloat(l.discount_percent) || 0,
            line_total: parseFloat(l.total_sale) || 0
        }));
        quote.is_order_view = true;
        currentQuote = quote;

        // Call the renderQuotePreview function from quotes-core.js
        // v106.4q: robust - brug window-referencen hvis den globale binding ikke er tilgaengelig
        // v106.6b: render INLINE i workspace' wsInvoicePreview (man forbliver i workspacet) -
        // fallback til det separate view hvis boksen ikke findes.
        // v106.6i: fejl vises nu INDENI boksen (ikke kun alert) og logges detaljeret,
        // saa en tom boks altid kan fejlsoeges via konsollen.
        const renderFn = (typeof renderQuotePreview === 'function')
            ? renderQuotePreview
            : (typeof window.renderQuotePreview === 'function' ? window.renderQuotePreview : null);
        const showRenderError = (box, err) => {
            console.error('renderQuotePreview fejlede:', err);
            if (box) box.innerHTML = `<div style="margin-top:20px;padding:24px;border:1px solid var(--color-red);border-radius:8px;color:var(--color-red);">Kunne ikke vise ordre: ${err.message}<br><small>Se konsollen (F12) for detaljer - og proev genindlaesning (Ctrl+Shift+R).</small></div>`;
            else alert('Kunne ikke vise ordre: ' + err.message);
        };
        if (renderFn && previewBox) {
            try {
                window.currentPreviewInvoice = null; // undgaa at faktura-luk roder med ordredata
                renderFn(previewBox);
                previewBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (renderError) {
                showRenderError(previewBox, renderError);
            }
        } else if (renderFn) {
            try {
                renderFn();
            } catch (renderError) {
                showRenderError(previewBox, renderError);
            }
        } else {
            showRenderError(previewBox, new Error('render-funktion mangler'));
        }

    } catch (error) {
        console.error('Error viewing original quote:', error);
        // v106.6i: vis fejlen i boksen frem for kun en alert, saa den tomme boks
        // aldrig opstaar uden forklaring.
        if (previewBox) {
            previewBox.innerHTML = `<div style="margin-top:20px;padding:24px;border:1px solid var(--color-red);border-radius:8px;color:var(--color-red);">Kunne ikke hente ordren: ${error.message}<br><small>Proev igen om et oejeblik (serveren kan vaere ved at starte op) - detaljer i konsollen (F12).</small></div>`;
            previewBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            alert('Kunne ikke vise tilbud: ' + error.message);
        }
    }
}

// Export functions
window.openOrderWorkspace = openOrderWorkspace;
window.switchWorkspaceTab = switchWorkspaceTab;
window.openRegisterMaterialModal = openRegisterMaterialModal;
window.closeRegisterMaterialModal = closeRegisterMaterialModal;
window.filterRegisterMaterials = filterRegisterMaterials;
window.selectRegisterMaterial = selectRegisterMaterial;
window.clearRegisterMaterialSelection = clearRegisterMaterialSelection;
window.saveInlineMaterialLine = saveInlineMaterialLine;
window.moveMaterialLine = moveMaterialLine;

// v106.2: flyt linje op/ned og gem roekkefoelgen
async function moveMaterialLine(orderId, lineId, direction) {
    const ids = workspaceMaterials.map(l => l.id);
    const idx = ids.indexOf(lineId);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= ids.length) return;
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    try {
        const res = await fetch(`${API_URL}/api/orders/${orderId}/materials/reorder`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: ids })
        });
        if (!res.ok) throw new Error('Kunne ikke gemme roekkefoelgen');
        await openOrderWorkspace(orderId);
        switchWorkspaceTab('materials');
    } catch (e) {
        alert(e.message || 'Fejl ved flytning af linje');
    }
}
// v106.1: nulstil SPA-tilstand naar man forlader Ordrestyring - pageLoader tømmer
// DOM'et, men JS-variablerne bestaar og laaser ellers faneskift i switchOrderTab.
window.resetQuotesNavState = function () {
    currentWorkspaceOrder = null;
    parentOrderId = null;
    currentWorkspaceInvoice = null;
        workspaceInvoices = [];
};
window.saveRegisterMaterial = saveRegisterMaterial;
window.closeWorkspace = closeWorkspace;
window.showWorkspaceInvoicePreview = showWorkspaceInvoicePreview;
window.closeWorkspaceInvoicePreview = closeWorkspaceInvoicePreview;
window.refreshWorkspaceInvoicePreview = refreshWorkspaceInvoicePreview;
window.refreshWorkspaceInvoicesFromServer = refreshWorkspaceInvoicesFromServer;
window.toggleWorkspaceInvoices = toggleWorkspaceInvoices;
window.viewOriginalQuote = viewOriginalQuote;
window.showAddExpense = showAddExpense;
window.closeExpenseModal = closeExpenseModal;
window.saveExpense = saveExpense;
window.editExpense = editExpense;
window.updateExpense = updateExpense;
window.deleteExpense = deleteExpense;
window.showUploadDocument = showUploadDocument;
window.closeDocumentModal = closeDocumentModal;
window.uploadDocument = uploadDocument;
window.previewDocument = previewDocument;
// v106.6g: synligheds-knap paa dokumenter (kun ledelsen)
window.toggleDocumentVisibility = toggleDocumentVisibility;
window.closePreviewModal = closePreviewModal;
window.downloadDocument = downloadDocument;
window.deleteDocument = deleteDocument;
window.createExtraWork = createExtraWork;
window.addExtraWorkLine = addExtraWorkLine;
window.removeExtraWorkLine = removeExtraWorkLine;
window.updateExtraWorkLine = updateExtraWorkLine;
window.closeExtraWorkModal = closeExtraWorkModal;
window.toggleWorkDescriptionEdit = toggleWorkDescriptionEdit;
window.cancelWorkDescriptionEdit = cancelWorkDescriptionEdit;
window.saveWorkDescription = saveWorkDescription;
window.toggleOrderDetailsEdit = toggleOrderDetailsEdit;
window.cancelOrderDetailsEdit = cancelOrderDetailsEdit;
window.saveOrderDetails = saveOrderDetails;
window.getStatusBadge = getStatusBadge;
window.getStageBadge = getStageBadge;
window.renderStageStepper = renderStageStepper;
window.filterMaterialSearch = filterMaterialSearch;
window.selectExpenseMaterial = selectExpenseMaterial;
window.recalcExpenseAmount = recalcExpenseAmount;
window.clearExpenseMaterialLink = clearExpenseMaterialLink;
