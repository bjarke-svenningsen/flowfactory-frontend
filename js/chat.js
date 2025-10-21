// Chat variabler
let users = []; // Will be loaded from backend

let currentChatUser = null;
let chatMessages = {};
let socket = null;
let socketInitialized = false; // BUG FIX: Track if socket is already initialized

// Initialiser chat
async function initChat() {
    // BUG FIX: Load real users from backend instead of dummy data
    await loadUsers();
    renderUserList();
    
    // BUG FIX: Only initialize socket once to avoid duplicate event listeners
    if (!socketInitialized) {
        initializeSocket();
    }
}

// Load users from backend
async function loadUsers() {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/users', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const backendUsers = await response.json();
            // Convert to chat format and filter out current user
            users = backendUsers
                .filter(u => u.id !== window.currentUser?.id)
                .map(u => ({
                    id: u.id,
                    name: u.name,
                    status: 'offline', // Will be updated by presence:update
                    initials: getInitials(u.name)
                }));
        }
    } catch (error) {
        console.log('Could not load users from backend:', error);
    }
}

// Get initials from name
function getInitials(name) {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// Initialize socket connection
function initializeSocket() {
    try {
        const token = sessionStorage.getItem('token');
        if (token && typeof io !== 'undefined') {
            socket = io('https://flowfactory-frontend.onrender.com');
            
            socket.on('connect', () => {
                console.log('Connected to chat server');
                socket.emit('auth', token);
            });
            
            socket.on('chat:message', (msg) => {
                handleIncomingMessage(msg);
            });
            
            socket.on('presence:update', (onlineUserIds) => {
                updateUserPresence(onlineUserIds);
            });
            
            socketInitialized = true;
        }
    } catch (error) {
        console.log('Socket.IO ikke tilgængelig, bruger lokal chat');
    }
}

// Håndter indkommende besked fra backend
function handleIncomingMessage(msg) {
    const otherUserId = msg.sender_id === window.currentUser.id ? msg.recipient_id : msg.sender_id;
    
    if (!chatMessages[otherUserId]) {
        chatMessages[otherUserId] = [];
    }
    
    const time = new Date(msg.created_at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
    
    chatMessages[otherUserId].push({
        from: msg.sender_id === window.currentUser.id ? 'me' : msg.sender_id,
        text: msg.text,
        time: time
    });
    
    if (currentChatUser && currentChatUser.id === otherUserId) {
        renderMessages();
    }
}

// Opdater bruger presence
function updateUserPresence(onlineUserIds) {
    users.forEach(user => {
        user.status = onlineUserIds.includes(user.id) ? 'online' : 'offline';
    });
    renderUserList();
}

// Render bruger liste
function renderUserList() {
    const userList = document.getElementById('userList');
    // BUG FIX: Guard clause - only render if chat page is loaded
    if (!userList) return;
    
    userList.innerHTML = users.map(user => {
        const statusClass = user.status;
        const isActive = currentChatUser && currentChatUser.id === user.id ? 'active' : '';
        const isOnline = user.status === 'online';
        
        return `
            <div class="user-item ${isActive}">
                <div class="user-avatar-small" onclick="openChatWith(${user.id})" style="cursor: pointer;">
                    ${user.initials}
                    <div class="status-dot ${statusClass}"></div>
                </div>
                <div onclick="openChatWith(${user.id})" style="flex: 1; cursor: pointer;">
                    <div style="font-weight: 500;">${user.name}</div>
                    <div style="font-size: 12px; color: #999;">${getStatusText(user.status)}</div>
                </div>
                <button onclick="event.stopPropagation(); if(typeof startVideoCall !== 'undefined') startVideoCall(${user.id}, '${user.name.replace(/'/g, "\\'")}');" 
                        style="padding: 6px 10px; background: ${isOnline ? '#4caf50' : '#ccc'}; color: white; border: none; border-radius: 15px; cursor: ${isOnline ? 'pointer' : 'not-allowed'}; font-size: 12px;"
                        ${!isOnline ? 'disabled' : ''}
                        title="${isOnline ? 'Start videoopkald' : 'Bruger er offline'}">
                    📞
                </button>
            </div>
        `;
    }).join('');
}

// Få status tekst
function getStatusText(status) {
    const statusMap = {
        online: 'Online',
        busy: 'Optaget',
        offline: 'Offline'
    };
    return statusMap[status] || 'Ukendt';
}

// Åbn chat med bruger
async function openChatWith(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    currentChatUser = user;
    
    document.getElementById('noChatSelected').style.display = 'none';
    document.getElementById('chatActive').style.display = 'flex';
    
    document.getElementById('chatUserAvatar').textContent = user.initials;
    document.getElementById('chatUserName').textContent = user.name;
    document.getElementById('chatUserStatus').textContent = getStatusText(user.status);
    document.getElementById('chatUserStatus').style.color = 
        user.status === 'online' ? '#4caf50' : 
        user.status === 'busy' ? '#f44336' : '#9e9e9e';
    
    renderUserList();
    
    // Hent chat historik fra backend
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/messages/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const messages = await response.json();
            chatMessages[userId] = messages.map(m => ({
                from: m.sender_id === window.currentUser.id ? 'me' : m.sender_id,
                text: m.text,
                time: new Date(m.created_at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
            }));
        }
    } catch (error) {
        console.log('Kunne ikke hente chat historik fra backend');
    }
    
    renderMessages();
}

// Luk chat
function closeChat() {
    currentChatUser = null;
    document.getElementById('noChatSelected').style.display = 'flex';
    document.getElementById('chatActive').style.display = 'none';
    renderUserList();
}

// Render beskeder
function renderMessages() {
    if (!currentChatUser) return;
    
    const messages = chatMessages[currentChatUser.id] || [];
    const container = document.getElementById('chatMessages');
    
    if (messages.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">Ingen beskeder endnu. Send den første!</div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => {
        const isOwn = msg.from === 'me';
        return `
            <div class="message ${isOwn ? 'own' : ''}">
                <div class="message-bubble">
                    <div>${msg.text}</div>
                    <div class="message-time">${msg.time}</div>
                </div>
            </div>
        `;
    }).join('');
    
    container.scrollTop = container.scrollHeight;
}

// Auto-grow textarea
function autoGrowTextarea() {
    const textarea = document.getElementById('chatInput');
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// Send besked
function sendMessage() {
    if (!currentChatUser) return;
    
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const time = new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
    
    if (!chatMessages[currentChatUser.id]) {
        chatMessages[currentChatUser.id] = [];
    }
    
    // BUG FIX: Only add message locally if socket is NOT connected
    // If socket is connected, wait for backend to send it back via handleIncomingMessage
    const shouldAddLocally = !socket || !socket.connected;
    
    if (shouldAddLocally) {
        chatMessages[currentChatUser.id].push({
            from: 'me',
            text: text,
            time: time
        });
    }
    
    input.value = '';
    
    // Reset textarea height
    input.style.height = 'auto';
    
    if (shouldAddLocally) {
        renderMessages();
    }
    
    // Send via Socket.IO hvis tilgængelig
    if (socket && socket.connected) {
        socket.emit('chat:send', {
            toUserId: currentChatUser.id,
            text: text
        });
        // Backend vil sende beskeden tilbage via chat:message event
    } else {
        // Fallback: Simuler svar efter 2 sekunder
        setTimeout(() => {
            if (currentChatUser) {
                chatMessages[currentChatUser.id].push({
                    from: currentChatUser.id,
                    text: getRandomReply(),
                    time: new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
                });
                renderMessages();
            }
        }, 2000);
    }
}

// Tilfældig svar
function getRandomReply() {
    const replies = [
        'Det lyder godt! 👍',
        'Tak for info!',
        'Forstået 😊',
        'Super, så gør vi det!',
        'Perfekt! 🎉',
        'Okay, jeg vender tilbage snart',
        'Tak!',
        'Sounds good!'
    ];
    return replies[Math.floor(Math.random() * replies.length)];
}

// Toggle emoji picker
function toggleEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

// Indsæt emoji
function insertEmoji(emoji) {
    const input = document.getElementById('chatInput');
    input.value += emoji;
    input.focus();
    document.getElementById('emojiPicker').style.display = 'none';
}

// Filtrer brugere
function filterUsers() {
    const query = document.getElementById('userSearch').value.toLowerCase();
    const items = document.querySelectorAll('.user-item');
    
    items.forEach(item => {
        const name = item.textContent.toLowerCase();
        item.style.display = name.includes(query) ? 'flex' : 'none';
    });
}
