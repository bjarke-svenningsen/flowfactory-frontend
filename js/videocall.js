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

// Initialize Socket.IO connection for video calls
function initVideoCallSocket() {
    // Reuse the existing socket connection from chat.js if available
    if (typeof socket !== 'undefined' && socket) {
        videoSocket = socket;
        console.log('Reusing existing socket for video calls');
    } else {
        videoSocket = io('https://flowfactory-backend-production.up.railway.app');
        
        // Authenticate socket
        const token = sessionStorage.getItem('token');
        if (token) {
            videoSocket.emit('auth', token);
        }
    }
    
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
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Display local video
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.innerHTML = '<video autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>';
            localVideo.querySelector('video').srcObject = localStream;
            localVideo.style.display = 'flex';
        }
        
        // Join room
        currentRoomId = `call-${colleagueId}`;
        currentCall = { id: colleagueId, name: colleagueName };
        
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
        
        // Replace video track in all peer connections
        peerConnections.forEach(pc => {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
        });
        
        // Revert when screen share ends
        screenTrack.onended = () => {
            if (localStream) {
                const videoTrack = localStream.getVideoTracks()[0];
                peerConnections.forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (sender) {
                        sender.replaceTrack(videoTrack);
                    }
                });
            }
        };
        
    } catch (error) {
        console.error('Screen share error:', error);
        alert('Kunne ikke dele skærm: ' + error.message);
    }
}

// End call
function endCall() {
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

// Initialize on page load
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        if (document.getElementById('videocallPage')) {
            console.log('Initializing video call socket...');
            initVideoCallSocket();
        }
    });
}
