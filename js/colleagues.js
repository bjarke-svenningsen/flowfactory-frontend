// Kolleger variabler
let allColleagues = [];
let filteredColleagues = [];

// Hent kolleger fra backend
async function loadColleagues() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/users', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            allColleagues = await response.json();
            filteredColleagues = [...allColleagues];
            populateFilters();
            renderColleagues();
        } else {
            console.log('Kunne ikke hente kolleger fra backend, loader demo data');
            loadDemoColleagues();
        }
    } catch (error) {
        console.log('Backend offline, loader demo kolleger');
        loadDemoColleagues();
    }
}

// Indlæs demo kolleger
function loadDemoColleagues() {
    allColleagues = [
        {
            id: 1,
            name: window.currentUser.name,
            email: window.currentUser.email,
            position: window.currentUser.position || 'CEO',
            department: window.currentUser.department || 'Direktionen',
            phone: window.currentUser.phone || '+45 12 34 56 78',
            avatar_url: null
        },
        {
            id: 2,
            name: 'Anders Berg',
            email: 'anders.berg@firma.dk',
            position: 'Udvikler',
            department: 'IT',
            phone: '+45 23 45 67 89',
            avatar_url: null
        },
        {
            id: 3,
            name: 'Mette Hansen',
            email: 'mette.hansen@firma.dk',
            position: 'Designer',
            department: 'Marketing',
            phone: '+45 34 56 78 90',
            avatar_url: null
        },
        {
            id: 4,
            name: 'Peter Nielsen',
            email: 'peter.nielsen@firma.dk',
            position: 'Projektleder',
            department: 'Projektstyring',
            phone: '+45 45 67 89 01',
            avatar_url: null
        },
        {
            id: 5,
            name: 'Sofia Larsen',
            email: 'sofia.larsen@firma.dk',
            position: 'HR Manager',
            department: 'HR',
            phone: '+45 56 78 90 12',
            avatar_url: null
        },
        {
            id: 6,
            name: 'Thomas Jensen',
            email: 'thomas.jensen@firma.dk',
            position: 'Sælger',
            department: 'Salg',
            phone: '+45 67 89 01 23',
            avatar_url: null
        },
        {
            id: 7,
            name: 'Emma Christensen',
            email: 'emma.christensen@firma.dk',
            position: 'Bogholder',
            department: 'Økonomi',
            phone: '+45 78 90 12 34',
            avatar_url: null
        },
        {
            id: 8,
            name: 'Oliver Andersen',
            email: 'oliver.andersen@firma.dk',
            position: 'Udvikler',
            department: 'IT',
            phone: '+45 89 01 23 45',
            avatar_url: null
        }
    ];
    
    filteredColleagues = [...allColleagues];
    populateFilters();
    renderColleagues();
}

// Udfyld filter dropdown menuer
function populateFilters() {
    const departments = [...new Set(allColleagues.map(c => c.department).filter(d => d))];
    const positions = [...new Set(allColleagues.map(c => c.position).filter(p => p))];
    
    const deptFilter = document.getElementById('departmentFilter');
    const posFilter = document.getElementById('positionFilter');
    
    deptFilter.innerHTML = '<option value="">Alle afdelinger</option>';
    departments.sort().forEach(dept => {
        deptFilter.innerHTML += `<option value="${dept}">${dept}</option>`;
    });
    
    posFilter.innerHTML = '<option value="">Alle stillinger</option>';
    positions.sort().forEach(pos => {
        posFilter.innerHTML += `<option value="${pos}">${pos}</option>`;
    });
}

// Filtrer kolleger
function filterColleagues() {
    const searchTerm = document.getElementById('colleagueSearch').value.toLowerCase();
    const deptFilter = document.getElementById('departmentFilter').value;
    const posFilter = document.getElementById('positionFilter').value;
    
    filteredColleagues = allColleagues.filter(colleague => {
        const matchesSearch = colleague.name.toLowerCase().includes(searchTerm) ||
                            colleague.email.toLowerCase().includes(searchTerm) ||
                            (colleague.position && colleague.position.toLowerCase().includes(searchTerm));
        
        const matchesDept = !deptFilter || colleague.department === deptFilter;
        const matchesPos = !posFilter || colleague.position === posFilter;
        
        return matchesSearch && matchesDept && matchesPos;
    });
    
    renderColleagues();
}

// Render kolleger som kontaktkort
function renderColleagues() {
    const grid = document.getElementById('colleaguesGrid');
    
    if (filteredColleagues.length === 0) {
        grid.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">Ingen kolleger fundet</p>';
        return;
    }
    
    grid.innerHTML = filteredColleagues.map(colleague => {
        const initials = colleague.name.split(' ').map(n => n[0]).join('');
        const isCurrentUser = colleague.email === window.currentUser.email;
        
        // Tjek for profilbillede
        let avatarHTML;
        if (isCurrentUser && window.currentUser.profilePhoto) {
            avatarHTML = `<div class="colleague-avatar" style="background-image: url(${window.currentUser.profilePhoto}); background-size: cover; background-position: center;"></div>`;
        } else if (colleague.avatar_url) {
            avatarHTML = `<div class="colleague-avatar" style="background-image: url(https://flowfactory-frontend.onrender.com${colleague.avatar_url}); background-size: cover; background-position: center;"></div>`;
        } else {
            avatarHTML = `<div class="colleague-avatar">${initials}</div>`;
        }
        
        return `
            <div class="colleague-card">
                ${avatarHTML}
                <div class="colleague-info">
                    <h3>${colleague.name}${isCurrentUser ? ' <span style="color: #667eea; font-size: 12px;">(Dig)</span>' : ''}</h3>
                    <div class="colleague-detail">
                        <span class="detail-label">Stilling:</span>
                        <span class="detail-value">${colleague.position || 'Ikke angivet'}</span>
                    </div>
                    <div class="colleague-detail">
                        <span class="detail-label">Afdeling:</span>
                        <span class="detail-value">${colleague.department || 'Ikke angivet'}</span>
                    </div>
                    <div class="colleague-detail">
                        <span class="detail-label">Email:</span>
                        <span class="detail-value"><a href="mailto:${colleague.email}">${colleague.email}</a></span>
                    </div>
                    <div class="colleague-detail">
                        <span class="detail-label">Telefon:</span>
                        <span class="detail-value"><a href="tel:${colleague.phone}">${colleague.phone || 'Ikke angivet'}</a></span>
                    </div>
                </div>
                ${!isCurrentUser ? `
                <div class="colleague-actions">
                    <button class="colleague-action-btn" onclick="sendEmailToColleague('${colleague.email}')" title="Send email">
                        ✉️ Email
                    </button>
                    <button class="colleague-action-btn" onclick="callColleague('${colleague.phone}')" title="Ring op">
                        📞 Ring
                    </button>
                    <button class="colleague-action-btn" onclick="startChatWithColleague(${colleague.id})" title="Start chat">
                        💬 Chat
                    </button>
                </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Send email til kollega
function sendEmailToColleague(email) {
    window.location.href = `mailto:${email}`;
}

// Ring til kollega
function callColleague(phone) {
    if (phone && phone !== 'Ikke angivet') {
        window.location.href = `tel:${phone}`;
    } else {
        alert('Telefonnummer ikke tilgængeligt');
    }
}

// Start chat med kollega
function startChatWithColleague(colleagueId) {
    // Skift til chat siden og åbn chat med denne kollega
    showPage('chat');
    
    // Find kollega i users listen og åbn chat
    setTimeout(() => {
        const userItems = document.querySelectorAll('.user-item');
        userItems.forEach((item, index) => {
            if (users[index] && users[index].id === colleagueId) {
                openChatWith(colleagueId);
            }
        });
    }, 100);
}
