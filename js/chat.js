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
let chatFilter = 'alle';   // 'alle' | 'ulaeste'
let convList = [];         // samtaler fra backend (med last_message + unread)

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
        convList = convs;
        for (const c of convs) {
            unreadCounts[c.id] = c.unread || 0;
            peerRead[c.id] = c.peer_last_read || 0;
            if (c.peer) conversationByPeer[c.peer.id] = c.id;
        }
        renderUserList();
        updateChatMenuBadge();
        updateChatPageSubtitle();
    } catch (error) { /* listoen praever igen naeste gang */ }
}

// Fil-chips: Alle / Ulaeste
function setChatFilter(f) {
    chatFilter = f;
    const a = document.getElementById('chatChipAlle');
    const u = document.getElementById('chatChipUlaeste');
    if (a) a.classList.toggle('active', f === 'alle');
    if (u) u.classList.toggle('active', f === 'ulaeste');
    renderUserList();
}

// "I dag" / "I gaar" / dato til besked-separatorer og liste-tider
function chatDayLabel(d) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((that - today) / 86400000);
    if (diff === 0) return 'I dag';
    if (diff === -1) return 'I går';
    return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
}

function chatTimeLabel(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return chatDayLabel(d) + ' ' + d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
}

// "3 kolleger online · X ulaeste beskeder"
function updateChatPageSubtitle() {
    const el = document.getElementById('chatPageSubtitle');
    if (!el) return;
    const online = users.filter(u => u.online).length;
    let unread = 0;
    for (const k in unreadCounts) unread += unreadCounts[k] || 0;
    el.textContent = online + ' kolleger online' + (unread > 0 ? ' · ' + unread + ' ulæste beskeder' : '');
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
                avatar: u.avatar_url || '',
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

// Avatar HTML: profilbillede hvis det findes, ellers initialer i stabil personlig farve
const AVATAR_COLORS = ['#7fc4f0', '#7ddc9a', '#f2938c', '#b7a3f5', '#5ecfc2', '#f2a3c0', '#f5c26b'];

function avatarColor(id) {
    return AVATAR_COLORS[Math.abs(Number(id === undefined ? 0 : id)) % AVATAR_COLORS.length];
}

function avatarHtml(user, extraClass) {
    const cls = extraClass || '';
    if (user && user.avatar) {
        return `<div class="user-avatar-small ${cls}"><img class="avatar-img" src="${escapeHtml(user.avatar)}" alt=""><div class="status-dot ${user.status || ''}"></div></div>`;
    }
    const uid = user ? (user.id !== undefined ? user.id : user.peerId) : undefined;
    const color = avatarColor(uid);
    const init = user && user.initials ? user.initials : '?';
    return `<div class="user-avatar-small ${cls}" style="background:${color};"><span class="avatar-init">${init}</span><div class="status-dot ${user && user.status ? user.status : ''}"></div></div>`;
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
            const isMine = m.sender_id === (myId || (window.currentUser ? window.currentUser.id : null));
            storeMessage(m);
            // Opdater forhandsvisning i samtalelisten
            const conv = convList.find(c => c.id === m.conversation_id);
            if (conv) {
                conv.last_message = m;
            } else {
                convList.unshift({ id: m.conversation_id, peer: null, last_message: m, unread: 0 });
            }
            if (!isMine && m.conversation_id === currentConversationId && currentChatUser) {
                renderMessages();
                markConversationRead();
            } else if (!isMine) {
                unreadCounts[m.conversation_id] = (unreadCounts[m.conversation_id] || 0) + 1;
                renderUserList();
                updateChatMenuBadge();
                // Toast: find afsender (peer) for samtalen
                const convId = m.conversation_id;
                const peerEntry = Object.keys(conversationByPeer).find(k => conversationByPeer[k] === convId);
                const peerUser = peerEntry ? users.find(u => u.id === Number(peerEntry)) : null;
                showChatToast(m.sender_name || (peerUser ? peerUser.name : 'Ny besked'), m.body, peerUser ? peerUser.id : null);
            } else {
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
            const bubble = document.getElementById('chatTypingBubble');
            if (d.typing) {
                if (el) { el.textContent = 'skriver...'; el.style.color = 'var(--text-muted)'; }
                if (bubble) bubble.style.display = 'flex';
                clearTimeout(typingStatusTimer);
                typingStatusTimer = setTimeout(updateChatHeaderStatus, 3000);
            } else {
                clearTimeout(typingStatusTimer);
                if (bubble) bubble.style.display = 'none';
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
        ts: new Date(m.created_at).getTime(),
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
        unreadCounts[currentConversationId] = 0;
        updateChatMenuBadge();
    } catch (error) { /* proeves igen naeste gang */ }
}

// Global badge: menu ("Chat & Video") + profilbillede i top-hjornet
function updateChatMenuBadge() {
    let total = 0;
    for (const k in unreadCounts) total += unreadCounts[k] || 0;
    const label = total > 9 ? '9+' : (total > 0 ? String(total) : '');

    const menuBadge = document.getElementById('chatMenuBadge');
    if (menuBadge) {
        if (total > 0) { menuBadge.textContent = label; menuBadge.style.display = 'flex'; }
        else { menuBadge.style.display = 'none'; }
    }
    const avatarBadge = document.getElementById('navAvatarBadge');
    if (avatarBadge) {
        if (total > 0) { avatarBadge.textContent = label; avatarBadge.style.display = 'flex'; }
        else { avatarBadge.style.display = 'none'; }
    }
}

// Saet SSE + presence op saa snart dashboardet er loadet (ikke kun paa chat-siden),
// saa ulaeste-badge i menuen virker overalt.
if (typeof window !== 'undefined' && !window._chatAutoInit) {
    window._chatAutoInit = true;
    const startChatBackground = () => {
        if (sessionStorage.getItem('token')) initChat();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startChatBackground);
    } else {
        startChatBackground();
    }
}

// Render bruger liste: kontaktrække + samtaleliste med forhandsvisning
function renderUserList() {
    renderContactsStrip();

    const userList = document.getElementById('userList');
    if (!userList) return;

    const query = (document.getElementById('userSearch') && document.getElementById('userSearch').value || '').toLowerCase();

    // Byg liste-indsaeg: samtaler (med preview) + kolleger uden samtale
    const items = [];

    for (const c of convList) {
        if (!c.peer) continue;
        const user = users.find(u => u.id === c.peer.id);
        const name = c.peer.name || '';
        if (query && !name.toLowerCase().includes(query)) continue;
        const unread = unreadCounts[c.id] || 0;
        if (chatFilter === 'ulaeste' && unread === 0) continue;
        items.push({
            convId: c.id,
            peerId: c.peer.id,
            name: name,
            initials: user ? user.initials : getInitials(name),
            avatar: user ? user.avatar : '',
            status: user ? user.status : 'offline',
            online: c.peer_online,
            lastSeenAt: c.peer.last_seen_at || '',
            preview: c.last_message ? ((c.last_message.sender_id === myId ? 'Dig: ' : '') + (c.last_message.body || '')) : '',
            time: c.last_message ? chatTimeLabel(c.last_message.created_at) : '',
            unread: unread
        });
    }

    for (const user of users) {
        if (conversationByPeer[user.id]) continue; // allerede via samtaleliste
        if (query && !user.name.toLowerCase().includes(query)) continue;
        items.push({
            convId: null,
            peerId: user.id,
            name: user.name,
            initials: user.initials,
            avatar: user.avatar,
            status: user.status,
            online: user.online,
            lastSeenAt: user.last_seen_at,
            preview: getStatusText(user),
            time: '',
            unread: 0
        });
    }

    userList.innerHTML = items.map(it => {
        const isActive = currentChatUser && currentChatUser.id === it.peerId ? 'active' : '';
        const unreadBadge = it.unread > 0 ? `<span class="chat-unread-badge">${it.unread > 9 ? '9+' : it.unread}</span>` : '';
        return `
            <div class="conv-item ${isActive}" onclick="openChatWith(${it.peerId})">
                ${avatarHtml(it)}
                <div class="conv-mid">
                    <div class="conv-name">${escapeHtml(it.name)}</div>
                    <div class="conv-preview">${escapeHtml(it.preview || '')}</div>
                </div>
                <div class="conv-right">
                    <div class="conv-time">${escapeHtml(it.time)}</div>
                    ${unreadBadge}
                </div>
            </div>
        `;
    }).join('');

    updateChatPageSubtitle();
}

// Kontaktraekke (avatarer m. status-dot) ovenover listen
function renderContactsStrip() {
    const strip = document.getElementById('chatContactsStrip');
    if (!strip) return;
    strip.innerHTML = users.map(user => `
        <div class="contact-chip" onclick="openChatWith(${user.id})" title="${escapeHtml(user.name)}">
            ${avatarHtml(user)}
            <div class="contact-name">${escapeHtml(user.name.split(' ')[0])}</div>
        </div>
    `).join('');
}

// Video-knap i chathjornet (nuvaerende samtalepartner)
function startVideoCallCurrent() {
    if (currentChatUser) startVideoCall(currentChatUser.id, currentChatUser.name);
}

// Toast nederst til hojre ved indgaende besked
function showChatToast(peerName, text, peerId) {
    let wrap = document.getElementById('chatToastWrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'chatToastWrap';
        document.body.appendChild(wrap);
    }
    const peer = users.find(u => u.id === peerId) || null;
    const toast = document.createElement('div');
    toast.className = 'chat-toast';
    toast.innerHTML = `
        ${peer ? avatarHtml(peer, 'chat-toast-avatar-wrap') : `<div class="chat-toast-avatar">${getInitials(peerName)}</div>`}
        <div class="chat-toast-mid">
            <div class="chat-toast-name">${escapeHtml(peerName)}</div>
            <div class="chat-toast-text">${escapeHtml(text)}</div>
        </div>
        <div class="chat-toast-close" title="Luk">✕</div>
    `;
    toast.querySelector('.chat-toast-close').addEventListener('click', function (e) {
        e.stopPropagation();
        toast.remove();
    });
    toast.addEventListener('click', function () {
        toast.remove();
        if (typeof showPage === 'function') showPage('chat');
        openChatWith(peerId);
    });
    wrap.appendChild(toast);
    setTimeout(() => { toast.classList.add('fade-out'); }, 5200);
    setTimeout(() => { toast.remove(); }, 5600);
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

    document.getElementById('chatUserAvatar').innerHTML = user.avatar
        ? `<img class="avatar-img" src="${escapeHtml(user.avatar)}" alt="">`
        : `<span class="avatar-init">${user.initials}</span>`;
    document.getElementById('chatUserAvatar').style.background = user.avatar ? '' : avatarColor(user.id);
    document.getElementById('chatUserName').textContent = user.name;
    updateChatHeaderStatus();
    const typingBubble = document.getElementById('chatTypingBubble');
    if (typingBubble) typingBubble.style.display = 'none';

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
        updateChatMenuBadge();

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

// Lav http(s)-links klikbare (teksten er allerede HTML-escapet)
function linkifyText(escaped) {
    return escaped.replace(/(https?:\/\/[^\s<]+)/g, function (url) {
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
}

// Render beskeder
function renderMessages() {
    if (!currentChatUser || !currentConversationId) return;

    const messages = chatStore[currentConversationId] || [];
    const container = document.getElementById('chatMessages');
    if (!container) return;

    if (messages.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">Ingen beskeder endnu. Send den første!</div>';
        return;
    }

    let html = '';
    let lastDay = '';

    messages.forEach(msg => {
        // Dato-separator: "I dag" / "I gaar" / dato
        const day = msg.ts ? chatDayLabel(new Date(msg.ts)) : '';
        if (day && day !== lastDay) {
            lastDay = day;
            html += `<div class="chat-date-separator"><span>${day}</span></div>`;
        }

        const isOwn = msg.from === 'me';
        // "Læst" paa den sidste egen besked, hvis modtageren har laest den
        const isLastOwn = isOwn && !messages.slice(messages.indexOf(msg) + 1).some(m => m.from === 'me');
        const seen = isLastOwn && msg.id && (peerRead[currentConversationId] || 0) >= msg.id;
        const meta = `
            <div class="message-time">${msg.time}${seen ? ' <span class="message-seen">✓ Læst</span>' : ''}</div>
        `;
        html += `
            <div class="message ${isOwn ? 'own' : ''}">
                <div class="message-bubble">
                    <div>${linkifyText(escapeHtml(msg.text))}</div>
                    ${meta}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
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
        const url = 'https://meet.jit.si/' + room;
        window.open(url, '_blank');
        // Del linket i samtalen, sa modtageren kan joine direkte
        try {
            const response = await fetch('/api/chat/messages', {
                method: 'POST',
                headers: chatAuthHeaders(),
                body: JSON.stringify({ conversationId: convId, body: '🎥 Videoopkald started: ' + url })
            });
            if (response.ok) {
                const msg = await response.json();
                storeMessage(msg);
                if (currentConversationId === convId) renderMessages();
            }
        } catch (e) { /* linket er stadig aabnet */ }
    } catch (error) {
        alert('Videoopkald kunne ikke startes');
    }
}
