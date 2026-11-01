// Admin Panel Functions

async function loadAdminData() {
    if (!window.currentUser.is_admin) {
        const menuItem = document.getElementById('adminMenuItem');
        if (menuItem) menuItem.style.display = 'none';
        return;
    }
    
    const menuItem = document.getElementById('adminMenuItem');
    if (menuItem) menuItem.style.display = 'block';
    
    try {
        const token = sessionStorage.getItem('token');
        
        // Load stats
        const usersRes = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const usersData = await usersRes.json();
        const users = Array.isArray(usersData) ? usersData : (usersData.users || []);
        
        const totalUsersEl = document.getElementById('adminTotalUsers');
        if (totalUsersEl) totalUsersEl.textContent = users.length;
        
        const pendingRes = await fetch('/api/admin/pending-users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const pendingData = await pendingRes.json();
        const pending = Array.isArray(pendingData) ? pendingData : (pendingData.pending || []);
        
        const pendingUsersEl = document.getElementById('adminPendingUsers');
        if (pendingUsersEl) pendingUsersEl.textContent = pending.length;
        
        const codesRes = await fetch('/api/admin/invite-codes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const codesData = await codesRes.json();
        const codes = Array.isArray(codesData) ? codesData : (codesData.codes || []);
        const activeCodes = codes.filter(c => !c.used_by && new Date(c.expires_at) > new Date());
        
        const inviteCodesEl = document.getElementById('adminInviteCodes');
        if (inviteCodesEl) inviteCodesEl.textContent = activeCodes.length;
        
    } catch (error) {
        console.error('Failed to load admin data:', error);
    }
}

async function loadPendingUsers() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/admin/pending-users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const pendingData = await response.json();
        const pending = Array.isArray(pendingData) ? pendingData : (pendingData.pending || []);
        
        const container = document.getElementById('pendingUsersList');
        if (pending.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Ingen ventende registreringer</p>';
            return;
        }
        
        container.innerHTML = pending.map(user => `
            <div style="border: 1px solid var(--border); border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0 0 10px 0;">${user.name}</h4>
                        <p style="margin: 5px 0; color: var(--text-muted);"> ${user.email}</p>
                        <p style="margin: 5px 0; color: var(--text-muted);"> ${user.position || 'Ikke angivet'}</p>
                        <p style="margin: 5px 0; color: var(--text-muted);"> ${user.department || 'Ikke angivet'}</p>
                        <p style="margin: 5px 0; color: var(--text-muted); font-size: 12px;">Anmodet: ${new Date(user.created_at).toLocaleString('da-DK')}</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="approveUser(${user.id})" class="btn btn-primary">
                             Godkend
                        </button>
                        <button onclick="rejectUser(${user.id})" class="btn btn-danger">
                             Afvis
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        alert('Fejl ved indlæsning af ventende brugere: ' + error.message);
    }
}

async function approveUser(userId) {
    if (!confirm('Godkend denne bruger?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/admin/approve-user/${userId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Godkendelse fejlede');
        
        alert(' Bruger godkendt!');
        loadPendingUsers();
        loadAdminData();
    } catch (error) {
        alert('Fejl: ' + error.message);
    }
}

async function rejectUser(userId) {
    if (!confirm('Afvis denne bruger?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/admin/reject-user/${userId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Afvisning fejlede');
        
        alert(' Bruger afvist');
        loadPendingUsers();
        loadAdminData();
    } catch (error) {
        alert('Fejl: ' + error.message);
    }
}

async function sendEmailInvitation() {
    const email = prompt('Indtast email adresse:');
    if (!email || !email.trim()) return;
    
    const name = prompt('Indtast navn (valgfrit):');
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/admin/send-invitation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                email: email.trim(),
                name: name ? name.trim() : null
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to send invitation');
        }
        
        const result = await response.json();
        
        alert(` Email invitation sendt til ${email}!\n\nInvite kode: ${result.code}\n\nEmailen er sendt og koden er gyldig i 7 dage.`);
        
        loadInviteCodes();
        loadAdminData();
    } catch (error) {
        alert('Fejl ved sending: ' + error.message);
    }
}

async function generateInviteCode() {
    const days = prompt('Antal dage koden skal være gyldig:', '7');
    if (!days) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/admin/generate-invite', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ daysValid: parseInt(days) })
        });
        
        const invite = await response.json();
        
        alert(` Invite kode genereret!\n\nKode: ${invite.code}\n\nDel denne kode med nye brugere. Den udløber: ${new Date(invite.expires_at).toLocaleString('da-DK')}`);
        
        loadInviteCodes();
        loadAdminData();
    } catch (error) {
        alert('Fejl ved generering: ' + error.message);
    }
}

async function loadInviteCodes() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/admin/invite-codes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const codesData = await response.json();
        const codes = Array.isArray(codesData) ? codesData : (codesData.codes || []);
        
        const container = document.getElementById('inviteCodesList');
        if (codes.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Ingen invite koder endnu</p>';
            return;
        }
        
        container.innerHTML = codes.map(code => {
            const isExpired = new Date(code.expires_at) < new Date();
            const isUsed = code.used_by !== null;
            const status = isUsed ? ' Brugt' : isExpired ? ' Udløbet' : ' Aktiv';
            const statusColor = isUsed ? 'var(--color-green)' : isExpired ? 'var(--text-muted)' : 'var(--color-blue)';
            
            return `
                <div style="border: 1px solid var(--border); border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 10px 0; font-family: monospace; font-size: 18px;">${code.code}</h4>
                            <p style="margin: 5px 0; color: ${statusColor}; font-weight: bold;">${status}</p>
                            <p style="margin: 5px 0; color: var(--text-muted);">Oprettet af: ${code.created_by_name}</p>
                            <p style="margin: 5px 0; color: var(--text-muted);">Udløber: ${new Date(code.expires_at).toLocaleString('da-DK')}</p>
                            ${isUsed ? `<p style="margin: 5px 0; color: var(--text-muted);">Brugt af: ${code.used_by_name}</p>` : ''}
                        </div>
                        ${!isUsed ? `
                            <button onclick="deleteInviteCode(${code.id})" class="btn btn-danger">
                                 Slet
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        alert('Fejl ved indlæsning af invite koder: ' + error.message);
    }
}

async function deleteInviteCode(codeId) {
    if (!confirm('Slet denne invite kode?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        await fetch(`/api/admin/invite-codes/${codeId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        alert(' Invite kode slettet');
        loadInviteCodes();
        loadAdminData();
    } catch (error) {
        alert('Fejl: ' + error.message);
    }
}

async function loadAllUsers() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const usersData = await response.json();
        const users = Array.isArray(usersData) ? usersData : (usersData.users || []);
        
        const container = document.getElementById('allUsersList');
        window._adminUsers = users; // bruges af Rediger-dialogen
        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: var(--surface-muted);">
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--border);">Navn</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--border);">Email</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--border);">Stilling</th>
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--border);">Afdeling</th>
                        <th style="padding: 10px; text-align: center; border-bottom: 2px solid var(--border);">Admin</th>
                        <th style="padding: 10px; text-align: center; border-bottom: 2px solid var(--border);">Handlinger</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => `
                        <tr style="border-bottom: 1px solid var(--border);">
                            <td style="padding: 10px;">${user.name}</td>
                            <td style="padding: 10px;">${user.email}</td>
                            <td style="padding: 10px;">${user.position || '-'}</td>
                            <td style="padding: 10px;">${user.department || '-'}</td>
                            <td style="padding: 10px; text-align: center;">${user.is_admin ? ' Ja' : '-'}</td>
                            <td style="padding: 10px; text-align: center;">
                                ${user.id !== window.currentUser.id ? `
                                    <div style="display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;">
                                        <button onclick="editUser(${user.id})" class="btn btn-secondary" style="padding: 5px 10px; font-size: 12px;">
                                            Rediger
                                        </button>
                                        ${!user.is_admin ? `
                                            <button onclick="makeAdmin(${user.id})" class="btn btn-secondary" style="padding: 5px 10px; font-size: 12px;">
                                                Gør til admin
                                            </button>
                                        ` : `
                                            <button onclick="removeAdmin(${user.id})" class="btn btn-secondary" style="padding: 5px 10px; font-size: 12px;">
                                                Fjern admin
                                            </button>
                                        `}
                                        <button onclick="deleteUser(${user.id}, '${user.name.replace(/'/g, "\\'")}', '${user.email}')" class="btn btn-danger" style="padding: 5px 10px; font-size: 12px;">
                                             Slet
                                        </button>
                                    </div>
                                ` : '<em>Dig selv</em>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
    } catch (error) {
        alert('Fejl ved indlæsning af brugere: ' + error.message);
    }
}

async function makeAdmin(userId) {
    if (!confirm('Gør denne bruger til administrator?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        await fetch(`/api/admin/make-admin/${userId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        alert(' Bruger er nu administrator');
        loadAllUsers();
    } catch (error) {
        alert('Fejl: ' + error.message);
    }
}

async function removeAdmin(userId) {
    if (!confirm('Fjern admin rettigheder fra denne bruger?')) return;
    
    try {
        const token = sessionStorage.getItem('token');
        await fetch(`/api/admin/remove-admin/${userId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        alert(' Admin rettigheder fjernet');
        loadAllUsers();
    } catch (error) {
        alert('Fejl: ' + error.message);
    }
}

// ===== Rediger bruger (admin) =====
async function editUser(userId) {
    const user = (window._adminUsers || []).find(u => u.id === userId);
    if (!user) return alert('Brugeren blev ikke fundet');

    const existing = document.getElementById('editUserModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'editUserModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
    modal.innerHTML = `
        <div style="background:var(--surface,#fff);border-radius:12px;padding:24px;width:420px;max-width:90vw;max-height:90vh;overflow:auto;">
            <h3 style="margin:0 0 16px 0;">Rediger bruger: ${user.name}</h3>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <label style="font-size:13px;font-weight:600;">Fornavn
                    <input id="editUserFirstName" value="${(user.name || '').split(' ')[0] || ''}" style="width:100%;padding:8px;margin-top:4px;border:1px solid var(--border,#ddd);border-radius:6px;">
                </label>
                <label style="font-size:13px;font-weight:600;">Efternavn
                    <input id="editUserLastName" value="${(user.name || '').split(' ').slice(1).join(' ') || ''}" style="width:100%;padding:8px;margin-top:4px;border:1px solid var(--border,#ddd);border-radius:6px;">
                </label>
                <label style="font-size:13px;font-weight:600;">E-mail
                    <input id="editUserEmail" value="${user.email || ''}" style="width:100%;padding:8px;margin-top:4px;border:1px solid var(--border,#ddd);border-radius:6px;">
                </label>
                <label style="font-size:13px;font-weight:600;">Stilling
                    <input id="editUserPosition" value="${user.position || ''}" style="width:100%;padding:8px;margin-top:4px;border:1px solid var(--border,#ddd);border-radius:6px;">
                </label>
                <label style="font-size:13px;font-weight:600;">Afdeling (bestemmer adgang: Ledelsen = admin)
                    <select id="editUserDepartment" style="width:100%;padding:8px;margin-top:4px;border:1px solid var(--border,#ddd);border-radius:6px;">
                        <option value="Montører" ${user.department !== 'Ledelsen' ? 'selected' : ''}>Montører</option>
                        <option value="Ledelsen" ${user.department === 'Ledelsen' ? 'selected' : ''}>Ledelsen</option>
                    </select>
                </label>
                <label style="font-size:13px;font-weight:600;">Nyt kodeord (valgfri - efterlad tom for at beholde nuværende)
                    <input id="editUserPassword" type="password" placeholder="Mindst 6 tegn" style="width:100%;padding:8px;margin-top:4px;border:1px solid var(--border,#ddd);border-radius:6px;">
                </label>
            </div>
            <div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end;">
                <button onclick="document.getElementById('editUserModal').remove()" class="btn btn-secondary">Annuller</button>
                <button onclick="saveUserEdit(${userId})" class="btn btn-primary">Gem</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    // OBS: klik uden for vinduet lukker IKKE - kun Annuller/Gem (undgaa at miste tastet input)
}

async function saveUserEdit(userId) {
    const firstName = document.getElementById('editUserFirstName').value.trim();
    const lastName = document.getElementById('editUserLastName').value.trim();
    const email = document.getElementById('editUserEmail').value.trim();
    const position = document.getElementById('editUserPosition').value.trim();
    const department = document.getElementById('editUserDepartment').value;
    const password = document.getElementById('editUserPassword').value;

    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: (firstName + ' ' + lastName).trim(), email, position, department, password: password || undefined })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Kunne ikke gemme');
        }
        document.getElementById('editUserModal')?.remove();
        alert('✅ Brugeren er opdateret');
        loadAllUsers();
    } catch (error) {
        alert('Fejl: ' + error.message);
    }
}

async function deleteUser(userId, userName, userEmail) {
    const confirmed = confirm(` ADVARSEL!\n\nEr du sikker på at du vil slette brugeren:\n\n${userName}\n${userEmail}\n\nDette vil permanent slette:\n- Brugerens konto\n- Alle beskeder\n- Alle opslag\n- Alle uploadede filer\n- Alle mapper\n\nDenne handling kan IKKE fortrydes!`);
    
    if (!confirmed) return;
    
    const doubleConfirm = confirm('Er du HELT sikker? Skriv brugerens navn for at bekræfte.');
    if (!doubleConfirm) return;
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Kunne ikke slette bruger');
        }
        
        const result = await response.json();
        alert(` ${result.message}\n\nBrugeren er blevet permanent slettet.`);
        loadAllUsers();
        loadAdminData();
    } catch (error) {
        alert('Fejl ved sletning: ' + error.message);
    }
}

// Initialize admin page when loaded
window.pageLoader.registerPageInit('admin', function() {
    loadPendingUsers();
    loadInviteCodes();
    loadAllUsers();
    loadAdminData();
});

// Load admin data when user logs in
if (window.currentUser && window.currentUser.is_admin) {
    loadAdminData();
}
