// Feed variabler
let posts = [];
let currentAttachments = [];

// Tilføj nyt post
async function addPost() {
    const content = document.getElementById('postContent').value.trim();
    
    if (!content && currentAttachments.length === 0) {
        alert('Skriv noget eller tilføj en fil før du deler!');
        return;
    }

    // Prøv at sende til backend
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ content })
        });

        if (response.ok) {
            const newPost = await response.json();
            // Konverter backend format til vores format
            posts.unshift({
                id: newPost.id,
                author: newPost.user_name,
                content: newPost.content,
                // Fix timezone: SQLite returnerer UTC tid, tilføj 'Z' for at parse korrekt
                timestamp: new Date(newPost.created_at + (newPost.created_at.includes('Z') ? '' : 'Z')),
                likes: newPost.likes || 0,
                attachments: [...currentAttachments],
                avatar_url: newPost.avatar_url,
                localPhoto: window.currentUser.profilePhoto || null  // Gem lokalt billede!
            });
        } else {
            throw new Error('Backend ikke tilgængelig');
        }
    } catch (error) {
        // Fallback: Gem lokalt hvis backend er nede
        console.log('Backend offline, gemmer lokalt');
        const post = {
            id: Date.now(),
            author: window.currentUser.name,
            content: content,
            timestamp: new Date(),
            likes: 0,
            attachments: [...currentAttachments],
            localPhoto: window.currentUser.profilePhoto || null
        };
        posts.unshift(post);
    }

    document.getElementById('postContent').value = '';
    currentAttachments = [];
    document.getElementById('filePreview').innerHTML = '';
    renderPosts();
}

// Håndter billede upload
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Tjek om det er en video fil
    if (file.type.startsWith('video/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentAttachments.push({
                type: 'video',
                data: e.target.result,
                name: file.name
            });
            updateFilePreview();
        };
        reader.readAsDataURL(file);
    } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentAttachments.push({
                type: 'image',
                data: e.target.result,
                name: file.name
            });
            updateFilePreview();
        };
        reader.readAsDataURL(file);
    } else {
        alert('Kun billede- og videofiler understøttes');
    }
}

// Håndter fil upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    currentAttachments.push({
        type: 'file',
        name: file.name,
        size: formatFileSize(file.size)
    });
    updateFilePreview();
}

// Opdater preview af filer
function updateFilePreview() {
    const preview = document.getElementById('filePreview');
    preview.innerHTML = '<div class="file-preview">' + 
        currentAttachments.map((att, index) => {
            if (att.type === 'image') {
                return `
                    <div class="preview-item">
                        <button class="remove-preview" onclick="removeAttachment(${index})">×</button>
                        <img src="${att.data}" alt="${att.name}">
                    </div>
                `;
            } else {
                return `
                    <div class="preview-item">
                        <button class="remove-preview" onclick="removeAttachment(${index})">×</button>
                        <div class="file-attachment">
                            📎 ${att.name} (${att.size})
                        </div>
                    </div>
                `;
            }
        }).join('') + '</div>';
}

// Fjern vedhæftet fil
function removeAttachment(index) {
    currentAttachments.splice(index, 1);
    updateFilePreview();
}

// Formater filstørrelse
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// Indlæs posts fra backend
async function loadPosts() {
    // Opdater post composer avatar
    const feedAvatar = document.getElementById('feedAvatar');
    if (feedAvatar && window.currentUser) {
        // Check for profile_image first (server URL), then profilePhoto (old base64)
        if (window.currentUser.profile_image) {
            const imageUrl = 'https://flowfactory-frontend.onrender.com' + window.currentUser.profile_image;
            feedAvatar.style.backgroundImage = `url(${imageUrl})`;
            feedAvatar.style.backgroundSize = 'cover';
            feedAvatar.style.backgroundPosition = 'center';
            feedAvatar.textContent = '';
        } else if (window.currentUser.profilePhoto) {
            feedAvatar.style.backgroundImage = `url(${window.currentUser.profilePhoto})`;
            feedAvatar.style.backgroundSize = 'cover';
            feedAvatar.style.backgroundPosition = 'center';
            feedAvatar.textContent = '';
        } else {
            const initials = window.currentUser.name.split(' ').map(n => n[0]).join('');
            feedAvatar.textContent = initials;
        }
    }
    
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch('https://flowfactory-frontend.onrender.com/api/posts', {
            headers:
{
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const backendPosts = await response.json();
            posts = backendPosts.map(p => ({
                id: p.id,
                author: p.user_name,
                content: p.content,
                // Fix timezone: SQLite returnerer UTC tid, tilføj 'Z' for at parse korrekt
                timestamp: new Date(p.created_at + (p.created_at.includes('Z') ? '' : 'Z')),
                likes: p.likes || 0,
                likedByUser: false, // Initialiser til false for alle posts
                attachments: [],
                avatar_url: p.avatar_url,
                localPhoto: null
            }));
            renderPosts();
            return;
        }
    } catch (error) {
        console.log('Kunne ikke hente posts fra backend, loader demo posts');
    }
    
    // Fallback: Hvis backend ikke virker, load demo posts
    loadDemoPosts();
}

// Vis posts på feed
function renderPosts() {
    const feedContainer = document.getElementById('feedPosts');
    
    if (posts.length === 0) {
        feedContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">Ingen opslag endnu. Vær den første til at dele noget!</p>';
        return;
    }

    feedContainer.innerHTML = posts.map(post => {
        const timeAgo = getTimeAgo(post.timestamp);
        const postInitials = post.author.split(' ').map(n => n[0]).join('');
        const isOwnPost = post.author === window.currentUser.name;
        
        // Tjek om vi har et profilbillede - FORBEDRET LOGIK
        let avatarHTML;
        if (isOwnPost && window.currentUser.profile_image) {
            // 1. FØRST: Brug brugerens NUVÆRENDE uploadede billede (server URL)
            const imageUrl = 'https://flowfactory-frontend.onrender.com' + window.currentUser.profile_image;
            avatarHTML = `<div class="user-avatar" style="background-image: url(${imageUrl}); background-size: cover; background-position: center;"></div>`;
        } else if (isOwnPost && window.currentUser.profilePhoto) {
            // 2. DEREFTER: Brug brugerens NUVÆRENDE uploadede billede (old base64)
            avatarHTML = `<div class="user-avatar" style="background-image: url(${window.currentUser.profilePhoto}); background-size: cover; background-position: center;"></div>`;
        } else if (post.localPhoto) {
            // 2. DEREFTER: Brug lokalt gemt billede fra da opslaget blev lavet
            avatarHTML = `<div class="user-avatar" style="background-image: url(${post.localPhoto}); background-size: cover; background-position: center;"></div>`;
        } else if (post.avatar_url) {
            // 3. SÅ: Brug avatar fra backend
            avatarHTML = `<div class="user-avatar" style="background-image: url(https://flowfactory-frontend.onrender.com${post.avatar_url}); background-size: cover; background-position: center;"></div>`;
        } else {
            // 4. SIDST: Fallback til initialer
            avatarHTML = `<div class="user-avatar">${postInitials}</div>`;
        }
        
        // Generer HTML for vedhæftede filer
        let attachmentsHTML = '';
        if (post.attachments && post.attachments.length > 0) {
            attachmentsHTML = post.attachments.map(att => {
                if (att.type === 'image') {
                    return `<img src="${att.data}" alt="${att.name}" class="post-image" onclick="openImageModal('${att.data}')">`;
                } else if (att.type === 'video') {
                    return `
                        <div class="video-size-limiter" style="display: inline-block;">
                            <video controls class="feed-video-player">
                                <source src="${att.data}" type="video/mp4">
                                Din browser understøtter ikke video afspilning.
                            </video>
                        </div>
                    `;
                } else {
                    return `<div class="post-file">📎 ${att.name} (${att.size})</div>`;
                }
            }).join('');
        }

        // Detekter YouTube links i indholdet
        const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
        let contentWithVideos = post.content;
        const youtubeMatches = [...post.content.matchAll(youtubeRegex)];
        
        if (youtubeMatches.length > 0) {
            youtubeMatches.forEach(match => {
                const videoId = match[1];
                const youtubeEmbed = `
                    <div style="max-width: 560px; margin: 10px 0;">
                        <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px;">
                            <iframe 
                                src="https://www.youtube.com/embed/${videoId}" 
                                style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" 
                                allowfullscreen>
                            </iframe>
                        </div>
                    </div>
                `;
                attachmentsHTML += youtubeEmbed;
            });
        }

        // Rediger/slet knapper kun for egne opslag
        const optionsHTML = isOwnPost ? `
            <div class="post-options">
                <button class="post-option-btn" onclick="editPost(${post.id})">✏️ Rediger</button>
                <button class="post-option-btn delete" onclick="deletePost(${post.id})">🗑️ Slet</button>
            </div>
        ` : '';
        
        return `
            <div class="feed-post" id="post-${post.id}">
                <div class="post-header">
                    <div class="post-user-section">
                        ${avatarHTML}
                        <div class="post-user-info">
                            <h4>${post.author}</h4>
                            <p>${timeAgo}</p>
                        </div>
                    </div>
                    ${optionsHTML}
                </div>
                <div class="post-content" id="content-${post.id}">${post.content}</div>
                ${attachmentsHTML}
                <div class="post-actions">
                    <button class="post-action-btn" onclick="likePost(${post.id})">👍 Synes godt om (${post.likes})</button>
                    <button class="post-action-btn" onclick="commentOnPost(${post.id})">💬 Kommenter</button>
                    <button class="post-action-btn" onclick="sharePost(${post.id})">↗️ Del</button>
                </div>
            </div>
        `;
    }).join('');
}

// Like et post - NU MED TOGGLE!
async function likePost(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    // Toggle like status
    if (!post.likedByUser) {
        post.likedByUser = true;
        post.likes++;
    } else {
        post.likedByUser = false;
        post.likes = Math.max(0, post.likes - 1);
    }
    
    // Gem til backend (men fortsæt selv hvis det fejler)
    try {
        const token = sessionStorage.getItem('token');
        await fetch(`https://flowfactory-frontend.onrender.com/api/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (error) {
        console.log('Could not sync like to backend');
    }
    
    renderPosts();
}

// Del et post
function sharePost(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    
    const shareText = `${post.author}: ${post.content.substring(0, 100)}${post.content.length > 100 ? '...' : ''}`;
    
    // Kopier til clipboard
    navigator.clipboard.writeText(shareText).then(() => {
        alert('✅ Opslag kopieret til udklipsholder!\n\nDu kan nu dele det hvor som helst.');
    }).catch(() => {
        // Fallback
        alert(`📤 Del dette opslag:\n\n${shareText}`);
    });
}

// Kommenter på et post
function commentOnPost(postId) {
    const comment = prompt('💬 Skriv din kommentar:');
    if (!comment || !comment.trim()) return;
    
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    
    // Initialiser comments array hvis den ikke findes
    if (!post.comments) {
        post.comments = [];
    }
    
    // Tilføj kommentar
    post.comments.push({
        author: window.currentUser.name,
        content: comment.trim(),
        timestamp: new Date()
    });
    
    alert('✅ Kommentar tilføjet!');
    renderPosts();
}

// Rediger opslag
function editPost(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post || post.author !== window.currentUser.name) return;

    const contentDiv = document.getElementById(`content-${postId}`);
    const originalContent = post.content;
    
    contentDiv.innerHTML = `
        <div class="edit-post-area">
            <textarea id="edit-textarea-${postId}">${originalContent}</textarea>
            <div class="edit-buttons">
                <button class="save-btn" onclick="savePost(${postId})">💾 Gem</button>
                <button class="cancel-btn" onclick="cancelEdit(${postId}, \`${originalContent.replace(/`/g, '\\`')}\`)">❌ Annuller</button>
            </div>
        </div>
    `;
    
    document.getElementById(`edit-textarea-${postId}`).focus();
}

// Gem redigeret opslag
function savePost(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const newContent = document.getElementById(`edit-textarea-${postId}`).value.trim();
    
    if (!newContent) {
        alert('Opslaget kan ikke være tomt!');
        return;
    }

    post.content = newContent;
    renderPosts();
}

// Annuller redigering
function cancelEdit(postId, originalContent) {
    const contentDiv = document.getElementById(`content-${postId}`);
    contentDiv.textContent = originalContent;
}

// Slet opslag
async function deletePost(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post || post.author !== window.currentUser.name) return;

    if (confirm('Er du sikker på at du vil slette dette opslag?')) {
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`https://flowfactory-frontend.onrender.com/api/posts/${postId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                // Backend sletning lykkedes - fjern fra lokal liste
                posts = posts.filter(p => p.id !== postId);
                renderPosts();
            } else {
                alert('❌ Kunne ikke slette opslag - prøv igen');
            }
        } catch (error) {
            console.error('Delete error:', error);
            alert('❌ Kunne ikke slette opslag - ingen forbindelse til server');
        }
    }
}

// Beregn "tid siden" - NU MED KORREKT TIDSZONE
function getTimeAgo(date) {
    // Konverter til Date objekt hvis det er en string
    const postDate = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    
    // Beregn forskel i sekunder
    const seconds = Math.floor((now - postDate) / 1000);
    
    if (seconds < 60) return 'Lige nu';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' min siden';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' timer siden';
    if (seconds < 2592000) return Math.floor(seconds / 86400) + ' dage siden';
    if (seconds < 31536000) return Math.floor(seconds / 2592000) + ' måneder siden';
    return Math.floor(seconds / 31536000) + ' år siden';
}

// Indlæs demo posts
function loadDemoPosts() {
    posts = [
        {
            id: 3,
            author: 'Administrator',
            content: 'Husk! Vi holder firmafest på fredag kl. 18:00 i kantinen. Alle er velkomne! 🎉',
            timestamp: new Date(Date.now() - 7200000),
            likes: 5,
            attachments: [],
            localPhoto: null
        },
        {
            id: 2,
            author: window.currentUser?.name || 'Test Bruger',
            content: 'Har lige afsluttet Q3 rapporten. Den ser rigtig godt ud! Tak for hjælpen team 💪',
            timestamp: new Date(Date.now() - 14400000),
            likes: 3,
            attachments: [],
            localPhoto: window.currentUser?.profilePhoto || null
        },
        {
            id: 1,
            author: 'Administrator',
            content: 'Velkommen til vores nye virksomhedsportal! Her kan I dele nyheder, filer og holde kontakten med kolleger.',
            timestamp: new Date(Date.now() - 86400000),
            likes: 12,
            attachments: [],
            localPhoto: null
        }
    ];
    renderPosts();
}

// Åbn billede i fuld størrelse
function openImageModal(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    modal.style.display = 'flex';
    modalImg.src = imageSrc;
}

// Luk billede modal
function closeImageModal() {
    document.getElementById('imageModal').style.display = 'none';
}

// Start loading af posts når siden loader
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        if (document.getElementById('feedPage')) {
            loadPosts();
        }
    });
}
