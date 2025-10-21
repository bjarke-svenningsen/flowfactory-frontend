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
let remoteAudioMuted = false;
let isScreenSharing = false;

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
        // Show floating overlay for receiver too
        const floatingCall = document.getElementById('floatingVideoCall');
        floatingCall.style.display = 'flex';
        
        // Update title
        document.getElementById('floatingCallTitle').textContent = `Opkald med ${callerName}`;
        
        // Get user media (same fallback as startVideoCall)
        let mediaObtained = false;
        
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            mediaObtained = true;
            console.log('✅ Got video + audio');
        } catch (e1) {
            console.warn('Video+Audio failed:', e1);
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true
                });
                mediaObtained = true;
                console.log('✅ Got audio only');
                alert('⚠️ Kunne ikke få adgang til kamera.\n\nFortsætter med kun lyd.');
            } catch (e2) {
                console.warn('Audio failed:', e2);
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
                    mediaObtained = true;
                    console.log('✅ Got video only');
                    alert('⚠️ Kunne ikke få adgang til mikrofon.\n\nFortsætter med kun video.');
                } catch (e3) {
                    console.error('No media devices available:', e3);
                    alert('❌ Kunne ikke få adgang til kamera eller mikrofon.\n\nKan ikke acceptere opkald.');
                    floatingCall.style.display = 'none';
                    return;
                }
            }
        }
        
        if (mediaObtained && localStream) {
            // Show local video
            const localVideo = document.getElementById('floatingLocalVideo');
            localVideo.style.display = 'block';
            localVideo.querySelector('video').srcObject = localStream;
            
            // Update placeholder
            const placeholder = document.getElementById('floatingPlaceholder');
            const initials = callerName.split(' ').map(n => n[0]).join('');
            placeholder.innerHTML = `<div class="initials">${initials}</div><p>Forbinder til ${callerName}...</p>`;
            
            // Setup room
            currentRoomId = roomId;
            currentCall = { id: callerId, name: callerName };
            
            // Join room (WITHOUT sending call-user notification!)
            console.log(`Accepting call from ${callerName} - joining room ${roomId}`);
            videoSocket.emit('video:join-room', currentRoomId);
            
            console.log(`✅ Floating overlay shown for incoming call from ${callerName}`);
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
    
    // Handle incoming tracks - accumulate all tracks into one MediaStream
    let accumulatedStream = null;
    let playTimeout;
    
    pc.ontrack = (event) => {
        console.log('🎥 RECEIVED TRACK:', event.track.kind, event.track.id);
        
        // Stop ringtone when first track arrives
        stopRingtone();
        
        // Create or get remote video element in floating overlay
        const floatingBody = document.getElementById('floatingVideoBody');
        let remoteVideo = document.getElementById('floatingRemoteVideo');
        
        if (!remoteVideo) {
            // Remove placeholder
            const placeholder = document.getElementById('floatingPlaceholder');
            if (placeholder) placeholder.style.display = 'none';
            
            // Create remote video element
            remoteVideo = document.createElement('video');
            remoteVideo.id = 'floatingRemoteVideo';
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.style.width = '100%';
            remoteVideo.style.height = '100%';
            remoteVideo.style.objectFit = 'cover';
            floatingBody.appendChild(remoteVideo);
        }
        
        // Initialize accumulated stream if needed
        if (!accumulatedStream) {
            accumulatedStream = new MediaStream();
            remoteVideo.srcObject = accumulatedStream;
        }
        
        // Add track to accumulated stream if not already there
        const existingTrack = accumulatedStream.getTracks().find(t => t.id === event.track.id);
        if (!existingTrack) {
            accumulatedStream.addTrack(event.track);
            console.log(`✅ Added ${event.track.kind} track. Total: ${accumulatedStream.getTracks().length}`);
        }
        
        // Clear previous play timeout
        if (playTimeout) clearTimeout(playTimeout);
        
        // Debounce play() call
        playTimeout = setTimeout(() => {
            remoteVideo.play().then(() => {
                console.log('✅ Remote video playing in floating overlay');
            }).catch(err => {
                console.error('❌ Play error:', err);
            });
        }, 300);
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
    if (!mainVideo) return; // Prevent null reference if not on videocall page
    
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

// Start video call - Shows floating overlay (Discord/Teams style)
async function startVideoCall(colleagueId, colleagueName) {
    try {
        // Initialize socket if not already done
        if (!videoSocket) {
            initVideoCallSocket();
            // Wait a bit for socket to connect
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Show floating overlay
        const floatingCall = document.getElementById('floatingVideoCall');
        floatingCall.style.display = 'flex';
        
        // Update title
        document.getElementById('floatingCallTitle').textContent = `Opkald med ${colleagueName}`;
        
        // Get user media with fallbacks
        let mediaObtained = false;
        
        try {
            // Try video + audio
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            mediaObtained = true;
            console.log('✅ Got video + audio');
        } catch (e1) {
            console.warn('Video+Audio failed:', e1);
            try {
                // Try audio only
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true
                });
                mediaObtained = true;
                console.log('✅ Got audio only');
                alert('⚠️ Kunne ikke få adgang til kamera.\n\nFortsætter med kun lyd.');
            } catch (e2) {
                console.warn('Audio failed:', e2);
                try {
                    // Try video only
                    localStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
                    mediaObtained = true;
                    console.log('✅ Got video only');
                    alert('⚠️ Kunne ikke få adgang til mikrofon.\n\nFortsætter med kun video.');
                } catch (e3) {
                    console.error('No media devices available:', e3);
                    alert('❌ Kunne ikke få adgang til kamera eller mikrofon.\n\nTjek at du har givet tilladelse i browser indstillinger.');
                    floatingCall.style.display = 'none';
                    return;
                }
            }
        }
        
        if (mediaObtained && localStream) {
            // Show local video
            const localVideo = document.getElementById('floatingLocalVideo');
            localVideo.style.display = 'block';
            localVideo.querySelector('video').srcObject = localStream;
            
            // Update placeholder
            const placeholder = document.getElementById('floatingPlaceholder');
            const initials = colleagueName.split(' ').map(n => n[0]).join('');
            placeholder.innerHTML = `<div class="initials">${initials}</div><p>Ringer til ${colleagueName}...</p>`;
            
            // Setup call
            currentRoomId = `call-${colleagueId}`;
            currentCall = { id: colleagueId, name: colleagueName };
            
            // Play ringtone
            playRingtone();
            
            // Start call via Socket.IO
            videoSocket.emit('video:call-user', { 
                targetUserId: colleagueId, 
                roomId: currentRoomId 
            });
            
            videoSocket.emit('video:join-room', currentRoomId);
            
            console.log(`Started floating video call with ${colleagueName}`);
        }
        
    } catch (error) {
        console.error('Error starting call:', error);
        alert('Kunne ikke starte opkald: ' + error.message);
        document.getElementById('floatingVideoCall').style.display = 'none';
    }
}

// Toggle floating minimize
function toggleFloatingMinimize() {
    const floatingCall = document.getElementById('floatingVideoCall');
    const isMinimized = floatingCall.classList.toggle('minimized');
    
    // Update button text/icon based on state
    const minimizeBtn = document.querySelector('.floating-video-header-buttons button:first-child');
    if (minimizeBtn) {
        minimizeBtn.textContent = isMinimized ? '□' : '−';
        minimizeBtn.title = isMinimized ? 'Maksimer' : 'Minimer';
    }
}

// Toggle floating mic
function toggleFloatingMic() {
    toggleMicrophone();
    const btn = document.getElementById('floatingMicBtn');
    if (microphoneEnabled) {
        btn.classList.remove('muted');
    } else {
        btn.classList.add('muted');
    }
}

// Toggle floating camera
function toggleFloatingCam() {
    toggleCamera();
    const btn = document.getElementById('floatingCamBtn');
    if (cameraEnabled) {
        btn.classList.remove('off');
    } else {
        btn.classList.add('off');
    }
}

// Floating screen share
async function floatingShareScreen() {
    await shareScreen();
}

// End floating call
function endFloatingCall() {
    endCall();
    document.getElementById('floatingVideoCall').style.display = 'none';
    
    // Reset placeholder
    document.getElementById('floatingPlaceholder').innerHTML = '<div class="initials">📹</div><p>Forbinder...</p>';
    
    // Hide local video
    document.getElementById('floatingLocalVideo').style.display = 'none';
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

// Toggle remote audio (mute/unmute)
function toggleRemoteAudio() {
    const remoteVideos = document.querySelectorAll('[id^="remoteVideo-"]');
    remoteAudioMuted = !remoteAudioMuted;
    
    remoteVideos.forEach(video => {
        video.muted = remoteAudioMuted;
    });
    
    const btn = document.getElementById('remoteMuteBtn');
    if (btn) {
        btn.style.background = remoteAudioMuted ? '#f44336' : '#ff9800';
        btn.textContent = remoteAudioMuted ? '🔇 Lyd fra' : '🔊 Lyd fra';
    }
    
    console.log(remoteAudioMuted ? '🔇 Remote audio muted' : '🔊 Remote audio unmuted');
}

// Stop screen share manually
async function stopScreenShare() {
    if (!screenStream) return;
    
    const videoTrack = localStream?.getVideoTracks()[0];
    
    // Replace or remove video track when screen share ends
    const renegotiationPromises = [];
    peerConnections.forEach((pc, socketId) => {
        const renegotiate = async () => {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            
            if (sender && videoTrack) {
                // Replace screen track with camera track
                await sender.replaceTrack(videoTrack);
                console.log(`✅ Camera track restored for peer ${socketId}`);
            } else if (sender && !videoTrack) {
                // Was audio-only before screen share - remove video track
                pc.removeTrack(sender);
                console.log(`✅ Screen track removed from peer ${socketId} (reverting to audio-only)`);
            }
            
            // Create new offer to trigger renegotiation
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            // Send new offer to remote peer
            videoSocket.emit('video:offer', {
                roomId: currentRoomId,
                offer,
                targetSocketId: socketId
            });
            console.log(`📡 Sent camera restore offer to peer ${socketId}`);
        };
        renegotiationPromises.push(renegotiate());
    });
    
    await Promise.all(renegotiationPromises);
    console.log('✅ Reverted to camera for all peers');
    
    // Revert local video to show camera again
    const localVideoElement = document.querySelector('#localVideo video');
    if (localVideoElement && localStream) {
        localVideoElement.srcObject = localStream;
    }
    
    // Clean up screen stream
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
    isScreenSharing = false;
    
    // Toggle buttons
    const shareBtn = document.getElementById('shareBtn');
    const stopShareBtn = document.getElementById('stopShareBtn');
    if (shareBtn) shareBtn.style.display = 'inline-block';
    if (stopShareBtn) stopShareBtn.style.display = 'none';
    
    console.log('⏹️ Screen sharing stopped');
}

// Screen share
async function shareScreen() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { 
                cursor: 'always',
                displaySurface: 'monitor' // Prefer full monitor/screen
            },
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });
        
        const screenTrack = screenStream.getVideoTracks()[0];
        isScreenSharing = true;
        
        // Replace or add video track in all peer connections and renegotiate
        const renegotiationPromises = [];
        peerConnections.forEach((pc, socketId) => {
            const renegotiate = async () => {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                
                if (sender) {
                    // Replace existing video track (camera → screen)
                    await sender.replaceTrack(screenTrack);
                    console.log(`✅ Screen track replaced for peer ${socketId}`);
                } else {
                    // No video track exists (audio-only call) - add screen track
                    pc.addTrack(screenTrack, screenStream);
                    console.log(`✅ Screen track added to peer ${socketId} (was audio-only)`);
                }
                
                // Add screen audio if available
                const screenAudioTrack = screenStream.getAudioTracks()[0];
                if (screenAudioTrack) {
                    pc.addTrack(screenAudioTrack, screenStream);
                    console.log(`🔊 Screen audio track added for peer ${socketId}`);
                }
                
                // Create new offer to trigger renegotiation
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                
                // Send new offer to remote peer
                videoSocket.emit('video:offer', {
                    roomId: currentRoomId,
                    offer,
                    targetSocketId: socketId
                });
                console.log(`📡 Sent renegotiation offer to peer ${socketId}`);
            };
            renegotiationPromises.push(renegotiate());
        });
        
        // Wait for all renegotiations to complete
        await Promise.all(renegotiationPromises);
        console.log('✅ Screen sharing activated for all peers');
        
        // Update local video to show screen share preview
        const localVideoElement = document.querySelector('#localVideo video');
        if (localVideoElement) {
            localVideoElement.srcObject = screenStream;
        }
        
        // Toggle buttons
        const shareBtn = document.getElementById('shareBtn');
        const stopShareBtn = document.getElementById('stopShareBtn');
        if (shareBtn) shareBtn.style.display = 'none';
        if (stopShareBtn) stopShareBtn.style.display = 'inline-block';
        
        // Revert when screen share ends (user stops via system UI)
        screenTrack.onended = async () => {
            if (!isScreenSharing) return; // Already stopped via stopScreenShare()
            if (localStream) {
                const videoTrack = localStream.getVideoTracks()[0];
                
                // Replace or remove video track when screen share ends
                const renegotiationPromises = [];
                peerConnections.forEach((pc, socketId) => {
                    const renegotiate = async () => {
                        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                        
                        if (sender && videoTrack) {
                            // Replace screen track with camera track
                            await sender.replaceTrack(videoTrack);
                            console.log(`✅ Camera track restored for peer ${socketId}`);
                        } else if (sender && !videoTrack) {
                            // Was audio-only before screen share - remove video track
                            pc.removeTrack(sender);
                            console.log(`✅ Screen track removed from peer ${socketId} (reverting to audio-only)`);
                        }
                        
                        // Create new offer to trigger renegotiation
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        
                        // Send new offer to remote peer
                        videoSocket.emit('video:offer', {
                            roomId: currentRoomId,
                            offer,
                            targetSocketId: socketId
                        });
                        console.log(`📡 Sent camera restore offer to peer ${socketId}`);
                    };
                    renegotiationPromises.push(renegotiate());
                });
                
                await Promise.all(renegotiationPromises);
                console.log('✅ Reverted to camera for all peers');
                
                // Revert local video to show camera again
                const localVideoElement = document.querySelector('#localVideo video');
                if (localVideoElement) {
                    localVideoElement.srcObject = localStream;
                }
            }
            
            // Clean up screen stream
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
            isScreenSharing = false;
            
            // Toggle buttons
            const shareBtn = document.getElementById('shareBtn');
            const stopShareBtn = document.getElementById('stopShareBtn');
            if (shareBtn) shareBtn.style.display = 'inline-block';
            if (stopShareBtn) stopShareBtn.style.display = 'none';
        };
        
        console.log('✅ Screen sharing setup complete');
        
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
