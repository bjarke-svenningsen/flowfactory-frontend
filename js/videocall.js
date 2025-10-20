// WebRTC Video Call Client
// WebRTC Configuration
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let videoSocket = null;
let localStream = null;
let screenStream = null;
let peerConnections = new Map(); // socketId -> RTCPeerConnection
let currentRoomId = null;
let currentCall = null;
let microphoneEnabled = true;
let cameraEnabled = true;
let ringtone = null; // Audio for ringtone

// Create ringtone using Web Audio API
function createRingtone() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 440; // A4 note
    oscillator.type = 'sine';
    
    gainNode.gain.value = 0.3; // 30% volume
    
    return { oscillator, gainNode, audioContext };
}

// Play ringtone (looping)
function playRingtone() {
    if (!ringtone) {
        ringtone = createRingtone();
        ringtone.oscillator.start();
        
        // Pulsing effect (ring ring ring)
        const startTime = ringtone.audioContext.currentTime;
        ringtone.gainNode.gain.setValueAtTime(0.3, startTime);
        ringtone.gainNode.gain.setValueAtTime(0, startTime + 0.5);
        ringtone.gainNode.gain.setValueAtTime(0.3, startTime + 1);
        ringtone.gainNode.gain.setValueAtTime(0, startTime + 1.5);
        ringtone.gainNode.gain.setValueAtTime(0.3, startTime + 2);
        
        // Loop every 2 seconds
        setInterval(() => {
            if (ringtone) {
                const time = ringtone.audioContext.currentTime;
                ringtone.gainNode.gain.setValueAtTime(0.3, time);
                ringtone.gainNode.gain.setValueAtTime(0, time + 0.5);
                ringtone.gainNode.gain.setValueAtTime(0.3, time + 1);
                ringtone.gainNode.gain.setValueAtTime(0, time + 1.5);
            }
        }, 2000);
    }
}

// Stop ringtone
function stopRingtone() {
    if (ringtone) {
        ringtone.oscillator.stop();
        ringtone.audioContext.close();
        ringtone = null;
    }
}

// Initialize Socket.IO connection for video calls
function initVideoCallSocket() {
    // Reuse the existing socket connection from chat.js if available
    if (typeof socket !== 'undefined' && socket) {
        videoSocket = socket;
        console.log('Reusing existing socket for video calls');
    } else {
        videoSocket = io('https://flowfactory-frontend.onrender.com');
        
        // Authenticate socket
        const token = sessionStorage.getItem('token');
        if (token) {
            videoSocket.emit('auth', token);
        }
    }
    
    // Initialize online users tracking
    if (typeof window.onlineUsers === 'undefined') {
        window.onlineUsers = new Map();
    }
    
    // Listen for online users updates
    videoSocket.on('online-users', (users) => {
        console.log('Online users update:', users);
        window.onlineUsers.clear();
        users.forEach(userId => window.onlineUsers.set(userId, true));
        
        // Refresh colleague list to update online status
        loadVideoCallColleagues();
    });
    
    // WebRTC signaling event handlers
    videoSocket.on('video:user-joined', async ({ socketId, userId, userName }) => {
        console.log('User joined video room:', userName);
        await createPeerConnection(socketId, true);
    });
    
    videoSocket.on('video:offer', async ({ offer, senderSocketId }) => {
        console.log('Received offer from:', senderSocketId);
        const pc = await createPeerConnection(senderSocketId, false);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        videoSocket.emit('video:answer', { answer, targetSocketId: senderSocketId });
    });
    
    videoSocket.on('video:answer', async ({ answer, senderSocketId }) => {
        console.log('Received answer from:', senderSocketId);
        const pc = peerConnections.get(senderSocketId);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });
    
    videoSocket.on('video:ice-candidate', async ({ candidate, senderSocketId }) => {
        console.log('Received ICE candidate from:', senderSocketId);
        const pc = peerConnections.get(senderSocketId);
        if (pc && candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });
    
    videoSocket.on('video:user-left', (socketId) => {
        console.log('User left video room:', socketId);
        if (peerConnections.has(socketId)) {
            peerConnections.get(socketId).close();
            peerConnections.delete(socketId);
            removeVideoElement(socketId);
        }
    });
    
    // Listen for incoming call notifications
    videoSocket.on('video:incoming-call', ({ callerId, callerName, roomId }) => {
        console.log(`📞 Incoming call from ${callerName} (ID: ${callerId})`);
        
        // Play incoming ringtone
        playRingtone();
        
        // Show incoming call notification
        const accepted = confirm(`📞 Indgående opkald fra ${callerName}\n\nVil du acceptere opkaldet?`);
        
        // Stop ringtone
        stopRingtone();
        
        if (accepted) {
            // Accept call - join the room WITHOUT sending notification back!
            acceptIncomingCall(callerId, callerName, roomId);
        } else {
            console.log('Call rejected by user');
            // TODO: Send rejection notification back to caller
        }
    });
}

// Accept incoming call - joins room without sending notification
async function acceptIncomingCall(callerId, callerName, roomId) {
    try {
        // Get user media (same fallback as startVideoCall)
        let videoEnabled = false;
        let audioEnabled = false;
        
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            videoEnabled = true;
            audioEnabled = true;
        } catch (e1) {
            console.warn('Video+Audio failed, trying audio only:', e1);
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true
                });
                audioEnabled = true;
                alert('⚠️ Kunne ikke få adgang til kamera.\n\nFortsætter med kun mikrofon.');
            } catch (e2) {
                console.warn('Audio failed, trying video only:', e2);
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
                    videoEnabled = true;
                    alert('⚠️ Kunne ikke få adgang til mikrofon.\n\nFortsætter med kun kamera.');
                } catch (e3) {
                    console.error('No media devices available:', e3);
                    alert('❌ Ingen kamera eller mikrofon fundet.\n\nKan ikke acceptere opkald.');
                    return;
                }
            }
        }
        
        // Setup room
        currentRoomId = roomId;
        currentCall = { id: callerId, name: callerName };
        
        // Join room (WITHOUT sending call-user notification!)
        console.log(`Accepting call from ${callerName} - joining room ${roomId}`);
        videoSocket.emit('video:join-room', currentRoomId);
        
        // Update UI (same as startVideoCall)
        const callPlaceholder = document.getElementById('callPlaceholder');
        if (callPlaceholder) {
            callPlaceholder.style.display = 'none';
        }
        
        const callControls = document.getElementById('callControls');
        if (callControls) {
            callControls.style.display = 'flex';
        }
        
        const mainVideo = document.getElementById('mainVideo');
        const initials = callerName.split(' ').map(n => n[0]).join('');
        mainVideo.innerHTML = `
            <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; flex-direction: column; color: white;">
                <div style="font-size: 120px; font-weight: bold; margin-bottom: 20px;">${initials}</div>
                <h3>Forbinder til ${callerName}...</h3>
                <p style="opacity: 0.8; margin-top: 10px;">Venter på forbindelse...</p>
            </div>
            <div id="localVideo" style="position: absolute; bottom: 20px; right: 20px; width: 200px; height: 150px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 40px; border: 3px solid white;">
                <video autoplay muted playsinline style="width:100%;height:100%;object-fit:cover; border-radius: 10px;"></video>
            </div>
        `;
        
        // Set local video stream
        const newLocalVideo = document.getElementById('localVideo');
        if (newLocalVideo) {
            newLocalVideo.querySelector('video').srcObject = localStream;
        }
        
    } catch (error) {
        console.error('Error accepting call:', error);
        alert('Kunne ikke acceptere opkald: ' + error.message);
    }
}

async function createPeerConnection(socketId, isInitiator) {
    const pc = new RTCPeerConnection(iceServers);
    peerConnections.set(socketId, pc);
    
    // Add local tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
        console.log('Received remote track');
        const remoteVideo = document.getElementById('remoteVideo-' + socketId) || createVideoElement(socketId);
        remoteVideo.srcObject = event.streams[0];
    };
    
    // ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            videoSocket.emit('video:ice-candidate', { 
                candidate: event.candidate, 
                targetSocketId: socketId 
            });
        }
    };
    
    // Connection state changes
    pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        
        if (pc.connectionState === 'connected') {
            // Stop ringtone when connected
            stopRingtone();
            
            // Remove "waiting" overlay when connected
            const waitingOverlay = document.querySelector('#mainVideo > div:not(#localVideo)');
            if (waitingOverlay && waitingOverlay.textContent.includes('Venter på forbindelse')) {
                waitingOverlay.remove();
            }
        }
        
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            removeVideoElement(socketId);
        }
    };
    
    // Create offer if initiator
    if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        videoSocket.emit('video:offer', { 
            roomId: currentRoomId, 
            offer, 
            targetSocketId: socketId 
        });
    }
    
    return pc;
}

function createVideoElement(socketId) {
    const videoContainer = document.getElementById('mainVideo');
    
    // Remove placeholder if exists
    const placeholder = document.getElementById('callPlaceholder');
    if (placeholder) {
        placeholder.style.display = 'none';
    }
    
    const video = document.createElement('video');
    video.id = 'remoteVideo-' + socketId;
    video.autoplay = true;
    video.playsInline = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    videoContainer.appendChild(video);
    
    return video;
}

function removeVideoElement(socketId) {
    const video = document.getElementById('remoteVideo-' + socketId);
    if (video) {
        video.remove();
    }
    
    // Show placeholder if no more remote videos
    const mainVideo = document.getElementById('mainVideo');
    if (mainVideo.querySelectorAll('video').length === 0) {
        const placeholder = document.getElementById('callPlaceholder');
        if (placeholder) {
            placeholder.style.display = 'block';
        } else {
            mainVideo.innerHTML = `
                <div id="callPlaceholder" style="text-align: center; color: white;">
                    <div style="font-size: 80px; margin-bottom: 20px;">📹</div>
                    <h3>Vælg en kollega for at starte videoopkald</h3>
                    <p style="margin-top: 10px; opacity: 0.7;">Klik på en kollega i listen til højre</p>
                </div>
            `;
        }
    }
}

// Start video call (replaces placeholder function in dashboard.html)
async function startVideoCall(colleagueId, colleagueName) {
    try {
        // Try to get user media with fallbacks
        let videoEnabled = false;
        let audioEnabled = false;
        
        try {
            // Try video + audio
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            videoEnabled = true;
            audioEnabled = true;
        } catch (e1) {
            console.warn('Video+Audio failed, trying audio only:', e1);
            try {
                // Try audio only
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true
                });
                audioEnabled = true;
                alert('⚠️ Kunne ikke få adgang til kamera.\n\nFortsætter med kun mikrofon.');
            } catch (e2) {
                console.warn('Audio failed, trying video only:', e2);
                try {
                    // Try video only
                    localStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
                    videoEnabled = true;
                    alert('⚠️ Kunne ikke få adgang til mikrofon.\n\nFortsætter med kun kamera.');
                } catch (e3) {
                    console.error('No media devices available:', e3);
                    alert('❌ Ingen kamera eller mikrofon fundet.\n\nInstaller venligst et kamera/mikrofon for at bruge videochat.\n\nDu kan dog stadig bruge chat-funktionen! 💬');
                    return;
                }
            }
        }
        
        // Display local video
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.innerHTML = '<video autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>';
            localVideo.querySelector('video').srcObject = localStream;
            localVideo.style.display = 'flex';
        }
        
        // Setup room and notify target user
        currentRoomId = `call-${colleagueId}`;
        currentCall = { id: colleagueId, name: colleagueName };
        
        // Play outgoing ringtone
        playRingtone();
        
        // IMPORTANT: Notify target user FIRST (before joining room)
        console.log(`Calling user ${colleagueId} (${colleagueName})...`);
        videoSocket.emit('video:call-user', { 
            targetUserId: colleagueId, 
            roomId: currentRoomId 
        });
        
        // Then join room
        videoSocket.emit('video:join-room', currentRoomId);
        
        // Update UI
        const callPlaceholder = document.getElementById('callPlaceholder');
        if (callPlaceholder) {
            callPlaceholder.style.display = 'none';
        }
        
        const callControls = document.getElementById('callControls');
        if (callControls) {
            callControls.style.display = 'flex';
        }
        
        // Update main video to show "waiting"
        const mainVideo = document.getElementById('mainVideo');
        const initials = colleagueName.split(' ').map(n => n[0]).join('');
        mainVideo.innerHTML = `
            <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; flex-direction: column; color: white;">
                <div style="font-size: 120px; font-weight: bold; margin-bottom: 20px;">${initials}</div>
                <h3>Ringer til ${colleagueName}...</h3>
                <p style="opacity: 0.8; margin-top: 10px;">Venter på forbindelse...</p>
            </div>
            <div id="localVideo" style="position: absolute; bottom: 20px; right: 20px; width: 200px; height: 150px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 40px; border: 3px solid white;">
                <video autoplay muted playsinline style="width:100%;height:100%;object-fit:cover; border-radius: 10px;"></video>
            </div>
        `;
        
        // Set local video stream
        const newLocalVideo = document.getElementById('localVideo');
        if (newLocalVideo) {
            newLocalVideo.querySelector('video').srcObject = localStream;
        }
        
    } catch (error) {
        console.error('Error starting call:', error);
        alert('Kunne ikke få adgang til kamera/mikrofon: ' + error.message);
    }
}

// Toggle camera
function toggleCamera() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            cameraEnabled = videoTrack.enabled;
            
            const btn = document.getElementById('camBtn');
            if (btn) {
                btn.style.background = cameraEnabled ? '#2196f3' : '#f44336';
                btn.textContent = cameraEnabled ? '📹 Kamera' : '📹 Kamera (Slukket)';
            }
        }
    }
}

// Toggle microphone
function toggleMicrophone() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            microphoneEnabled = audioTrack.enabled;
            
            const btn = document.getElementById('micBtn');
            if (btn) {
                btn.style.background = microphoneEnabled ? '#4caf50' : '#f44336';
                btn.textContent = microphoneEnabled ? '🎤 Mikrofon' : '🎤 Mikrofon (Slukket)';
            }
        }
    }
}

// Screen share
async function shareScreen() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: false
        });
        
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Replace video track in all peer connections (MUST BE AWAITED!)
        const replacePromises = [];
        peerConnections.forEach(pc => {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                replacePromises.push(sender.replaceTrack(screenTrack));
            }
        });
        
        // Wait for all track replacements to complete
        await Promise.all(replacePromises);
        console.log('✅ Screen track replaced in all peer connections');
        
        // Update local video to show screen share preview
        const localVideoElement = document.querySelector('#localVideo video');
        if (localVideoElement) {
            localVideoElement.srcObject = screenStream;
        }
        
        // Revert when screen share ends
        screenTrack.onended = async () => {
            if (localStream) {
                const videoTrack = localStream.getVideoTracks()[0];
                
                // Replace track back to camera in peer connections (AWAIT!)
                const replacePromises = [];
                peerConnections.forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (sender) {
                        replacePromises.push(sender.replaceTrack(videoTrack));
                    }
                });
                
                await Promise.all(replacePromises);
                console.log('✅ Reverted to camera in all peer connections');
                
                // Revert local video to show camera again
                const localVideoElement = document.querySelector('#localVideo video');
                if (localVideoElement) {
                    localVideoElement.srcObject = localStream;
                }
            }
            
            // Clean up screen stream
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
        };
        
        console.log('✅ Screen sharing started - track sent to remote peer');
        
    } catch (error) {
        console.error('Screen share error:', error);
        alert('Kunne ikke dele skærm: ' + error.message);
    }
}

// End call
function endCall() {
    // Stop ringtone if playing
    stopRingtone();
    
    // Stop all streams
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    // Close all peer connections
    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();
    
    // Leave room
    if (videoSocket && currentRoomId) {
        videoSocket.emit('video:leave-room', currentRoomId);
    }
    
    currentRoomId = null;
    currentCall = null;
    cameraEnabled = true;
    microphoneEnabled = true;
    
    // Reset UI
    const mainVideo = document.getElementById('mainVideo');
    if (mainVideo) {
        mainVideo.innerHTML = `
            <div id="callPlaceholder" style="text-align: center; color: white;">
                <div style="font-size: 80px; margin-bottom: 20px;">📹</div>
                <h3>Vælg en kollega for at starte videoopkald</h3>
                <p style="margin-top: 10px; opacity: 0.7;">Klik på en kollega i listen til højre</p>
            </div>
        `;
    }
    
    const callControls = document.getElementById('callControls');
    if (callControls) {
        callControls.style.display = 'none';
    }
}

// Load colleagues list for video calls
function loadVideoCallColleagues() {
    // Initialize socket if not already done
    if (!videoSocket) {
        initVideoCallSocket();
    }
    
    // Fetch colleagues from API
    const token = sessionStorage.getItem('token');
    fetch('https://flowfactory-frontend.onrender.com/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(colleagues => {
        const colleaguesList = document.getElementById('colleaguesList');
        if (!colleaguesList) return;
        
        // Filter out current user
        const others = colleagues.filter(c => c.id !== window.currentUser.id);
        
        if (others.length === 0) {
            colleaguesList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Ingen kolleger fundet</p>';
            return;
        }
        
        colleaguesList.innerHTML = others.map(colleague => {
            const initials = colleague.name.split(' ').map(n => n[0]).join('');
            const isOnline = window.onlineUsers && window.onlineUsers.has(colleague.id);
            const statusColor = isOnline ? '#4caf50' : '#999';
            const statusText = isOnline ? 'Online' : 'Offline';
            
            return `
                <div class="colleague-item" onclick="startVideoCall(${colleague.id}, '${colleague.name.replace(/'/g, "\\'")}')">
                    <div class="colleague-avatar" style="position: relative;">
                        ${initials}
                        <div style="position: absolute; bottom: 0; right: 0; width: 12px; height: 12px; background: ${statusColor}; border: 2px solid white; border-radius: 50%;"></div>
                    </div>
                    <div class="colleague-info">
                        <div class="colleague-name">${colleague.name}</div>
                        <div class="colleague-position" style="color: ${statusColor};">${statusText}</div>
                    </div>
                    <button class="call-btn" ${!isOnline ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>📞 Ring</button>
                </div>
            `;
        }).join('');
    })
    .catch(error => {
        console.error('Error loading colleagues:', error);
        const colleaguesList = document.getElementById('colleaguesList');
        if (colleaguesList) {
            colleaguesList.innerHTML = '<p style="text-align: center; color: #f44336; padding: 20px;">Kunne ikke indlæse kolleger</p>';
        }
    });
}

// Initialize on page load
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        if (document.getElementById('videocallPage')) {
            console.log('Initializing video call socket...');
            initVideoCallSocket();
        }
    });
    
    // Refresh warning - prevent accidental disconnection during call
    window.addEventListener('beforeunload', (e) => {
        if (currentRoomId && peerConnections.size > 0) {
            e.preventDefault();
            e.returnValue = 'Du er i et aktivt opkald. Er du sikker på at du vil forlade?';
            return e.returnValue;
        }
    });
}
