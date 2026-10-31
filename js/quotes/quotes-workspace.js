// js/quotes/quotes-workspace.js - Order workspace management

let currentWorkspaceOrder = null;
let currentWorkspaceInvoice = null;
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
    
    // Show orders tab (reuse for workspace)
    const ordersTab = document.getElementById('orderTabOrders');
    if (ordersTab) {
        ordersTab.style.display = 'block';
    }
    
    // Update tab buttons — styres KUN af .active-klassen (gul understregning)
    const tabs = ['quotes', 'orders', 'invoiced', 'rejected', 'customers'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (btn) {
            btn.classList.toggle('active', t === 'orders');
        }
    });
    
    const container = document.getElementById('ordersContainer');
    // BUG FIX: Guard clause - only render if container exists
    if (!container) {
        console.warn('ordersContainer not found, cannot render workspace');
        return;
    }
    
    const fullOrderNumber = data.order.is_extra_work && data.order.parent_order_id 
        ? `${data.order.order_number}-${String(data.order.sub_number).padStart(2, '0')}`
        : data.order.order_number;
    
    container.innerHTML = `
        <div style="max-width: 1400px; margin: 0 auto;">
            <!-- Ordre-stepper: Godkendt → Igangværende → Faktureret -->
            ${renderStageStepper(data.order)}
            <!-- Back button -->
            <div style="margin-bottom: 20px;">
                <button onclick="closeWorkspace()" class="btn-secondary" style="min-height: 40px;">
                    ← Tilbage til Ordrer
                </button>
            </div>
            
            <!-- Workspace Header (hvid med KPI-kort) -->
            <div class="card" style="padding: 24px 28px; margin-bottom: 24px; display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; align-items: center;">
                <div style="min-width: 220px;">
                    <h1 style="margin: 0 0 6px 0;">Ordre ${fullOrderNumber}</h1>
                    <p style="margin: 0; color: var(--color-text-muted);">${data.order.title} • ${data.order.company_name}</p>
                </div>
                <div class="kpi-grid" style="flex: 1 1 420px; min-width: 0;">
                    <div class="kpi-card">
                        <div class="kpi-label">Omsætning</div>
                        <div class="kpi-value">${formatCurrency(data.financials.revenue)}</div>
                    </div>
                    <div class="kpi-card kpi-red">
                        <div class="kpi-label">Udgifter</div>
                        <div class="kpi-value">${formatCurrency(data.financials.expenses)}</div>
                    </div>
                    <div class="kpi-card kpi-green">
                        <div class="kpi-label">Profit</div>
                        <div class="kpi-value">${formatCurrency(data.financials.profit)}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Margin</div>
                        <div class="kpi-value">${data.financials.profit_margin}%</div>
                        <div class="kpi-sub">Profit af omsætning</div>
                    </div>
                </div>
            </div>
            
            <!-- Tabs (underline-stil) -->
            <div class="tab-underline" style="margin-bottom: 28px;">
                <button onclick="switchWorkspaceTab('overview')" id="workspaceTabOverview" class="tab-underline-btn active">Oversigt</button>
                <button onclick="switchWorkspaceTab('expenses')" id="workspaceTabExpenses" class="tab-underline-btn">Udgifter (${workspaceExpenses.length})</button>
                <button onclick="switchWorkspaceTab('materials')" id="workspaceTabMaterials" class="tab-underline-btn">Timer & Materialer (${workspaceMaterials.length})</button>
                <button onclick="switchWorkspaceTab('documents')" id="workspaceTabDocuments" class="tab-underline-btn">Dokumenter (${workspaceDocuments.length})</button>
                <button onclick="switchWorkspaceTab('timeline')" id="workspaceTabTimeline" class="tab-underline-btn">Timeline (${workspaceTimeline.length})</button>
                <button onclick="switchWorkspaceTab('notes')" id="workspaceTabNotes" class="tab-underline-btn">Noter (${workspaceNotes.length})</button>
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
    } else if (tab === 'expenses') {
        renderWorkspaceExpenses(content);
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

// Render overview tab with pie chart
function renderWorkspaceOverview(container) {
    // Use aggregated financials from backend (includes main order + extra work)
    const revenue = workspaceFinancials ? workspaceFinancials.revenue : (currentWorkspaceOrder.total || 0);
    const totalExpenses = workspaceFinancials ? workspaceFinancials.expenses : workspaceExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const profit = workspaceFinancials ? workspaceFinancials.profit : (revenue - totalExpenses);
    const profitMargin = workspaceFinancials ? workspaceFinancials.profit_margin : (revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0);
    
    // Check if we have extra work (split stats available)
    const hasExtraWork = workspaceExtraWorkOrders && workspaceExtraWorkOrders.length > 0;
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
            <!-- Left column: Stats and Chart -->
            <div style="display: flex; flex-direction: column; gap: 30px;">
                ${hasExtraWork ? `
                    <!-- Split Statistics Cards -->
                    <div style="background: var(--surface); padding: 25px; border-radius: 10px; border: 2px solid var(--border); margin: 0 0 30px 0; min-height: 500px;">
                        <h3 style="margin: 0 0 20px 0; color: var(--text);">Opdelt Statistik</h3>
                        
                        <!-- Revenue -->
                        <div style="margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div style="font-weight: 600; font-size: 16px;">Omsætning</div>
                                <div style="font-size: 20px; font-weight: 600; color: var(--color-accent-hover);">${formatCurrency(workspaceFinancials.revenue)}</div>
                            </div>
                            <div style="padding-left: 25px; font-size: 14px; color: var(--text-muted);">
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
                        
                        <div style="border-top: 1px solid var(--border); margin: 20px 0;"></div>
                        
                        <!-- Expenses -->
                        <div style="margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div style="font-weight: 600; font-size: 16px;">Udgifter</div>
                                <div style="font-size: 20px; font-weight: 600; color: var(--color-red);">${formatCurrency(workspaceFinancials.expenses)}</div>
                            </div>
                            <div style="padding-left: 25px; font-size: 14px; color: var(--text-muted);">
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
                        
                        <div style="border-top: 1px solid var(--border); margin: 20px 0;"></div>
                        
                        <!-- Profit -->
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div style="font-weight: 600; font-size: 16px;">Profit</div>
                                <div style="font-size: 20px; font-weight: 600; color: ${profit >= 0 ? 'var(--color-green)' : 'var(--color-red)'};">${formatCurrency(workspaceFinancials.profit)} (${profitMargin}%)</div>
                            </div>
                            <div style="padding-left: 25px; font-size: 14px; color: var(--text-muted);">
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
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 0 0 30px 0;">
                        <div style="background: var(--surface); padding: 20px; border-radius: 10px; border: 2px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 14px; margin-bottom: 5px;">Omsætning</div>
                            <div style="font-size: 28px; font-weight: 600; color: var(--color-accent-hover);">${formatCurrency(revenue)}</div>
                        </div>
                        <div style="background: var(--surface); padding: 20px; border-radius: 10px; border: 2px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 14px; margin-bottom: 5px;">Udgifter</div>
                            <div style="font-size: 28px; font-weight: 600; color: var(--color-red);">${formatCurrency(totalExpenses)}</div>
                        </div>
                        <div style="background: var(--surface); padding: 20px; border-radius: 10px; border: 2px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 14px; margin-bottom: 5px;">Profit</div>
                            <div style="font-size: 28px; font-weight: 600; color: ${profit >= 0 ? 'var(--color-green)' : 'var(--color-red)'};">${formatCurrency(profit)}</div>
                        </div>
                        <div style="background: var(--surface); padding: 20px; border-radius: 10px; border: 2px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 14px; margin-bottom: 5px;">Margin</div>
                            <div style="font-size: 28px; font-weight: 600; color: ${profit >= 0 ? 'var(--color-green)' : 'var(--color-red)'};">${revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0}%</div>
                        </div>
                    </div>
                `}
                
                <!-- Ordre Detaljer (NEW - replaces Profit Chart) -->
                <div style="background: var(--surface); padding: 20px; border-radius: 10px; border: 2px solid var(--border); margin: 0; min-height: 250px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">Ordre Detaljer</h3>
                        <button id="orderDetailsEditBtn" onclick="toggleOrderDetailsEdit()" class="btn btn-primary btn-sm">
                            Rediger
                        </button>
                    </div>
                    
                    <!-- Read Mode -->
                    <div id="orderDetailsReadMode" style="display: grid; gap: 15px;">
                        <div style="padding-bottom: 15px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Kontaktperson</div>
                            <div id="orderDetailsContactName" style="font-weight: 600; font-size: 16px;">${currentWorkspaceOrder.contact_person_name || currentWorkspaceOrder.contact_person || 'Ikke angivet'}</div>
                        </div>
                        <div style="padding-bottom: 15px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Telefon</div>
                            <div id="orderDetailsPhone" style="font-weight: 600; font-size: 16px;">${currentWorkspaceOrder.contact_person_phone || currentWorkspaceOrder.customer_phone || 'Ikke angivet'}</div>
                        </div>
                        <div style="padding-bottom: 15px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Email</div>
                            <div id="orderDetailsEmail" style="font-weight: 600; font-size: 16px;">${currentWorkspaceOrder.contact_person_email || currentWorkspaceOrder.customer_email || 'Ikke angivet'}</div>
                        </div>
                        <div>
                            <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Ordre Adresse</div>
                            <div id="orderDetailsAddress" style="font-weight: 600; font-size: 16px;">
                                ${currentWorkspaceOrder.order_address || currentWorkspaceOrder.address || 'Ikke angivet'}<br>
                                ${currentWorkspaceOrder.order_postal_code || currentWorkspaceOrder.postal_code || ''} ${currentWorkspaceOrder.order_city || currentWorkspaceOrder.city || ''}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Edit Mode (hidden) -->
                    <div id="orderDetailsEditMode" style="display: none;">
                        <div style="display: grid; gap: 15px;">
                            <div>
                                <label style="display: block; color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Kontaktperson</label>
                                <select id="orderDetailsContactSelect" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                                    <option value="">Vælg kontaktperson...</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Ordre Adresse</label>
                                <input type="text" id="orderDetailsAddressInput" value="${currentWorkspaceOrder.order_address || currentWorkspaceOrder.address || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 10px;">
                                <div>
                                    <label style="display: block; color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Postnummer</label>
                                    <input type="text" id="orderDetailsPostalInput" value="${currentWorkspaceOrder.order_postal_code || currentWorkspaceOrder.postal_code || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                                </div>
                                <div>
                                    <label style="display: block; color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">By</label>
                                    <input type="text" id="orderDetailsCityInput" value="${currentWorkspaceOrder.order_city || currentWorkspaceOrder.city || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end;">
                            <button onclick="cancelOrderDetailsEdit()" class="btn btn-secondary btn-sm">
                                Annuller
                            </button>
                            <button onclick="saveOrderDetails()" style="padding: 8px 16px; background: var(--color-green); color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 13px;">
                                Gem
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Right column: Quick info -->
            <div style="display: flex; flex-direction: column; gap: 30px;">
                <div style="background: var(--surface); padding: 25px; border-radius: 10px; border: 2px solid var(--border); flex: 1;">
                    <h3 style="margin: 0 0 20px 0;">Kunde Information</h3>
                    <div style="display: grid; gap: 15px;">
                        <div style="padding-bottom: 15px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Ordre Nummer</div>
                            <div style="font-weight: 600; font-size: 16px;">${currentWorkspaceOrder.order_number}</div>
                        </div>
                        <div style="padding-bottom: 15px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Firma</div>
                            <div style="font-weight: 600; font-size: 16px;">${currentWorkspaceOrder.company_name}</div>
                        </div>
                        ${currentWorkspaceOrder.cvr_number || currentWorkspaceOrder.customer_cvr ? `
                        <div style="padding-bottom: 15px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">CVR Nummer</div>
                            <div style="font-weight: 600; font-size: 16px;">${currentWorkspaceOrder.cvr_number || currentWorkspaceOrder.customer_cvr}</div>
                        </div>
                        ` : ''}
                        <div style="padding-bottom: 15px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Status</div>
                            ${getStageBadge(currentWorkspaceOrder)}
                        </div>
                        ${currentWorkspaceOrder.accepted_at ? `
                        <div style="padding-bottom: 15px; border-bottom: 1px solid var(--border);">
                            <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Accepteret</div>
                            <div style="font-weight: 600; font-size: 16px;">${new Date(currentWorkspaceOrder.accepted_at).toLocaleDateString('da-DK')}</div>
                        </div>
                        ` : ''}
                        <div>
                            <div style="color: var(--text-muted); font-size: 13px; margin-bottom: 5px;">Oprettet af</div>
                            <div style="font-weight: 600; font-size: 16px;">${currentWorkspaceOrder.created_by_name}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Quick actions: ens hvide knapper i grid -->
                <div class="quick-actions-card">
                    <h3 style="margin: 0 0 15px 0; display: flex; align-items: center; gap: 8px;"><i data-lucide="zap"></i> Hurtige Handlinger</h3>
                    <div class="quick-actions-grid">
                        <button onclick="viewOriginalQuote(${currentWorkspaceOrder.id})" class="quick-action-btn">
                            <i data-lucide="file-text"></i> Se Tilbud (PDF)
                        </button>
                        <button onclick="switchWorkspaceTab('expenses')" class="quick-action-btn">
                            <i data-lucide="plus"></i> Tilføj Udgift
                        </button>
                        <button onclick="switchWorkspaceTab('documents')" class="quick-action-btn">
                            <i data-lucide="paperclip"></i> Upload Dokument
                        </button>
                        <button onclick="switchWorkspaceTab('notes')" class="quick-action-btn">
                            <i data-lucide="sticky-note"></i> Tilføj Note
                        </button>
                        ${renderInvoiceButton()}
                        <button onclick="createExtraWork(${currentWorkspaceOrder.id})" class="quick-action-btn accent-orange">
                            <i data-lucide="hammer"></i> Ekstraarbejde
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Arbejdsbeskrivelse Section (Full Width) -->
        <div style="background: var(--surface); padding: 30px; border-radius: 10px; border: 2px solid var(--border); margin-top: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
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
                    <button onclick="saveWorkDescription()" style="padding: 10px 20px; background: var(--color-green); color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Gem
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Extra Work Orders Section -->
        ${workspaceExtraWorkOrders && workspaceExtraWorkOrders.length > 0 ? `
            <div style="margin-top: 30px;">
                <div style="background: var(--surface); padding: 30px; border-radius: 10px; border: 2px solid var(--color-orange);">
                    <h3 style="margin: 0 0 20px 0; color: var(--color-orange);">Ekstraarbejde (${workspaceExtraWorkOrders.length})</h3>
                    <div style="display: grid; gap: 15px;">
                        ${workspaceExtraWorkOrders.map(extraOrder => `
                            <div style="background: var(--accent-soft); padding: 20px; border-radius: 8px; border: 1px solid var(--color-orange);">
                                <div style="display: flex; justify-content: space-between; align-items: start;">
                                    <div style="flex: 1;">
                                        <h4 style="margin: 0 0 10px 0; color: var(--color-orange);">Ordre ${extraOrder.full_order_number}</h4>
                                        <p style="margin: 5px 0;"><strong>Titel:</strong> ${extraOrder.title}</p>
                                        <p style="margin: 5px 0;"><strong>Total:</strong> ${formatCurrency(extraOrder.total)}</p>
                                        <p style="margin: 5px 0; font-size: 12px; color: var(--text-muted);">Oprettet: ${new Date(extraOrder.created_at).toLocaleDateString('da-DK')}</p>
                                    </div>
                                    <button onclick="openOrderWorkspace(${extraOrder.id}, ${currentWorkspaceOrder.id})" style="padding: 10px 20px; background: var(--color-orange); color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                                        Åbn
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        ` : ''}
    `;
    
}

// Render invoice button based on invoice status
function renderInvoiceButton() {
    if (currentWorkspaceInvoice) {
        // Invoice exists - show "See Invoice" button
        return `
            <button onclick=\"viewInvoiceFromWorkspace(${currentWorkspaceInvoice.id})\" style=\"padding: 12px 20px; background: var(--color-blue); color: white; border: none; border-radius: 5px; cursor: pointer; text-align: left;\">
                Se Faktura ${currentWorkspaceInvoice.invoice_number}
            </button>
        `;
    } else {
        // No invoice - show "Create Invoice" button
        return `
            <button onclick=\"createInvoiceFromOrder(${currentWorkspaceOrder.id})\" style=\"padding: 12px 20px; background: var(--color-green); color: white; border: none; border-radius: 5px; cursor: pointer; text-align: left;\">
                Opret Faktura
            </button>
        `;
    }
}

// View invoice from workspace (closes workspace first)
async function viewInvoiceFromWorkspace(invoiceId) {
    // Close workspace
    currentWorkspaceOrder = null;
    parentOrderId = null;
    
    // Switch to invoiced tab
    switchOrderTab('invoiced');
    
    // Small delay to ensure tab is loaded
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Now view the invoice
    viewInvoice(invoiceId);
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
                            <button onclick="deleteExpense(${exp.id})" style="padding: 6px 12px; background: var(--color-red); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                Slet
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
        <div style="background: var(--surface); border-radius: 10px; padding: 30px; max-width: 600px; width: 90%;">
            <h2 style="margin: 0 0 20px 0;">Tilføj Udgift</h2>
            
            <form id="expenseForm" onsubmit="event.preventDefault(); saveExpense();">
                <div style="margin-bottom: 20px; padding: 15px; background: var(--surface-muted); border: 1px solid var(--border); border-radius: 8px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Træk fra materiale-database <span style="font-weight: 400; color: var(--text-muted);">(valgfrit — søg på nr. eller navn, fx "8000")</span></label>
                    <input type="text" id="expenseMaterialSearch" autocomplete="off" placeholder="Søg materiale..." oninput="filterMaterialSearch(this.value)" onfocus="filterMaterialSearch(this.value)" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px; background: var(--surface);">
                    <div id="expenseMaterialResults" style="display: none; max-height: 220px; overflow-y: auto; border: 1px solid var(--border); border-radius: 5px; margin-top: 5px; background: var(--surface);"></div>
                    <div id="expenseMaterialSelected" style="display: none; margin-top: 10px; padding: 10px; background: var(--accent-soft); border-radius: 5px; font-size: 13px;"></div>
                </div>

                <div style="margin-bottom: 20px;">
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
                <div style="margin-bottom: 20px;">
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
                    Upload Dokument
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
        <div style="display: grid; gap: 15px;">
            ${workspaceDocuments.map(doc => {
                const icon = getDocumentIcon(doc.original_name);
                const size = formatFileSize(doc.file_size);
                const date = new Date(doc.created_at).toLocaleDateString('da-DK');
                
                return `
                    <div style="background: var(--surface-muted); padding: 20px; border-radius: 8px; border: 2px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                            <div style="font-size: 32px;">${icon}</div>
                            <div style="flex: 1;">
                                <div style="font-weight: 600; margin-bottom: 5px;">${doc.original_name}</div>
                                <div style="font-size: 13px; color: var(--text-muted);">
                                    ${size} • ${doc.document_type || 'Dokument'} • Uploadet af ${doc.uploaded_by_name} • ${date}
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button onclick="previewDocument(${doc.id}, '${doc.original_name.replace(/'/g, "\\'")}')" style="padding: 8px 16px; background: var(--color-blue); color: white; border: none; border-radius: 5px; cursor: pointer;">
                                Preview
                            </button>
                            <button onclick="downloadDocument(${doc.id}, '${doc.original_name.replace(/'/g, "\\'")}')" class="btn btn-primary btn-sm">
                                Download
                            </button>
                            <button onclick="deleteDocument(${doc.id})" style="padding: 8px 16px; background: var(--color-red); color: white; border: none; border-radius: 5px; cursor: pointer;">
                                Slet
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
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
                <div style="margin-bottom: 20px;">
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
        
        const document = await response.json();
        workspaceDocuments.unshift(document);
        
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

// Preview document
async function previewDocument(documentId, filename) {
    try {
        const doc = workspaceDocuments.find(d => d.id === documentId);
        if (!doc) {
            alert('Dokument ikke fundet');
            return;
        }
        
        const ext = filename.split('.').pop().toLowerCase();
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
        const pdfExtensions = ['pdf'];
        
        // Debug logging
        console.log('Preview document:', doc);
        console.log('File path from DB:', doc.file_path);
        
        // Ensure file_path starts with /
        const filePath = doc.file_path.startsWith('/') ? doc.file_path : '/' + doc.file_path;
        const fileUrl = `${filePath}`;
        
        console.log('Constructed file URL:', fileUrl);
        
        if (imageExtensions.includes(ext)) {
            // Show image in modal
            const modal = document.createElement('div');
            modal.id = 'documentPreviewModal';
            modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 10001; display: flex; align-items: center; justify-content: center; cursor: pointer;';
            
            modal.innerHTML = `
                <div style="position: relative; max-width: 90%; max-height: 90%; padding: 20px;">
                    <div style="position: absolute; top: 10px; right: 10px; background: var(--surface); padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: 600;" onclick="closePreviewModal()">
                        Luk
                    </div>
                    <img src="${fileUrl}" alt="${filename}" style="max-width: 100%; max-height: 85vh; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                    <div style="text-align: center; color: white; margin-top: 20px; font-size: 18px;">
                        ${filename}
                    </div>
                </div>
            `;
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });
            
            document.body.appendChild(modal);
            
        } else if (pdfExtensions.includes(ext)) {
            // Show PDF in modal with iframe
            const modal = document.createElement('div');
            modal.id = 'documentPreviewModal';
            modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 10001; display: flex; align-items: center; justify-content: center;';
            
            modal.innerHTML = `
                <div style="position: relative; width: 90%; height: 90%; background: var(--surface); border-radius: 10px; padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">${filename}</h3>
                        <button onclick="closePreviewModal()" style="padding: 10px 20px; background: var(--color-red); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">
                            Luk
                        </button>
                    </div>
                    <iframe src="${fileUrl}" style="width: 100%; height: calc(100% - 60px); border: none; border-radius: 5px;"></iframe>
                </div>
            `;
            
            document.body.appendChild(modal);
            
        } else {
            // For other file types, open in new tab
            window.open(fileUrl, '_blank');
        }
        
    } catch (error) {
        console.error('Preview error:', error);
        alert('Kunne ikke vise preview: ' + error.message);
    }
}

// Close preview modal
function closePreviewModal() {
    const modal = document.getElementById('documentPreviewModal');
    if (modal) modal.remove();
}

// Download document
async function downloadDocument(documentId, filename) {
    try {
        const token = sessionStorage.getItem('token');
        
        // Find document to get file path
        const doc = workspaceDocuments.find(d => d.id === documentId);
        if (!doc) {
            alert('Dokument ikke fundet');
            return;
        }
        
        // Construct download URL
        const downloadUrl = `${doc.file_path}`;
        
        // Create temporary link and trigger download
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
    } catch (error) {
        console.error('Download error:', error);
        alert('Kunne ikke downloade dokument: ' + error.message);
    }
}

// Delete document
async function deleteDocument(documentId) {
    if (!confirm('Slet dette dokument?')) return;
    
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
}

// Render "Timer & Materialer" tab - shows labor and material lines on the order
function renderWorkspaceMaterials(container) {
    const lines = workspaceMaterials || [];
    
    if (lines.length === 0) {
        container.innerHTML = `
            <div style="background: var(--surface); padding: 30px; border-radius: 10px; border: 2px solid var(--border);">
                <h3 style="margin: 0 0 20px 0;">⏱ Timer & Materialer</h3>
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
        const isTime = line.source === 'time_entry';
        const cost = parseFloat(line.total_cost) || 0;
        const sale = parseFloat(line.total_sale) || 0;
        totalCost += cost;
        totalSale += sale;
        if (isTime) totalHours += parseFloat(line.quantity) || 0;
        
        const description = isTime
            ? `⏱ Timeregistrering (${line.material_number || '?'})`
            : ` ${line.material_name || 'Materiale'} (${line.material_number || '?'})`;
        const date = line.time_entry_date || (line.added_at ? line.added_at.substring(0, 10) : '');
        
        return `
            <tr style="border-bottom: 1px solid var(--border-soft);">
                <td style="padding: 10px 12px; font-size: 13px; white-space: nowrap;">${date}</td>
                <td style="padding: 10px 12px; font-size: 13px;">${description}</td>
                <td style="padding: 10px 12px; font-size: 13px;">${line.added_by_name || '-'}</td>
                <td style="padding: 10px 12px; font-size: 13px; text-align: right;">${line.quantity} ${isTime ? 't' : ''}</td>
                <td style="padding: 10px 12px; font-size: 13px; text-align: right;">${cost.toFixed(2)} kr</td>
                <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: var(--success);">${sale.toFixed(2)} kr</td>
            </tr>
        `;
    }).join('');
    
    container.innerHTML = `
        <div style="background: var(--surface); padding: 30px; border-radius: 10px; border: 2px solid var(--border);">
            <h3 style="margin: 0 0 20px 0;">⏱ Timer & Materialer</h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border); text-align: left;">
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Dato</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Beskrivelse</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase;">Registreret af</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase; text-align: right;">Antal</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase; text-align: right;">Udgift</th>
                            <th style="padding: 10px 12px; font-size: 12px; color: var(--text-muted); text-transform: uppercase; text-align: right;">Salg</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                    <tfoot>
                        <tr style="border-top: 2px solid var(--border); font-weight: 700;">
                            <td colspan="3" style="padding: 12px; font-size: 13px;">I alt${totalHours > 0 ? ` (${totalHours.toFixed(2)} timer)` : ''}</td>
                            <td></td>
                            <td style="padding: 12px; font-size: 13px; text-align: right; color: var(--danger);">${totalCost.toFixed(2)} kr</td>
                            <td style="padding: 12px; font-size: 13px; text-align: right; color: var(--success);">${totalSale.toFixed(2)} kr</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 15px;">Udgifterne er allerede trukket fra sagens overskud. Salgssøjlen viser linjernes fakturerbare værdi (relevant ved forbrugssager).</p>
        </div>
    `;
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
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Titel *</label>
                    <input type="text" id="extraWorkTitle" required placeholder="F.eks. Ekstra gulvbelægning i gang" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Beskrivelse/Noter</label>
                    <textarea id="extraWorkNotes" rows="3" placeholder="Interne noter om ekstraarbejdet..." style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-size: 14px; resize: vertical;"></textarea>
                </div>
                
                <div style="margin-bottom: 30px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">Arbejdslinjer</h3>
                        <button type="button" onclick="addExtraWorkLine()" style="padding: 8px 16px; background: var(--color-orange); color: white; border: none; border-radius: 5px; cursor: pointer;">
                            Tilføj Linje
                        </button>
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
                    <button type="submit" style="padding: 12px 24px; background: var(--color-orange); color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        Opret Ekstraarbejde
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

function renderExtraWorkLines() {
    const container = document.getElementById('extraWorkLinesContainer');
    
    if (!extraWorkLines || extraWorkLines.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Ingen linjer endnu. Klik "Tilføj Linje"</p>';
        return;
    }
    
    container.innerHTML = extraWorkLines.map((line, index) => `
        <div style="background: var(--surface-muted); padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 2px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong>Linje ${index + 1}</strong>
                <button type="button" onclick="removeExtraWorkLine(${index})" style="padding: 5px 10px; background: var(--color-red); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    Fjern
                </button>
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
    
    const data = {
        contact_person_id: contactPersonId ? parseInt(contactPersonId) : null,
        order_address: orderAddress || null,
        order_postal_code: orderPostalCode || null,
        order_city: orderCity || null
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

// Ordre-stepper: viser arbejdsstatus Godkendt → Igangværende → Faktureret
function renderStageStepper(order) {
    const steps = [
        { key: 'approved', icon: 'check-circle-2', label: 'Godkendt' },
        { key: 'in_progress', icon: 'loader', label: 'Igangværende' },
        { key: 'invoiced', icon: 'receipt', label: 'Faktureret' }
    ];

    let current = 0; // 0 = godkendt, 1 = igangværende, 2 = faktureret
    if (order.order_stage === 'in_progress') current = 1;
    if (order.has_approved_invoice) current = 2;

    let html = '<div class="order-stepper">';
    steps.forEach((step, i) => {
        const cls = i < current ? 'done' : (i === current ? 'current' : '');
        html += `<div class="order-stepper-step ${cls}"><i data-lucide="${step.icon}"></i> ${step.label}</div>`;
        if (i < steps.length - 1) {
            html += `<div class="order-stepper-line ${i < current ? 'done' : ''}"></div>`;
        }
    });
    html += '</div>';
    return html;
}

// Status-badge for ordre: viser arbejdsstatus (Faktureret/Igangværende) eller quote-status
function getStageBadge(order) {
    if (order.has_approved_invoice) {
        return '<div style="font-weight: 600; font-size: 16px; color: var(--color-green);">Faktureret</div>';
    }
    if (order.order_stage === 'in_progress') {
        return '<div style="font-weight: 600; font-size: 16px; color: #1E40AF;">Igangværende</div>';
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
    return `<div style="font-weight: 600; font-size: 16px; color: ${config.color};">${config.icon} ${config.text}</div>`;
}

// View original quote from workspace
async function viewOriginalQuote(orderId) {
    try {
        // Load the quote data
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/quotes/${orderId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load quote');
        
        const quote = await response.json();
        
        // Store current quote and render preview
        // We need to temporarily use the quote preview from quotes-core.js
        currentQuote = quote;
        
        // Call the renderQuotePreview function from quotes-core.js
        if (typeof renderQuotePreview === 'function') {
            renderQuotePreview();
        } else {
            alert('Kunne ikke vise tilbud. Prøv at gå til Tilbud siden i stedet.');
        }
        
    } catch (error) {
        console.error('Error viewing original quote:', error);
        alert('Kunne ikke vise tilbud: ' + error.message);
    }
}

// Export functions
window.openOrderWorkspace = openOrderWorkspace;
window.switchWorkspaceTab = switchWorkspaceTab;
window.closeWorkspace = closeWorkspace;
window.viewInvoiceFromWorkspace = viewInvoiceFromWorkspace;
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
