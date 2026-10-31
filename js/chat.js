// Chat - REST + SSE (Socket.IO er fjernet fra portalen)
let users = []; // Indlaeses fra /api/chat/presence
let currentChatUser = null;
let currentConversationId = null;
const chatStore = {};            // conversationId -> [beskeder]
const conversationByPeer = {};   // peerUserId -> conversationId
let sse = null;
let myId = null;
const unreadCounts = {};   // conversationId -> antal ulaeste
const peerRead = {};       // conversationId -> modtagers sidst laeste besked-id
let typingTimer = null;
let typingThrottle = 0;
let typingStatusTimer = null;

function chatAuthHeaders() {
    return {
        'Authorization': 'Bearer ' + (sessionStorage.getItem('token') || ''),
        'Content-Type': 'application/json'
    };
}

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Initialiser chat
async function initChat() {
    await loadPresence();
    await loadConversations();
    connectChatSse();
    // Opdater presence-listen jævnligt (fallback hvis SSE er nede)
    if (!window._chatPresenceTimer) {
        window._chatPresenceTimer = setInterval(loadPresence, 30000);
    }
}

// Samtaleliste: ulaeste-tal + modtagers laest-position
async function loadConversations() {
    try {
        const response = await fetch('/api/chat/conversations', { headers: chatAuthHeaders() });
        if (!response.ok) return;
        const convs = await response.json();
        for (const c of convs) {
            unreadCounts[c.id] = c.unread || 0;
            peerRead[c.id] = c.peer_last_read || 0;
            if (c.peer) conversationByPeer[c.peer.id] = c.id;
        }
        renderUserList();
    } catch (error) { /* listoen praever igen naeste gang */ }
}

// Presence: kolleger + online-status + sidst set
async function loadPresence() {
    try {
        const response = await fetch('/api/chat/presence', { headers: chatAuthHeaders() });
        if (!response.ok) return;
        const backendUsers = await response.json();
        users = backendUsers
            .filter(u => u.id !== (window.currentUser ? window.currentUser.id : null))
            .map(u => ({
                id: u.id,
                name: u.name,
                online: !!u.online,
                last_seen_at: u.last_seen_at || '',
                status: u.online ? 'online' : 'offline',
                initials: getInitials(u.name)
            }));
        renderUserList();
        if (currentChatUser) {
            const fresh = users.find(u => u.id === currentChatUser.id);
            if (fresh) {
                currentChatUser.online = fresh.online;
                currentChatUser.last_seen_at = fresh.last_seen_at;
                updateChatHeaderStatus();
            }
        }
    } catch (error) {
        console.log('Kunne ikke hente presence:', error);
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

// SSE-realtid: engangs-ticket og derefter EventSource
async function connectChatSse() {
    if (sse) return;
    try {
        const response = await fetch('/api/chat/events-ticket', {
            method: 'POST',
            headers: chatAuthHeaders()
        });
        if (!response.ok) {
            setTimeout(connectChatSse, 5000);
            return;
        }
        const data = await response.json();
        sse = new EventSource('/api/chat/events?ticket=' + encodeURIComponent(data.ticket));

        sse.addEventListener('connected', (e) => {
            const d = JSON.parse(e.data);
            myId = d.userId;
            loadPresence();
        });

        sse.addEventListener('chat_message', (e) => {
            const m = JSON.parse(e.data);
            storeMessage(m);
            if (currentConversationId && m.conversation_id === currentConversationId) {
                renderMessages();
                markConversationRead();
            } else {
                unreadCounts[m.conversation_id] = (unreadCounts[m.conversation_id] || 0) + 1;
                renderUserList();
            }
        });

        sse.addEventListener('chat_read', (e) => {
            const d = JSON.parse(e.data);
            peerRead[d.conversationId] = d.lastReadMessageId;
            if (currentConversationId && d.conversationId === currentConversationId) {
                renderMessages();
            }
        });

        sse.addEventListener('chat_typing', (e) => {
            const d = JSON.parse(e.data);
            if (!currentChatUser || !currentConversationId || d.conversationId !== currentConversationId) return;
            if (d.userId !== (currentChatUser ? currentChatUser.id : null)) return;
            const el = document.getElementById('chatUserStatus');
            if (!el) return;
            if (d.typing) {
                el.textContent = 'skriver...';
                el.style.color = 'var(--text-muted)';
                clearTimeout(typingStatusTimer);
                typingStatusTimer = setTimeout(updateChatHeaderStatus, 3000);
            } else {
                clearTimeout(typingStatusTimer);
                updateChatHeaderStatus();
            }
        });

        sse.addEventListener('chat_presence', () => {
            loadPresence();
        });

        sse.onerror = () => {
            // Ticket er engangs - genforbind med en ny
            if (sse) { sse.close(); sse = null; }
            setTimeout(connectChatSse, 3000);
        };
    } catch (error) {
        setTimeout(connectChatSse, 5000);
    }
}

// Gem besked i lageret (med duplikat-beskyttelse)
function storeMessage(m) {
    if (!chatStore[m.conversation_id]) chatStore[m.conversation_id] = [];
    const arr = chatStore[m.conversation_id];
    if (arr.some(x => x.id === m.id)) return;
    const me = myId || (window.currentUser ? window.currentUser.id : null);
    arr.push({
        id: m.id,
        from: m.sender_id === me ? 'me' : m.sender_id,
        sender_id: m.sender_id,
        sender_name: m.sender_name || '',
        text: m.body,
        time: new Date(m.created_at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
    });
    arr.sort((a, b) => (a.id || 0) - (b.id || 0));
}

// Markér samtalen som læst
async function markConversationRead() {
    if (!currentConversationId) return;
    try {
        await fetch('/api/chat/read', {
            method: 'POST',
            headers: chatAuthHeaders(),
            body: JSON.stringify({ conversationId: currentConversationId })
        });
    } catch (error) { /* proeves igen naeste gang */ }
}

// Render bruger liste
function renderUserList() {
    const userList = document.getElementById('userList');
    if (!userList) return;

    userList.innerHTML = users.map(user => {
        const statusClass = user.status;
        const isActive = currentChatUser && currentChatUser.id === user.id ? 'active' : '';
        const isOnline = user.online;
        const convId = conversationByPeer[user.id];
        const unread = convId ? (unreadCounts[convId] || 0) : 0;
        const unreadBadge = unread > 0 ? `<span class="chat-unread-badge">${unread > 9 ? '9+' : unread}</span>` : '';

        return `
            <div class="user-item ${isActive}">
                <div class="user-avatar-small" onclick="openChatWith(${user.id})" style="cursor: pointer;">
                    ${user.initials}
                    <div class="status-dot ${statusClass}"></div>
                </div>
                <div onclick="openChatWith(${user.id})" style="flex: 1; cursor: pointer;">
                    <div style="font-weight: 500;">${escapeHtml(user.name)}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${getStatusText(user)}</div>
                </div>
                ${unreadBadge}
                <button onclick="event.stopPropagation(); startVideoCall(${user.id}, '${escapeHtml(user.name).replace(/'/g, '&#39;')}');"
                        style="padding: 6px 10px; background: ${isOnline ? 'var(--color-green)' : 'var(--border)'}; color: white; border: none; border-radius: 15px; cursor: ${isOnline ? 'pointer' : 'not-allowed'}; font-size: 12px;"
                        ${!isOnline ? 'disabled' : ''}
                        title="${isOnline ? 'Start videoopkald' : 'Bruger er offline'}">

                </button>
            </div>
        `;
    }).join('');
}

// Få status tekst
function getStatusText(user) {
    if (user.online) return 'Online';
    if (user.last_seen_at) {
        const d = new Date(user.last_seen_at.includes('T') ? user.last_seen_at : user.last_seen_at.replace(' ', 'T') + 'Z');
        if (!isNaN(d)) return 'Sidst set ' + d.toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return 'Offline';
}

function updateChatHeaderStatus() {
    if (!currentChatUser) return;
    const el = document.getElementById('chatUserStatus');
    if (!el) return;
    el.textContent = getStatusText(currentChatUser);
    el.style.color = currentChatUser.online ? 'var(--color-green)' : 'var(--text-muted)';
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
    updateChatHeaderStatus();

    renderUserList();

    // Få eller opret 1-til-1-samtalen
    try {
        const response = await fetch('/api/chat/conversations', {
            method: 'POST',
            headers: chatAuthHeaders(),
            body: JSON.stringify({ peerId: userId })
        });
        if (!response.ok) throw new Error('kunne ikke oprette samtale');
        const data = await response.json();
        currentConversationId = data.conversationId;
        conversationByPeer[userId] = currentConversationId;
        unreadCounts[currentConversationId] = 0;
        renderUserList();

        // Hent hele historikken
        const msgResponse = await fetch('/api/chat/conversations/' + currentConversationId + '/messages?after=0', {
            headers: chatAuthHeaders()
        });
        if (msgResponse.ok) {
            const messages = await msgResponse.json();
            chatStore[currentConversationId] = [];
            messages.forEach(storeMessage);
        }
        markConversationRead();
    } catch (error) {
        console.log('Kunne ikke hente chat:', error);
    }

    renderMessages();
}

// Luk chat
function closeChat() {
    currentChatUser = null;
    currentConversationId = null;
    document.getElementById('noChatSelected').style.display = 'flex';
    document.getElementById('chatActive').style.display = 'none';
    renderUserList();
}

// Render beskeder
function renderMessages() {
    if (!currentChatUser || !currentConversationId) return;

    const messages = chatStore[currentConversationId] || [];
    const container = document.getElementById('chatMessages');

    if (messages.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">Ingen beskeder endnu. Send den første!</div>';
        return;
    }

    container.innerHTML = messages.map((msg, i) => {
        const isOwn = msg.from === 'me';
        // "Set" paa den sidste egen besked, hvis modtageren har laest den
        const isLastOwn = isOwn && !messages.slice(i + 1).some(m => m.from === 'me');
        const seen = isLastOwn && msg.id && (peerRead[currentConversationId] || 0) >= msg.id;
        const seenLabel = seen ? '<div class="message-seen">Set</div>' : '';
        return `
            <div class="message ${isOwn ? 'own' : ''}">
                <div class="message-bubble">
                    <div>${escapeHtml(msg.text)}</div>
                    <div class="message-time">${msg.time}</div>
                    ${seenLabel}
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

// Send besked via REST
async function sendMessage() {
    if (!currentChatUser || !currentConversationId) return;

    const input = document.getElementById('chatInput');
    const text = input.value.trim();

    if (!text) return;

    input.value = '';
    input.style.height = 'auto';

    try {
        const response = await fetch('/api/chat/messages', {
            method: 'POST',
            headers: chatAuthHeaders(),
            body: JSON.stringify({ conversationId: currentConversationId, body: text })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            alert(err.error || 'Beskeden kunne ikke sendes');
            input.value = text; // giv brugeren teksten tilbage
            return;
        }
        const msg = await response.json();
        storeMessage(msg);
        renderMessages();
    } catch (error) {
        alert('Beskeden kunne ikke sendes - er du online?');
        input.value = text;
    }
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

// "Skriver..." - sendes traekket (maeks. hvert 2. sekund)
function handleTyping() {
    if (!currentConversationId) return;
    const now = Date.now();
    if (now - typingThrottle > 2000) {
        typingThrottle = now;
        fetch('/api/chat/typing', {
            method: 'POST',
            headers: chatAuthHeaders(),
            body: JSON.stringify({ conversationId: currentConversationId, typing: true })
        }).catch(() => {});
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        if (!currentConversationId) return;
        fetch('/api/chat/typing', {
            method: 'POST',
            headers: chatAuthHeaders(),
            body: JSON.stringify({ conversationId: currentConversationId, typing: false })
        }).catch(() => {});
    }, 3000);
}

// Videoopkald via Jitsi (ingen konto/noegler - offentlig infrastruktur)
async function startVideoCall(userId, userName) {
    try {
        let convId = conversationByPeer[userId];
        if (!convId) {
            const response = await fetch('/api/chat/conversations', {
                method: 'POST',
                headers: chatAuthHeaders(),
                body: JSON.stringify({ peerId: userId })
            });
            if (!response.ok) throw new Error('kunne ikke oprette samtale');
            const data = await response.json();
            convId = data.conversationId;
            conversationByPeer[userId] = convId;
        }
        const room = 'seest-conv' + convId + '-' + Math.random().toString(36).substring(2, 10);
        window.open('https://meet.jit.si/' + room, '_blank');
    } catch (error) {
        alert('Videoopkald kunne ikke startes');
    }
}
