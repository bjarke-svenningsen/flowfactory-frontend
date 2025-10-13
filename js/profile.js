// Profile Management Functions

function toggleEditMode() {
    const viewMode = document.getElementById('profileViewMode');
    const editMode = document.getElementById('profileEditMode');
    const editBtn = document.getElementById('editBtn');
    
    if (editMode.style.display === 'none') {
        document.getElementById('editName').value = window.currentUser.name;
        document.getElementById('editEmail').value = window.currentUser.email;
        document.getElementById('editPosition').value = window.currentUser.position || '';
        document.getElementById('editDepartment').value = window.currentUser.department || '';
        document.getElementById('editPhone').value = window.currentUser.phone || '';
        
        viewMode.style.display = 'none';
        editMode.style.display = 'block';
        editBtn.textContent = '❌ Annuller';
    } else {
        viewMode.style.display = 'block';
        editMode.style.display = 'none';
        editBtn.textContent = '✏️ Rediger profil';
    }
}

async function saveProfile() {
    const newName = document.getElementById('editName').value.trim();
    const newPosition = document.getElementById('editPosition').value.trim();
    const newDepartment = document.getElementById('editDepartment').value.trim();
    const newPhone = document.getElementById('editPhone').value.trim();
    
    if (!newName) {
        alert('Navn kan ikke være tomt');
        return;
    }

    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/users/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: newName,
                position: newPosition,
                department: newDepartment,
                phone: newPhone
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Ukendt fejl' }));
            throw new Error(error.error || 'Kunne ikke opdatere profil');
        }

        const { user } = await response.json();
        
        // Opdater lokal bruger data
        window.currentUser.name = user.name;
        window.currentUser.position = user.position;
        window.currentUser.department = user.department;
        window.currentUser.phone = user.phone;
        sessionStorage.setItem('currentUser', JSON.stringify(window.currentUser));
        
        const initials = newName.split(' ').map(n => n[0]).join('');
        
        if (!window.currentUser.profilePhoto) {
            document.getElementById('navAvatar').textContent = initials;
            document.getElementById('profileAvatar').textContent = initials;
            document.getElementById('feedAvatar').textContent = initials;
        }
        
        document.getElementById('navUserName').textContent = newName;
        document.getElementById('profileName').textContent = newName;
        document.getElementById('infoName').textContent = newName;
        document.getElementById('infoPosition').textContent = newPosition || 'Ikke angivet';
        document.getElementById('infoDepartment').textContent = newDepartment || 'Ikke angivet';
        document.getElementById('infoPhone').textContent = newPhone || 'Ikke angivet';
        
        toggleEditMode();
        alert('Profil opdateret! ✅');
    } catch (error) {
        console.error('Profil opdatering fejl:', error);
        alert('Fejl ved opdatering: ' + error.message);
    }
}

function changeProfilePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        window.currentUser.profilePhoto = e.target.result;
        sessionStorage.setItem('currentUser', JSON.stringify(window.currentUser));
        
        document.getElementById('navAvatar').style.backgroundImage = `url(${e.target.result})`;
        document.getElementById('navAvatar').style.backgroundSize = 'cover';
        document.getElementById('navAvatar').textContent = '';
        
        document.getElementById('profileAvatar').style.backgroundImage = `url(${e.target.result})`;
        document.getElementById('profileAvatar').style.backgroundSize = 'cover';
        document.getElementById('profileAvatar').textContent = '';
        
        document.getElementById('feedAvatar').style.backgroundImage = `url(${e.target.result})`;
        document.getElementById('feedAvatar').style.backgroundSize = 'cover';
        document.getElementById('feedAvatar').textContent = '';
    };
    reader.readAsDataURL(file);
}

async function loadUserActivity() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/users/activity', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Failed to load activity');
        
        const data = await response.json();
        
        // Format member since date
        const memberDate = new Date(data.member_since);
        const now = new Date();
        const diffTime = Math.abs(now - memberDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let memberText;
        if (diffDays < 30) {
            memberText = `${diffDays} dage`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            memberText = `${months} måned${months > 1 ? 'er' : ''}`;
        } else {
            const years = Math.floor(diffDays / 365);
            memberText = `${years} år`;
        }
        
        document.getElementById('infoMemberSince').textContent = memberText;
        document.getElementById('infoMessagesSent').textContent = data.messages_sent;
        document.getElementById('infoPostsCreated').textContent = data.posts_created;
        
    } catch (error) {
        console.error('Error loading activity:', error);
        document.getElementById('infoMemberSince').textContent = 'Fejl';
        document.getElementById('infoMessagesSent').textContent = 'Fejl';
        document.getElementById('infoPostsCreated').textContent = 'Fejl';
    }
}

// Initialize profile page when loaded
window.pageLoader.registerPageInit('profile', function() {
    // Populate profile fields
    if (window.currentUser) {
        const initials = window.currentUser.name.split(' ').map(n => n[0]).join('');
        
        if (window.currentUser.profilePhoto) {
            document.getElementById('profileAvatar').style.backgroundImage = `url(${window.currentUser.profilePhoto})`;
            document.getElementById('profileAvatar').style.backgroundSize = 'cover';
            document.getElementById('profileAvatar').textContent = '';
        } else {
            document.getElementById('profileAvatar').textContent = initials;
        }
        
        document.getElementById('profileName').textContent = window.currentUser.name;
        document.getElementById('profileEmail').textContent = window.currentUser.email;
        document.getElementById('infoName').textContent = window.currentUser.name;
        document.getElementById('infoEmail').textContent = window.currentUser.email;
        document.getElementById('infoPosition').textContent = window.currentUser.position || 'Ikke angivet';
        document.getElementById('infoDepartment').textContent = window.currentUser.department || 'Ikke angivet';
        document.getElementById('infoPhone').textContent = window.currentUser.phone || 'Ikke angivet';
        
        loadUserActivity();
    }
});
