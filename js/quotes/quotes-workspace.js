// js/quotes/quotes-workspace.js - Order workspace management

let currentWorkspaceOrder = null;
let currentWorkspaceInvoice = null;
let workspaceExpenses = [];
let workspaceDocuments = [];
let workspaceTimeline = [];
let workspaceNotes = [];
let workspaceExtraWorkOrders = [];
let workspaceFinancials = null;
let currentWorkspaceTab = 'overview';
let extraWorkLines = [];
let parentOrderId = null; // Track parent order for back navigation

// Open order workspace
async function openOrderWorkspace(orderId, fromParentId = null) {
    console.log('=== openOrderWorkspace called ===');
    console.log('orderId:', orderId);
    console.log('fromParentId:', fromParentId);
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/orders/${orderId}/workspace`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load workspace');
        
        const data = await response.json();
        
        console.log('Received workspace data:', data.order);
        console.log('Order ID from backend:', data.order.id);
        console.log('Order number from backend:', data.order.order_number);
        console.log('Is extra work?', data.order.is_extra_work);
        
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
    // Use aggregated financials from backend (includes main order + extra work)
    const revenue = workspaceFinancials ? workspaceFinancials.revenue : (currentWorkspaceOrder.total || 0);
    const totalExpenses = workspaceFinancials ? workspaceFinancials.expenses : workspaceExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const profit = workspaceFinancials ? workspaceFinancials.profit : (revenue - totalExpenses);
    const profitMargin = workspaceFinancials ? workspaceFinancials.profit_margin : (revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0);
    
    // Check if we have extra work (split stats available)
    const hasExtraWork = workspaceExtraWorkOrders && workspaceExtraWorkOrders.length > 0;
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; align-items: start;">
            <!-- Left column: Stats and Chart -->
            <div>
                ${hasExtraWork ? `
                    <!-- Split Statistics Cards -->
                    <div style="background: white; padding: 25px; border-radius: 10px; border: 2px solid #e0e0e0; margin-bottom: 30px;">
                        <h3 style="margin: 0 0 20px 0; color: #333;">📊 Opdelt Statistik</h3>
                        
                        <!-- Revenue -->
                        <div style="margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div style="font-weight: 600; font-size: 16px;">💰 Omsætning</div>
                                <div style="font-size: 20px; font-weight: 600; color: #667eea;">${formatCurrency(workspaceFinancials.revenue)}</div>
                            </div>
                            <div style="padding-left: 25px; font-size: 14px; color: #666;">
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
                        
                        <div style="border-top: 1px solid #e0e0e0; margin: 20px 0;"></div>
                        
                        <!-- Expenses -->
                        <div style="margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div style="font-weight: 600; font-size: 16px;">📊 Udgifter</div>
                                <div style="font-size: 20px; font-weight: 600; color: #f44336;">${formatCurrency(workspaceFinancials.expenses)}</div>
                            </div>
                            <div style="padding-left: 25px; font-size: 14px; color: #666;">
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
                        
                        <div style="border-top: 1px solid #e0e0e0; margin: 20px 0;"></div>
                        
                        <!-- Profit -->
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div style="font-weight: 600; font-size: 16px;">✅ Profit</div>
                                <div style="font-size: 20px; font-weight: 600; color: ${profit >= 0 ? '#4caf50' : '#f44336'};">${formatCurrency(workspaceFinancials.profit)} (${profitMargin}%)</div>
                            </div>
                            <div style="padding-left: 25px; font-size: 14px; color: #666;">
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
                `}
                
                <!-- Profit Chart (Compact) -->
                <div style="background: white; padding: 20px; border-radius: 10px; border: 2px solid #e0e0e0;">
                    <h3 style="margin: 0 0 15px 0;">🥧 Profit Oversigt</h3>
                    <canvas id="profitChart" width="300" height="300"></canvas>
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
        
        <!-- Arbejdsbeskrivelse Section (Full Width) -->
        <div style="background: white; padding: 30px; border-radius: 10px; border: 2px solid #e0e0e0; margin-top: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0;">📋 Arbejdsbeskrivelse</h3>
                <button id="workDescEditBtn" onclick="toggleWorkDescriptionEdit()" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    ✏️ Rediger
                </button>
            </div>
            
            <!-- Read Mode (default) -->
            <div id="workDescReadMode" style="display: block;">
                <div id="workDescContent" style="min-height: 100px; padding: 15px; background: #f9f9f9; border-radius: 5px; border: 1px solid #e0e0e0;">
                    ${currentWorkspaceOrder.work_description || '<em style="color: #999;">Ingen beskrivelse endnu...</em>'}
                </div>
            </div>
            
            <!-- Edit Mode (hidden) -->
            <div id="workDescEditMode" style="display: none;">
                <div id="workDescEditor" style="min-height: 200px; background: white;"></div>
                <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: flex-end;">
                    <button onclick="cancelWorkDescriptionEdit()" style="padding: 10px 20px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Annuller
                    </button>
                    <button onclick="saveWorkDescription()" style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        💾 Gem
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Extra Work Orders Section -->
        ${workspaceExtraWorkOrders && workspaceExtraWorkOrders.length > 0 ? `
            <div style="margin-top: 30px;">
                <div style="background: white; padding: 30px; border-radius: 10px; border: 2px solid #ff9800;">
                    <h3 style="margin: 0 0 20px 0; color: #ff9800;">🔧 Ekstraarbejde (${workspaceExtraWorkOrders.length})</h3>
                    <div style="display: grid; gap: 15px;">
                        ${workspaceExtraWorkOrders.map(extraOrder => `
                            <div style="background: #fff3e0; padding: 20px; border-radius: 8px; border: 1px solid #ff9800;">
                                <div style="display: flex; justify-content: space-between; align-items: start;">
                                    <div style="flex: 1;">
                                        <h4 style="margin: 0 0 10px 0; color: #ff9800;">Ordre ${extraOrder.full_order_number}</h4>
                                        <p style="margin: 5px 0;"><strong>Titel:</strong> ${extraOrder.title}</p>
                                        <p style="margin: 5px 0;"><strong>Total:</strong> ${formatCurrency(extraOrder.total)}</p>
                                        <p style="margin: 5px 0; font-size: 12px; color: #666;">Oprettet: ${new Date(extraOrder.created_at).toLocaleDateString('da-DK')}</p>
                                    </div>
                                    <button onclick="openOrderWorkspace(${extraOrder.id}, ${currentWorkspaceOrder.id})" style="padding: 10px 20px; background: #ff9800; color: white; border: none; border-radius: 5px; cursor: pointer; white-space: nowrap;">
                                        👁️ Åbn
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        ` : ''}
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
    
    // Debug: Log which order we're adding expense to
    console.log('Adding expense to order:', currentWorkspaceOrder.id, currentWorkspaceOrder.order_number);
    console.log('Current workspace order:', currentWorkspaceOrder);
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/orders/${currentWorkspaceOrder.id}/expenses`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/orders/${currentWorkspaceOrder.id}/expenses/${expenseId}`, {
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/orders/${currentWorkspaceOrder.id}/expenses/${expenseId}`, {
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

// Render documents tab
function renderWorkspaceDocuments(container) {
    container.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 10px; border: 2px solid #e0e0e0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
                <div>
                    <h3 style="margin: 0 0 10px 0;">📎 Dokumenter</h3>
                    <p style="margin: 0; color: #666;">Dokumenter tilknyttet denne ordre (${workspaceDocuments.length})</p>
                </div>
                <button onclick="showUploadDocument()" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">
                    ➕ Upload Dokument
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
            <div style="text-align: center; padding: 60px 20px; color: #999;">
                <div style="font-size: 64px; margin-bottom: 20px;">📎</div>
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
                    <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; border: 2px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
                            <div style="font-size: 32px;">${icon}</div>
                            <div style="flex: 1;">
                                <div style="font-weight: 600; margin-bottom: 5px;">${doc.original_name}</div>
                                <div style="font-size: 13px; color: #666;">
                                    ${size} • ${doc.document_type || 'Dokument'} • Uploadet af ${doc.uploaded_by_name} • ${date}
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button onclick="previewDocument(${doc.id}, '${doc.original_name.replace(/'/g, "\\'")}')" style="padding: 8px 16px; background: #2196f3; color: white; border: none; border-radius: 5px; cursor: pointer;">
                                👁️ Preview
                            </button>
                            <button onclick="downloadDocument(${doc.id}, '${doc.original_name.replace(/'/g, "\\'")}')" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;">
                                💾 Download
                            </button>
                            <button onclick="deleteDocument(${doc.id})" style="padding: 8px 16px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">
                                🗑️ Slet
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
        'pdf': '📄',
        'doc': '📝', 'docx': '📝',
        'xls': '📊', 'xlsx': '📊',
        'ppt': '📊', 'pptx': '📊',
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
        'zip': '📦', 'rar': '📦',
        'txt': '📃'
    };
    return icons[ext] || '📄';
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
        <div style="background: white; border-radius: 10px; padding: 30px; max-width: 500px; width: 90%;">
            <h2 style="margin: 0 0 20px 0;">📎 Upload Dokument</h2>
            
            <form id="documentForm" onsubmit="event.preventDefault(); uploadDocument();">
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Vælg fil *</label>
                    <input type="file" id="documentFile" required style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
                </div>
                
                <div style="margin-bottom: 30px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Dokument Type</label>
                    <select id="documentType" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 5px; font-size: 14px;">
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
                    <button type="button" onclick="closeDocumentModal()" style="padding: 12px 24px; background: #999; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        Annuller
                    </button>
                    <button type="submit" style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;">
                        📤 Upload
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
    const documentType = document.getElementById('documentType').value;
    
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/orders/${currentWorkspaceOrder.id}/documents`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if (!response.ok) throw new Error('Failed to upload document');
        
        const document = await response.json();
        workspaceDocuments.unshift(document);
        
        closeDocumentModal();
        alert('✅ Dokument uploadet!');
        
        // Refresh documents list
        renderDocumentsList();
        
        // Update tab count
        const tab = document.getElementById('workspaceTabDocuments');
        if (tab) {
            tab.textContent = `📎 Dokumenter (${workspaceDocuments.length})`;
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
        
        const fileUrl = `https://flowfactory-frontend.onrender.com${doc.file_path}`;
        
        if (imageExtensions.includes(ext)) {
            // Show image in modal
            const modal = document.createElement('div');
            modal.id = 'documentPreviewModal';
            modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 10001; display: flex; align-items: center; justify-content: center; cursor: pointer;';
            
            modal.innerHTML = `
                <div style="position: relative; max-width: 90%; max-height: 90%; padding: 20px;">
                    <div style="position: absolute; top: 10px; right: 10px; background: white; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: 600;" onclick="closePreviewModal()">
                        ✕ Luk
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
                <div style="position: relative; width: 90%; height: 90%; background: white; border-radius: 10px; padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0;">${filename}</h3>
                        <button onclick="closePreviewModal()" style="padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">
                            ✕ Luk
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
        const downloadUrl = `https://flowfactory-frontend.onrender.com${doc.file_path}`;
        
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/orders/${currentWorkspaceOrder.id}/documents/${documentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to delete document');
        
        alert('✅ Dokument slettet!');
        
        // Remove from array
        workspaceDocuments = workspaceDocuments.filter(d => d.id !== documentId);
        
        // Refresh
        renderDocumentsList();
        
        // Update tab count
        const tab = document.getElementById('workspaceTabDocuments');
        if (tab) {
            tab.textContent = `📎 Dokumenter (${workspaceDocuments.length})`;
        }
        
    } catch (error) {
        console.error('Delete error:', error);
        alert('Kunne ikke slette dokument: ' + error.message);
    }
}

// Render timeline tab
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/quotes/${parentOrderId}/extra-work`, {
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
        
        // Add custom CSS for proper list styling
        const style = document.createElement('style');
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
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/orders/${currentWorkspaceOrder.id}/work-description`, {
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
        document.getElementById('workDescContent').innerHTML = htmlContent || '<em style="color: #999;">Ingen beskrivelse...</em>';
        
        // Switch back to read mode
        cancelWorkDescriptionEdit();
        
        alert('✅ Arbejdsbeskrivelse gemt!');
    } catch (error) {
        console.error('Save work description error:', error);
        alert('Kunne ikke gemme: ' + error.message);
    }
}

// Export functions
window.openOrderWorkspace = openOrderWorkspace;
window.switchWorkspaceTab = switchWorkspaceTab;
window.closeWorkspace = closeWorkspace;
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
