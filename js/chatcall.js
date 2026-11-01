// ChatCall - 1-til-1 WebRTC-videoopkald i flydende vindue (egen signalering over SSE)
window.ChatCall = (function () {
    'use strict';

    let pc = null;               // RTCPeerConnection
    let localStream = null;
    let state = 'idle';          // idle | ringing | incoming | connecting | active
    let role = null;             // caller | callee
    let peerId = null;
    let peerName = '';
    let conversationId = null;
    let callId = null;
    let micOn = true;
    let camOn = true;
    let connectedAt = 0;
    let pendingIce = [];
    let ringTimer = null;
    let connTimer = null;
    let ringInterval = null;
    let dockDrag = null;
    let dockResize = null;

    // --- Hjaelpere ---
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function authHeaders() {
        return {
            'Authorization': 'Bearer ' + (sessionStorage.getItem('token') || ''),
            'Content-Type': 'application/json'
        };
    }

    function info(msg) {
        const wrap = document.getElementById('chatToastWrap');
        if (!wrap) return;
        const t = document.createElement('div');
        t.className = 'chat-toast';
        t.innerHTML = '<div class="chat-toast-text"><div class="chat-toast-msg">' + esc(msg) + '</div></div>';
        wrap.appendChild(t);
        setTimeout(function () { t.remove(); }, 4200);
    }

    function signal(type, payload) {
        return fetch('/api/chat/signal', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ conversationId: conversationId, callId: callId, type: type, payload: payload })
        }).catch(function () { /* netvaerk */ });
    }

    function callLog(status, seconds) {
        if (!conversationId) return;
        fetch('/api/chat/call-log', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ conversationId: conversationId, status: status, seconds: seconds || 0 })
        }).catch(function () { /* netvaerk */ });
    }

    // --- Position/storrelse i localStorage (alle kald i try/catch, altid inde paa skaermen) ---
    const DOCK_W = 420, DOCK_H = 320;
    function loadDockRect() {
        let r = { x: 16, y: window.innerHeight - DOCK_H - 16, w: DOCK_W, h: DOCK_H };
        try {
            const s = localStorage.getItem('chatcall_rect');
            if (s) {
                const p = JSON.parse(s);
                if (p && p.w > 220 && p.h > 160) r = p;
            }
        } catch (e) { /* privat tilstand */ }
        return clampRect(r);
    }
    function clampRect(r) {
        const maxW = window.innerWidth - 12, maxH = window.innerHeight - 12;
        r.w = Math.min(Math.max(r.w, 220), Math.max(220, maxW));
        r.h = Math.min(Math.max(r.h, 160), Math.max(160, maxH));
        r.x = Math.min(Math.max(r.x, 4), Math.max(4, window.innerWidth - r.w - 4));
        r.y = Math.min(Math.max(r.y, 4), Math.max(4, window.innerHeight - r.h - 4));
        return r;
    }
    function saveDockRect(r) {
        try { localStorage.setItem('chatcall_rect', JSON.stringify(r)); } catch (e) { /* privat tilstand */ }
    }

    // --- Dock (flydende vindue) ---
    function ensureDock() {
        let dock = document.getElementById('videoDock');
        if (dock) return dock;
        dock = document.createElement('div');
        dock.id = 'videoDock';
        dock.innerHTML =
            '<div class="video-dock-header" id="vdHeader">' +
            '<span id="vdTitle">' + esc(peerName) + '</span>' +
            '<div class="vd-buttons">' +
            '<button id="vdMinBtn" title="Minimer"><i data-lucide="minus"></i></button>' +
            '<button id="vdCloseBtn" title="Læg på"><i data-lucide="x"></i></button>' +
            '</div></div>' +
            '<div class="video-dock-body" id="vdBody">' +
            '<video class="remote" id="vdRemote" autoplay playsinline></video>' +
            '<video class="local" id="vdLocal" autoplay playsinline muted></video>' +
            '<div class="video-dock-status" id="vdStatus"></div>' +
            '<div class="video-dock-error" id="vdError" style="display:none"></div>' +
            '</div>' +
            '<div class="video-dock-controls">' +
            '<button id="vdMicBtn" title="Mikrofon til/fra"><i data-lucide="mic"></i></button>' +
            '<button id="vdCamBtn" title="Kamera til/fra"><i data-lucide="video"></i></button>' +
            '<button class="hangup" id="vdHangupBtn" title="Læg på"><i data-lucide="phone-off"></i></button>' +
            '</div>' +
            '<div class="vd-resize" id="vdResize" title="Skalér"></div>';
        document.body.appendChild(dock);
        const r = loadDockRect();
        dock.style.left = r.x + 'px';
        dock.style.top = r.y + 'px';
        dock.style.width = r.w + 'px';
        dock.style.height = r.h + 'px';
        dock.style.display = 'flex';
        // Minimer til boble
        dock.querySelector('#vdMinBtn').addEventListener('click', function (e) {
            e.stopPropagation();
            dock.classList.add('minimized');
            dock.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">' + esc((peerName || '?').split(' ').map(function (p) { return p.charAt(0); }).join('').toUpperCase()) + '</div>';
            dock.onclick = function () { document.body.removeChild(dock); dock = null; ensureDock(); };
        });
        dock.querySelector('#vdCloseBtn').addEventListener('click', function () { hangup('ended'); });
        dock.querySelector('#vdHangupBtn').addEventListener('click', function () { hangup('ended'); });
        dock.querySelector('#vdMicBtn').addEventListener('click', toggleMic);
        dock.querySelector('#vdCamBtn').addEventListener('click', toggleCam);
        bindDrag(dock);
        bindResize(dock);
        window.addEventListener('resize', function () {
            if (!document.getElementById('videoDock')) return;
            const rect = clampRect(loadDockRect());
            dock.style.left = rect.x + 'px';
            dock.style.top = rect.y + 'px';
            dock.style.width = rect.w + 'px';
            dock.style.height = rect.h + 'px';
        });
        if (window.lucide && lucide.createIcons) try { lucide.createIcons(); } catch (e) { /* ignoreret */ }
        return dock;
    }

    function bindDrag(dock) {
        const header = dock.querySelector('#vdHeader');
        header.addEventListener('mousedown', function (e) {
            const rect = dock.getBoundingClientRect();
            dockDrag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
            function mv(e2) {
                if (!dockDrag) return;
                dock.style.left = (e2.clientX - dockDrag.dx) + 'px';
                dock.style.top = (e2.clientY - dockDrag.dy) + 'px';
            }
            function up() {
                if (dockDrag) saveDockRect(dock.getBoundingClientRect());
                dockDrag = null;
                document.removeEventListener('mousemove', mv);
                document.removeEventListener('mouseup', up);
            }
            document.addEventListener('mousemove', mv);
            document.addEventListener('mouseup', up);
        });
        header.addEventListener('dblclick', function () { /* reserveret */ });
    }

    function bindResize(dock) {
        const handle = dock.querySelector('#vdResize');
        handle.addEventListener('mousedown', function (e) {
            e.preventDefault();
            const rect = dock.getBoundingClientRect();
            dockResize = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
            function mv(e2) {
                if (!dockResize) return;
                dock.style.width = Math.max(220, dockResize.w + (e2.clientX - dockResize.x)) + 'px';
                dock.style.height = Math.max(160, dockResize.h + (e2.clientY - dockResize.y)) + 'px';
            }
            function up() {
                if (dockResize) saveDockRect(dock.getBoundingClientRect());
                dockResize = null;
                document.removeEventListener('mousemove', mv);
                document.removeEventListener('mouseup', up);
            }
            document.addEventListener('mousemove', mv);
            document.addEventListener('mouseup', up);
        });
    }

    function setStatus(text) {
        const el = document.getElementById('vdStatus');
        if (el) el.textContent = text || '';
    }

    function showError(text) {
        const el = document.getElementById('vdError');
        if (el) { el.textContent = text; el.style.display = 'flex'; }
    }

    // --- Indgaaende opkald-dialog (vises paa alle sider) ---
    function showIncoming() {
        const el = document.getElementById('incomingCall');
        if (!el) return;
        const av = document.getElementById('incomingCallAvatar');
        if (av) av.textContent = (peerName || '?').split(' ').map(function (p) { return p.charAt(0); }).join('').toUpperCase();
        document.getElementById('incomingCallName').textContent = peerName;
        document.getElementById('incomingCallText').textContent = 'Videoopkald...';
        el.style.display = 'flex';
        if (window.lucide && lucide.createIcons) try { lucide.createIcons(); } catch (e) { /* ignoreres */ }
        document.getElementById('incomingCallAccept').onclick = acceptCall;
        document.getElementById('incomingCallReject').onclick = rejectCall;
        // Ringelyd i 30 sekunder, automatisk ubesvaret bagefter
        stopRingInterval();
        ringInterval = setInterval(function () { if (window.chatRingSound) chatRingSound(); }, 2200);
        if (window.chatRingSound) chatRingSound();
        ringTimer = setTimeout(function () { autoMissed(); }, 30000);
    }

    function hideIncoming() {
        const el = document.getElementById('incomingCall');
        if (el) el.style.display = 'none';
        stopRingInterval();
        clearTimeout(ringTimer);
        if (window.chatRingStop) chatRingStop();
    }

    function stopRingInterval() {
        if (ringInterval) { clearInterval(ringInterval); ringInterval = null; }
    }

    // --- Media ---
    function getMedia() {
        const constraints = { video: true, audio: true };
        return navigator.mediaDevices.getUserMedia(constraints).catch(function (err) {
            // Kamera naegtet/fejlet: proev kun-lyd, og forklar paa dansk hvad der skete
            if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
                info('Kamera blokeret - prøver kun med lyd. Giv adgang til kamera i browserens indstillinger.');
            }
            return navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        });
    }

    function attachStreams() {
        const dock = ensureDock();
        const local = dock.querySelector('#vdLocal');
        const remote = dock.querySelector('#vdRemote');
        if (local && localStream) { local.srcObject = localStream; local.style.display = camOn ? 'block' : 'none'; }
        if (remote && pc && pc.getReceivers) {
            const s = new MediaStream();
            pc.getReceivers().forEach(function (r) { if (r.track) s.addTrack(r.track); });
            remote.srcObject = s;
        }
    }

    function toggleMic() {
        micOn = !micOn;
        if (localStream) localStream.getAudioTracks().forEach(function (t) { t.enabled = micOn; });
        const btn = document.getElementById('vdMicBtn');
        if (btn) btn.classList.toggle('off', !micOn);
    }

    function toggleCam() {
        camOn = !camOn;
        if (localStream) localStream.getVideoTracks().forEach(function (t) { t.enabled = camOn; });
        const btn = document.getElementById('vdCamBtn');
        const local = document.getElementById('vdLocal');
        if (btn) btn.classList.toggle('off', !camOn);
        if (local) local.style.display = camOn ? 'block' : 'none';
    }

    // --- RTCPeerConnection ---
    async function createPeer() {
        let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
        try {
            const r = await fetch('/api/chat/ice', { headers: authHeaders() });
            if (r.ok) iceServers = (await r.json()).iceServers || iceServers;
        } catch (e) { /* STUN-dafaults virker alene */ }
        pc = new RTCPeerConnection({ iceServers: iceServers });
        if (localStream) localStream.getTracks().forEach(function (t) { pc.addTrack(t, localStream); });
        pc.onicecandidate = function (e) {
            if (e.candidate) signal('ice', e.candidate);
        };
        pc.ontrack = function (e) {
            const remote = document.getElementById('vdRemote');
            if (remote && !remote.srcObject) remote.srcObject = e.streams[0] || new MediaStream([e.track]);
        };
        pc.onconnectionstatechange = function () {
            if (pc && (pc.connectionState === 'connected')) {
                connectedAt = Date.now();
                state = 'active';
                clearTimeout(connTimer);
                setStatus('');
            } else if (pc && pc.connectionState === 'failed') {
                showError('Forbindelsen fejlede. Tjek netværket og prøv igen.');
                endCall('failed');
            } else if (pc && pc.connectionState === 'disconnected') {
                setStatus('Forbindelsen er ustabil...');
            }
        };
        return pc;
    }

    function armConnWatchdog() {
        clearTimeout(connTimer);
        connTimer = setTimeout(function () {
            if (state !== 'active') {
                showError('Kunne ikke oprette forbindelse (15 sekunder). Prøv igen.');
                endCall('failed');
            }
        }, 15000);
    }

    // --- Start opkald (fra chat) ---
    async function start(id, name, convId, user) {
        if (state !== 'idle') { info('Du er allerede i et opkald.'); return; }
        if (user && user.online === false) { info(name + ' er offline lige nu.'); return; }
        peerId = id;
        peerName = name || 'Kollega';
        callId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        micOn = true;
        camOn = true;
        connectedAt = 0;
        pendingIce = [];
        role = 'caller';
        // Sikr en samtale findes
        if (!convId) {
            try {
                const response = await fetch('/api/chat/conversations', {
                    method: 'POST', headers: authHeaders(), body: JSON.stringify({ peerId: id })
                });
                if (response.ok) convId = (await response.json()).conversationId;
            } catch (e) { /* netvaerk */ }
        }
        conversationId = convId || null;
        if (!conversationId) { info('Kunne ikke starte opkaldet.'); return; }
        state = 'ringing';
        ensureDock();
        setStatus('Ringer til ' + peerName + '...');
        try {
            localStream = await getMedia();
            if (!localStream.getVideoTracks().length) showError('Intet kamera - opkaldet fortsætter kun med lyd.');
            attachStreams();
        } catch (e) {
            showError('Kan ikke bruge kamera eller mikrofon. Tjek browserens tilladelser og prøv igen.');
            return;
        }
        signal('call_invite', { fromName: (window.myName || peerName) });
        // 30 sekunder uden svar = ubesvaret opkald
        ringTimer = setTimeout(function () {
            if (state === 'ringing') {
                signal('call_end', { reason: 'missed' });
                callLog('missed');
                info('Ubesvaret opkald til ' + peerName);
                cleanup();
            }
        }, 30000);
    }

    // --- Besvar / afvis (modtager) ---
    async function acceptCall() {
        if (state !== 'incoming') return;
        hideIncoming();
        clearTimeout(ringTimer);
        state = 'connecting';
        ensureDock();
        setStatus('Opretter forbindelse...');
        try {
            localStream = await getMedia();
            attachStreams();
        } catch (e) {
            showError('Kan ikke bruge kamera eller mikrofon. Tjek browserens tilladelser og prøv igen.');
            signal('call_end', { reason: 'failed' });
            cleanup();
            return;
        }
        await signal('call_accept', {});
        armConnWatchdog();
    }

    function rejectCall() {
        if (state !== 'incoming') return;
        hideIncoming();
        clearTimeout(ringTimer);
        signal('call_reject', {});
        callLog('rejected');
        state = 'idle';
        peerId = null;
        conversationId = null;
        callId = null;
        role = null;
    }

    function autoMissed() {
        if (state !== 'incoming') return;
        hideIncoming();
        callLog('missed');
        signal('call_end', { reason: 'missed' });
        state = 'idle';
        peerId = null;
        conversationId = null;
        callId = null;
        role = null;
    }

    // --- Laeg paa ---
    function hangup(reason) {
        const secs = connectedAt ? Math.round((Date.now() - connectedAt) / 1000) : 0;
        signal('call_end', { reason: 'hangup' });
        callLog(reason === 'ended' && secs > 0 ? 'ended' : 'failed', secs);
        cleanup();
    }

    function endCall(status) {
        callLog(status === 'failed' ? 'failed' : 'ended', connectedAt ? Math.round((Date.now() - connectedAt) / 1000) : 0);
        cleanup();
    }

    // --- Ryd op: stop ALLE tracks og luk RTCPeerConnection ---
    function cleanup() {
        clearTimeout(ringTimer);
        clearTimeout(connTimer);
        stopRingInterval();
        hideIncoming();
        if (localStream) {
            try { localStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* allerede stoppet */ }
            localStream = null;
        }
        if (pc) {
            try { pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); } catch (e) { /* allerede lukket */ }
            pc = null;
        }
        const dock = document.getElementById('videoDock');
        if (dock) dock.remove();
        pendingIce = [];
        state = 'idle';
        role = null;
        peerId = null;
        conversationId = null;
        callId = null;
        connectedAt = 0;
    }

    // --- Signal-handler (fra chat.js SSE) ---
    async function onSignal(m) {
        if (!m || !m.callId) return;
        if (state !== 'idle' && m.callId !== callId && m.type === 'call_invite') {
            // Ét opkald pr. bruger: sig at vi er optaget
            const savedConv = conversationId, savedCall = callId;
            conversationId = m.conversationId;
            callId = m.callId;
            signal('call_busy', {});
            conversationId = savedConv;
            callId = savedCall;
            return;
        }
        if (m.callId !== callId && state !== 'idle') return;
        switch (m.type) {
            case 'call_invite':
                if (state !== 'idle') return;
                peerId = m.fromUserId;
                peerName = (m.payload && m.payload.fromName) || m.fromName || 'Kollega';
                conversationId = m.conversationId;
                callId = m.callId;
                role = 'callee';
                state = 'incoming';
                showIncoming();
                break;
            case 'call_accept':
                if (state !== 'ringing') return;
                clearTimeout(ringTimer);
                state = 'connecting';
                setStatus('Opretter forbindelse...');
                try {
                    await createPeer();
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    await signal('offer', { sdp: offer.sdp, type: offer.type });
                    armConnWatchdog();
                } catch (e) {
                    showError('Kunne ikke starte forbindelsen.');
                    endCall('failed');
                }
                break;
            case 'offer':
                if (state !== 'incoming' && state !== 'connecting') return;
                try {
                    await createPeer();
                    await pc.setRemoteDescription({ type: 'offer', sdp: m.payload.sdp });
                    await attachPendingIce();
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    await signal('answer', { sdp: answer.sdp, type: answer.type });
                } catch (e) {
                    showError('Kunne ikke oprette forbindelsen.');
                    endCall('failed');
                }
                break;
            case 'answer':
                try {
                    if (pc && pc.signalingState === 'have-local-offer') {
                        await pc.setRemoteDescription({ type: 'answer', sdp: m.payload.sdp });
                        await attachPendingIce();
                    }
                } catch (e) { /* watchdog handterer */ }
                break;
            case 'ice':
                if (pc && pc.remoteDescription) {
                    try { await pc.addIceCandidate(m.payload); } catch (e) { /* ignoreres */ }
                } else {
                    pendingIce.push(m.payload);
                }
                break;
            case 'call_reject':
                if (role === 'caller') {
                    info(peerName + ' afslog opkaldet.');
                    callLog('rejected');
                    cleanup();
                }
                break;
            case 'call_busy':
                if (role === 'caller') {
                    info(peerName + ' er optaget lige nu.');
                    cleanup();
                }
                break;
            case 'call_end': {
                const reason = m.payload && m.payload.reason;
                if (reason === 'hangup' || reason === 'missed' || reason === 'failed') {
                    if (reason === 'missed' && role === 'caller') info('Ubesvaret opkald til ' + peerName);
                    cleanup();
                }
                break;
            }
        }
    }

    async function attachPendingIce() {
        for (const c of pendingIce) {
            try { await pc.addIceCandidate(c); } catch (e) { /* ignoreres */ }
        }
        pendingIce = [];
    }

    // Kalderes fra chat.js naar siden forlades
    function cleanupOnUnload() {
        if (state !== 'idle') {
            signal('call_end', { reason: 'hangup' });
            if (state === 'active') callLog('ended', connectedAt ? Math.round((Date.now() - connectedAt) / 1000) : 0);
        }
        cleanup();
    }

    return {
        start: start,
        onSignal: onSignal,
        cleanup: cleanup,
        cleanupOnUnload: cleanupOnUnload,
        state: function () { return state; }
    };
})();
window.addEventListener('beforeunload', function () {
    if (window.ChatCall) try { ChatCall.cleanupOnUnload(); } catch (e) { /* ignoreres */ }
});





