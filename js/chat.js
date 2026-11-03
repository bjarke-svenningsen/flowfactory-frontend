// Chat & Video - REST + SSE + WebRTC (egen signalering, Socket.IO/Jitsi fjernet)
let users = [];                  // presence-liste fra /api/chat/presence
let currentChatUser = null;      // aktiv peer { id, name, position, online, last_seen_at, avatar_url }
let currentConversationId = null;
const chatStore = {};            // conversationId -> [beskeder]
const conversationByPeer = {};   // peerUserId -> conversationId
let sse = null;
let myId = null;
const unreadCounts = {};         // conversationId -> antal ulaeste
const peerRead = {};             // conversationId -> modtagers sidst laeste besked-id
let typingTimer = null;
let typingThrottle = 0;
let typingStatusTimer = null;
let typingHideTimer = null;
let chatFilter = 'alle';         // 'alle' | 'ulaeste' | 'online'
let convList = [];
let chatSoundOn = true;

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

// --- Personlige avatar-farver (stabile pr. bruger-id) ---
const AVATAR_COLORS = [
    ['#2D6CDF', '#1B4DBF'], ['#0E9F6E', '#0B7A54'], ['#B7791F', '#8F5E0F'],
    ['#805AD5', '#5F3DB0'], ['#C05621', '#963F12'], ['#3182CE', '#2563AE'],
    ['#D53F8C', '#AB2E70'], ['#38A169', '#2C7F52'], ['#718096', '#5A6472']
];
function avatarColor(id) {
    const key = Number(id) || 0;
    return AVATAR_COLORS[Math.abs(key) % AVATAR_COLORS.length];
}
function getInitials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    let s = (parts[0] || '?').charAt(0);
    if (parts.length > 1) s += parts[parts.length - 1].charAt(0);
    return s.toUpperCase();
}
function avatarHtml(user, extraClass) {
    const id = user && (user.peerId != null ? user.peerId : user.id);
    const name = (user && user.name) || '?';
    const url = user && user.avatar_url;
    if (url) {
        return '<img class="user-avatar-small ' + (extraClass || '') + '" src="' + escapeHtml(url) + '" alt="' + escapeHtml(name) + '">';
    }
    const c = avatarColor(id);
    return '<div class="user-avatar-small ' + (extraClass || '') + '" style="background: linear-gradient(135deg, ' + c[0] + ', ' + c[1] + ');">' + escapeHtml(getInitials(name)) + '</div>';
}

// --- Tids-hjaelpere ---
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
function chatLastSeenLabel(u) {
    if (!u || !u.last_seen_at) return 'Sidst set for længe siden';
    const d = new Date(u.last_seen_at.replace(' ', 'T'));
    if (isNaN(d)) return 'Sidst set for længe siden';
    return 'Sidst set ' + chatTimeLabel(u.last_seen_at);
}

// --- Diskret lyd (WebAudio, kan slaas fra) ---
let _chatAudioCtx = null;
function chatBeep(frequency, duration, delay) {
    if (!chatSoundOn) return;
    try {
        _chatAudioCtx = _chatAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const ctx = _chatAudioCtx;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        const t0 = ctx.currentTime + (delay || 0);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + duration + 0.05);
    } catch (e) { /* lyd er valgfri */ }
}
function chatMessageSound() { chatBeep(880, 0.15); chatBeep(660, 0.18, 0.18); }
function chatRingSound() {
    for (let i = 0; i < 6; i++) { chatBeep(520, 0.22, i * 1.1); chatBeep(700, 0.22, i * 1.1 + 0.3); }
}
function chatRingStop() { /* tonerne er korte og stopper af sig selv */ }
function toggleChatSound() {
    chatSoundOn = !chatSoundOn;
    try { localStorage.setItem('chatSound', chatSoundOn ? '1' : '0'); } catch (e) { /* privat tilstand */ }
    const lbl = document.getElementById('chatSoundMenuLabel');
    if (lbl) lbl.textContent = 'Lyd: ' + (chatSoundOn ? 'til' : 'fra');
    closeChatMenu();
}
(function initChatSoundPref() {
    try { chatSoundOn = localStorage.getItem('chatSound') !== '0'; } catch (e) { /* default til */ }
})();

// --- Fanetitel, sidebar-badge og klokke-badge ---
function totalChatUnread() {
    let n = 0;
    for (const k in unreadCounts) n += unreadCounts[k] || 0;
    return n;
}
function updateChatBadges() {
    const n = totalChatUnread();
    const badge = document.getElementById('chatMenuBadge');
    if (badge) { badge.textContent = n > 99 ? '99+' : n; badge.style.display = n > 0 ? 'flex' : 'none'; }
    const bell = document.getElementById('chatBellBadge');
    if (bell) { bell.textContent = n > 99 ? '99+' : n; bell.style.display = n > 0 ? 'flex' : 'none'; }
    document.title = n > 0 ? '(' + n + ') SG Seest Portal' : 'SG Seest Gulvteknik - Dashboard';
}
// --- Init (koeres globalt ved login - SSE + notifikationer paa alle sider) ---
async function initChat() {
    if (window._chatInited) return;
    window._chatInited = true;
    await loadPresence();
    await loadConversations();
    connectChatSse();
    if (!window._chatPresenceTimer) {
        window._chatPresenceTimer = setInterval(loadPresence, 30000);
    }
}

// v106.6e: initChat koerer foer chat-siden findes i DOM (guard _chatInited
// saetter aldrig re-render). Derfor kaldes denne hver gang Chat & Video-siden
// loades - den henter friske data og render listen i det nu eksisterende DOM.
async function refreshChatPage() {
    await loadPresence();
    await loadConversations();
}
window.refreshChatPage = refreshChatPage;

// --- Presence ---
async function loadPresence() {
    try {
        const response = await fetch('/api/chat/presence', { headers: chatAuthHeaders() });
        if (!response.ok) return;
        users = await response.json();
        users.forEach(u => { u.peerId = u.id; });
        renderUserList();
        renderContactsStrip();
        updateChatHeaderStatus();
        updateChatPageSubtitle();
    } catch (error) { /* proever igen paa timer */ }
}

// --- Samtaleliste ---
async function loadConversations() {
    try {
        const response = await fetch('/api/chat/conversations', { headers: chatAuthHeaders() });
        if (!response.ok) return;
        convList = await response.json();
        for (const c of convList) {
            unreadCounts[c.id] = c.unread || 0;
            peerRead[c.id] = c.peer_last_read || 0;
            if (c.peer) { c.peer.peerId = c.peer.id; conversationByPeer[c.peer.id] = c.id; }
        }
        renderUserList();
        updateChatBadges();
        updateChatPageSubtitle();
    } catch (error) { /* listoen proever igen naeste gang */ }
}

function openChatFromBell() {
    if (typeof showPage === 'function') showPage('chat');
    const conv = convList.find(c => (unreadCounts[c.id] || 0) > 0 && c.peer);
    if (conv && conv.peer) setTimeout(function () { openChatWith(conv.peer.id); }, 150);
}

function setChatFilter(f) {
    chatFilter = f;
    const ids = { alle: 'chatChipAlle', ulaeste: 'chatChipUlaeste', online: 'chatChipOnline' };
    for (const key in ids) {
        const el = document.getElementById(ids[key]);
        if (el) el.classList.toggle('active', key === f);
    }
    renderUserList();
}

function filterUsers() { renderUserList(); }
// --- Render: samtaleliste ---
function renderUserList() {
    const list = document.getElementById('userList');
    if (!list) return;
    const q = (document.getElementById('userSearch') ? document.getElementById('userSearch').value : '').toLowerCase().trim();
    let rows = users.filter(u => u.id !== myId);
    if (q) rows = rows.filter(u => (u.name || '').toLowerCase().includes(q) || (u.position || '').toLowerCase().includes(q));
    if (chatFilter === 'ulaeste') {
        const ids = convList.filter(c => (unreadCounts[c.id] || 0) > 0 && c.peer).map(c => c.peer.id);
        rows = rows.filter(u => ids.includes(u.id));
    } else if (chatFilter === 'online') {
        rows = rows.filter(u => u.online);
    }
    rows.sort(function (a, b) {
        const ua = unreadCounts[conversationByPeer[a.id]] || 0;
        const ub = unreadCounts[conversationByPeer[b.id]] || 0;
        if (chatFilter === 'alle' && ub !== ua) return ub - ua;
        const ca = convList.find(c => c.peer && c.peer.id === a.id);
        const cb = convList.find(c => c.peer && c.peer.id === b.id);
        const ta = ca && ca.last_message ? ca.last_message.id : 0;
        const tb = cb && cb.last_message ? cb.last_message.id : 0;
        if (tb !== ta) return tb - ta;
        return (b.online === true) - (a.online === true) || (a.name || '').localeCompare(b.name || '');
    });
    let html = '';
    for (const u of rows) {
        const convId = conversationByPeer[u.id];
        const conv = convList.find(c => c.peer && c.peer.id === u.id);
        const unread = convId ? (unreadCounts[convId] || 0) : 0;
        const last = conv && conv.last_message ? conv.last_message : null;
        let preview = '';
        let timeHtml = '';
        if (last) {
            preview = last.is_system ? last.body : (((last.sender_id === myId) ? 'Dig: ' : '') + last.body);
            preview = escapeHtml(String(preview).slice(0, 60));
            timeHtml = '<div class="conv-time">' + escapeHtml(chatTimeLabel(last.created_at)) + '</div>';
        }
        html += '<div class="conv-item' + (unread > 0 ? ' has-unread' : '') + (currentChatUser && currentChatUser.id === u.id ? ' selected' : '') + '"' +
            ' onclick="openChatWith(' + Number(u.id) + ')">' +
            '<div class="conv-avatar-wrap">' + avatarHtml(u) +
            '<span class="status-dot' + (u.online ? ' online' : '') + '"></span>' +
            (unread > 0 ? '<span class="conv-unread-badge">' + (unread > 99 ? '99+' : unread) + '</span>' : '') +
            '</div>' +
            '<div class="conv-text"><div class="conv-name">' + escapeHtml(u.name || '') + '</div>' +
            '<div class="conv-preview' + (unread > 0 ? ' unread' : '') + '">' + (preview || '<span style="opacity:.6">Start en samtale</span>') + '</div></div>' +
            timeHtml + '</div>';
    }
    list.innerHTML = html || '<div class="chat-empty-note">' + (chatFilter === 'ulaeste' ? 'Ingen ulæste beskeder' : (chatFilter === 'online' ? 'Ingen er online lige nu' : 'Ingen kontakter fundet')) + '</div>';
}

function renderContactsStrip() {
    const strip = document.getElementById('chatContactsStrip');
    if (!strip) return;
    const online = users.filter(u => u.id !== myId && u.online);
    if (online.length === 0) { strip.innerHTML = '<div class="strip-empty">Ingen online lige nu</div>'; return; }
    strip.innerHTML = online.map(u =>
        '<div class="contact-chip" title="' + escapeHtml(u.name) + '" onclick="openChatWith(' + Number(u.id) + ')">' +
        avatarHtml(u) + '<span class="status-dot online"></span></div>'
    ).join('');
}

// "3 kolleger online · X ulaeste beskeder"
function updateChatPageSubtitle() {
    const el = document.getElementById('chatPageSubtitle');
    if (!el) return;
    const online = users.filter(u => u.online && u.id !== myId).length;
    const unread = totalChatUnread();
    el.textContent = online + ' kolleger online' + (unread > 0 ? ' · ' + unread + ' ulæste beskeder' : '') + ' · Forbindelse: ' + (sse && sse.readyState === 1 ? 'aktiv' : 'venter');
}
// --- Aabn/luk samtale ---
async function openChatWith(userId) {
    const u = users.find(x => x.id === userId);
    currentChatUser = u || { id: userId, name: '?', online: false, avatar_url: '' };
    renderChatHeader();
    document.getElementById('noChatSelected').style.display = 'none';
    document.getElementById('chatActive').style.display = 'flex';
    document.getElementById('chatMessages').innerHTML = '<div class="chat-loading">Indlæser...</div>';
    let convId = conversationByPeer[userId];
    if (!convId) {
        try {
            const response = await fetch('/api/chat/conversations', { method: 'POST', headers: chatAuthHeaders(), body: JSON.stringify({ peerId: userId }) });
            if (response.ok) {
                const data = await response.json();
                convId = data.conversationId;
                conversationByPeer[userId] = convId;
            }
        } catch (e) { /* netvaerk */ }
    }
    if (!convId) { currentConversationId = null; renderUserList(); return; }
    currentConversationId = convId;
    await loadHistory(convId);
    markConversationRead();
    renderMessages();
    renderUserList();
    const input = document.getElementById('chatInput');
    if (input && window.innerWidth >= 700) input.focus();
}

function closeChat() {
    currentConversationId = null;
    currentChatUser = null;
    const active = document.getElementById('chatActive');
    const none = document.getElementById('noChatSelected');
    if (active) active.style.display = 'none';
    if (none) none.style.display = 'flex';
    closeChatMenu();
    renderUserList();
}

function startVideoCallCurrent() {
    if (currentChatUser) {
        closeChatMenu();
        if (window.ChatCall) ChatCall.start(currentChatUser.id, currentChatUser.name, currentConversationId, users.find(u => u.id === currentChatUser.id));
    }
}

function renderChatHeader() {
    const u = currentChatUser || {};
    const wrap = document.getElementById('chatUserAvatar');
    if (wrap) {
        const tmp = document.createElement('div');
        tmp.innerHTML = avatarHtml(u);
        const node = tmp.firstChild;
        if (node) { node.id = 'chatUserAvatar'; wrap.outerHTML = node.outerHTML; }
    }
    const nameEl = document.getElementById('chatUserName');
    if (nameEl) nameEl.textContent = u.name || '';
    updateChatHeaderStatus();
}

function updateChatHeaderStatus() {
    if (!currentChatUser) return;
    const u = users.find(x => x.id === currentChatUser.id) || currentChatUser;
    const el = document.getElementById('chatUserStatus');
    if (!el) return;
    if (u.online) {
        el.textContent = 'Online';
        el.classList.add('online');
    } else {
        el.textContent = chatLastSeenLabel(u);
        el.classList.remove('online');
    }
}
// --- Historik + beskedlager ---
async function loadHistory(convId) {
    if (chatStore[convId]) return;
    try {
        const response = await fetch('/api/chat/conversations/' + convId + '/messages', { headers: chatAuthHeaders() });
        if (!response.ok) return;
        chatStore[convId] = await response.json();
    } catch (e) { chatStore[convId] = chatStore[convId] || []; }
}

function storeMessage(msg) {
    const convId = msg.conversation_id;
    if (!chatStore[convId]) chatStore[convId] = [];
    chatStore[convId].push(msg);
    const conv = convList.find(c => c.id === convId);
    if (conv) conv.last_message = msg;
}

// --- Render beskeder ---
function renderMessages() {
    const box = document.getElementById('chatMessages');
    if (!box || !currentConversationId) return;
    const msgs = chatStore[currentConversationId] || [];
    let html = '';
    let lastDay = '';
    for (const m of msgs) {
        const d = new Date(String(m.created_at).replace(' ', 'T'));
        const day = isNaN(d) ? '' : chatDayLabel(d);
        if (day && day !== lastDay) {
            html += '<div class="chat-date-separator"><span>' + escapeHtml(day) + '</span></div>';
            lastDay = day;
        }
        if (m.is_system) {
            html += '<div class="chat-system-msg">' + escapeHtml(m.body) + ' · ' + escapeHtml(chatTimeLabel(m.created_at)) + '</div>';
            continue;
        }
        const mine = m.sender_id === myId;
        html += '<div class="chat-msg-row ' + (mine ? 'mine' : 'theirs') + '">' +
            (mine ? '' : avatarHtml({ id: m.sender_id, name: m.sender_name, avatar_url: '' })) +
            '<div class="chat-bubble ' + (mine ? 'mine' : '') + '">' +
            '<div class="chat-msg-text">' + escapeHtml(m.body) + '</div>' +
            '<div class="chat-msg-meta">' + escapeHtml(chatTimeLabel(m.created_at).split(' ').pop()) +
            (mine && m.id <= (peerRead[currentConversationId] || 0) ? ' <span class="chat-read-check">✓✓</span>' : (mine ? ' <span class="chat-sent-check">✓</span>' : '')) +
            '</div></div></div>';
    }
    box.innerHTML = html || '<div class="chat-empty-note">Ingen beskeder endnu - skriv den første</div>';
    box.scrollTop = box.scrollHeight;
}
// --- Send ---
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const body = (input.value || '').trim();
    if (!body || !currentConversationId) return;
    input.value = '';
    autoGrowTextarea();
    try {
        const response = await fetch('/api/chat/messages', {
            method: 'POST', headers: chatAuthHeaders(),
            body: JSON.stringify({ conversationId: currentConversationId, body: body })
        });
        if (response.ok) {
            const msg = await response.json();
            storeMessage(msg);
            renderMessages();
            sendTyping(false);
        }
    } catch (e) { /* proev igen ved naeste send */ }
}

function autoGrowTextarea() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

// --- "Skriver..." ---
function handleTyping() {
    const now = Date.now();
    if (now - typingThrottle > 2000) {
        typingThrottle = now;
        sendTyping(true);
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(function () { sendTyping(false); }, 2500);
}

function sendTyping(typing) {
    if (!currentConversationId) return;
    clearTimeout(typingStatusTimer);
    if (typing) {
        typingStatusTimer = setTimeout(function () { sendTyping(false); }, 4000);
    }
    fetch('/api/chat/typing', {
        method: 'POST', headers: chatAuthHeaders(),
        body: JSON.stringify({ conversationId: currentConversationId, typing: typing })
    }).catch(function () { /* ignoreres */ });
}

function showTypingBubble(convId, show) {
    const el = document.getElementById('chatTypingBubble');
    if (!el) return;
    if (show && convId === currentConversationId) {
        el.style.display = 'flex';
        clearTimeout(typingHideTimer);
        typingHideTimer = setTimeout(function () { el.style.display = 'none'; }, 5000);
    } else if (!show) {
        el.style.display = 'none';
    }
}

// --- Markoer laest ---
function markConversationRead() {
    const convId = currentConversationId;
    if (!convId || !(unreadCounts[convId] > 0)) return;
    unreadCounts[convId] = 0;
    updateChatBadges();
    renderUserList();
    updateChatPageSubtitle();
    fetch('/api/chat/read', {
        method: 'POST', headers: chatAuthHeaders(),
        body: JSON.stringify({ conversationId: convId })
    }).catch(function () { /* ignoreres */ });
}

// --- Menu (tre prikker) ---
function toggleChatMenu(ev) {
    if (ev) ev.stopPropagation();
    const menu = document.getElementById('chatMenu');
    if (!menu) return;
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
function closeChatMenu() {
    const menu = document.getElementById('chatMenu');
    if (menu) menu.style.display = 'none';
}
document.addEventListener('click', function () { closeChatMenu(); });

// --- Browsernotifikation (spoerger KUN ved klik) ---
function enableChatNotifications() {
    closeChatMenu();
    if (!('Notification' in window)) { alert('Din browser understøtter ikke notifikationer.'); return; }
    if (Notification.permission === 'granted') { alert('Browsernotifikationer er allerede slået til.'); return; }
    Notification.requestPermission().then(function (perm) {
        if (perm === 'granted') {
            try { new Notification('SG Seest Portal', { body: 'Notifikationer er nu slået til.' }); } catch (e) { /* ignoreret */ }
        }
    });
}
// --- Toast ---
function ensureChatToastWrap() {
    let wrap = document.getElementById('chatToastWrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'chatToastWrap';
        wrap.className = 'chat-toast-wrap';
        document.body.appendChild(wrap);
    }
    return wrap;
}

function showChatToast(peerName, text, peerId) {
    const wrap = ensureChatToastWrap();
    const u = users.find(x => x.id === peerId) || {};
    const toast = document.createElement('div');
    toast.className = 'chat-toast';
    toast.innerHTML = avatarHtml(u) +
        '<div class="chat-toast-text"><div class="chat-toast-name">' + escapeHtml(peerName) + '</div>' +
        '<div class="chat-toast-msg">' + escapeHtml(String(text).slice(0, 80)) + '</div></div>';
    toast.onclick = function () {
        if (typeof showPage === 'function') showPage('chat');
        setTimeout(function () { openChatWith(peerId); }, 150);
        toast.remove();
    };
    wrap.appendChild(toast);
    setTimeout(function () { toast.classList.add('fade'); }, 4600);
    setTimeout(function () { toast.remove(); }, 5000);
}

// --- SSE ---
async function connectChatSse() {
    if (!sessionStorage.getItem('token')) return;
    if (sse && sse.readyState === 1) return; // allerede forbundet
    try {
        const response = await fetch('/api/chat/events-ticket', { method: 'POST', headers: chatAuthHeaders() });
        if (!response.ok) { setTimeout(connectChatSse, 5000); return; }
        const data = await response.json();
        sse = new EventSource('/api/chat/events?ticket=' + encodeURIComponent(data.ticket));
        sse.addEventListener('connected', function (ev) {
            try { myId = JSON.parse(ev.data).userId; } catch (e) { /* ignoreres */ }
        });
        sse.addEventListener('chat_message', function (ev) {
            try { handleIncomingMessage(JSON.parse(ev.data)); } catch (e) { /* ignoreres */ }
        });
        sse.addEventListener('chat_read', function (ev) {
            try {
                const d = JSON.parse(ev.data);
                peerRead[d.conversationId] = d.lastReadMessageId;
                if (d.conversationId === currentConversationId) renderMessages();
            } catch (e) { /* ignoreres */ }
        });
        sse.addEventListener('chat_typing', function (ev) {
            try {
                const d = JSON.parse(ev.data);
                if (d.userId !== myId) showTypingBubble(d.conversationId, !!d.typing);
            } catch (e) { /* ignoreres */ }
        });
        sse.addEventListener('chat_presence', function (ev) {
            try {
                const ids = JSON.parse(ev.data);
                for (const u of users) u.online = ids.indexOf(u.id) !== -1;
                renderUserList();
                renderContactsStrip();
                updateChatHeaderStatus();
                updateChatPageSubtitle();
                // Giv opkaldsmodulet besked hvis modparten forsvandt midt i et opkald
                if (window.ChatCall && ChatCall.onPresence) ChatCall.onPresence(ids);
            } catch (e) { /* ignoreres */ }
        });
        sse.addEventListener('chat_ping', function () {
            console.log('[call] SSE ping modtaget fra serveren');
        });
        sse.addEventListener('chat_signal', function (ev) {
            try {
                console.log('[call] SSE chat_signal modtaget');
                if (window.ChatCall) ChatCall.onSignal(JSON.parse(ev.data));
            } catch (e) { console.error('[call] fejl i chat_signal:', e); }
        });
        sse.onerror = function () {
            // Ticket er engangs - genopret med en ny ticket i stedet for auto-reconnect
            try { sse.close(); } catch (e) { /* allerede lukket */ }
            setTimeout(connectChatSse, 3000);
        };
    } catch (e) {
        setTimeout(connectChatSse, 5000);
    }
}

// Ny besked: opdater alt + toast/lyd/notifikation hvis samtalen ikke ses
function handleIncomingMessage(msg) {
    storeMessage(msg);
    const convId = msg.conversation_id;
    const isCurrent = convId === currentConversationId && document.hasFocus() && currentChatUser && currentChatUser.id === msg.sender_id;
    if (isCurrent) {
        renderMessages();
        markConversationRead();
    } else if (!msg.is_system) {
        unreadCounts[convId] = (unreadCounts[convId] || 0) + 1;
    }
    updateChatBadges();
    renderUserList();
    updateChatPageSubtitle();
    if (msg.is_system || msg.sender_id === myId) return;
    if (!isCurrent) {
        showChatToast(msg.sender_name, msg.body, msg.sender_id);
        chatMessageSound();
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification(msg.sender_name, { body: String(msg.body).slice(0, 120), tag: 'chat-' + msg.id }); } catch (e) { /* ignoreres */ }
        }
    }
}

// Genindlaes ulaeste-tal ved fokus (flere faner/enheder)
window.addEventListener('focus', function () { loadConversations(); });
window.addEventListener('beforeunload', function () {
    if (window.ChatCall) try { ChatCall.cleanupOnUnload(); } catch (e) { /* ignoreres */ }
});

// ===== Emoji-vaelger =====
var CHAT_EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤔','😴','😢','😭','😡','🥳','🙃','😇','👍','👎','👏','🙏','💪','🤝','✌️','👋','❤️','🔥','⭐','🎉','🎂','☕','🍕','⚽'];
var _emojiGridInited = false;

function toggleEmojiPicker(ev) {
    if (ev) ev.stopPropagation();
    var picker = document.getElementById('emojiPicker');
    if (!picker) return;
    var show = picker.style.display === 'none';
    if (show && !_emojiGridInited) {
        var grid = document.getElementById('emojiGrid');
        if (grid) {
            grid.innerHTML = CHAT_EMOJIS.map(function (e) {
                return '<span class="emoji-item" onclick="insertEmoji(\'' + e + '\')">' + e + '</span>';
            }).join('');
            _emojiGridInited = true;
        }
    }
    picker.style.display = show ? 'block' : 'none';
}

function insertEmoji(emoji) {
    var input = document.getElementById('chatInput');
    if (!input) return;
    var start = input.selectionStart !== null ? input.selectionStart : input.value.length;
    var end = input.selectionEnd !== null ? input.selectionEnd : input.value.length;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    input.focus();
    var pos = start + emoji.length;
    try { input.setSelectionRange(pos, pos); } catch (e) { /* ignoreres */ }
    autoGrowTextarea();
}

// Luk emoji-vaelger ved klik udenfor
document.addEventListener('click', function (ev) {
    var picker = document.getElementById('emojiPicker');
    if (!picker || picker.style.display === 'none') return;
    if (ev.target && ev.target.closest && (ev.target.closest('#emojiPicker') || ev.target.closest('#chatEmojiBtn'))) return;
    picker.style.display = 'none';
});

