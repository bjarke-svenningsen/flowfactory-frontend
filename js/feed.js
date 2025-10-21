// Feed variabler
let posts = [];
let currentAttachments = [];

// Emoji picker state
let feedEmojiPickerOpen = false;
let currentCommentEmojiPicker = null;

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
    await renderPosts();
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
    // Load from cache first (instant!) while fetching from backend
    const cachedPosts = localStorage.getItem('feedPosts');
    if (cachedPosts) {
        try {
            posts = JSON.parse(cachedPosts);
            // Convert timestamp strings back to Date objects
            posts.forEach(p => {
                p.timestamp = new Date(p.timestamp);
                if (p.comments) {
                    p.comments.forEach(c => c.timestamp = new Date(c.timestamp));
                }
            });
            await renderPosts(); // Render cached posts instantly!
        } catch (e) {
            console.log('Cache parse error, loading from backend');
        }
    }
    
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
            headers: {
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
                localPhoto: null,
                comments: [] // Vil blive loaded async
            }));
            
            // Load comments for all posts in parallel (10x faster!)
            await Promise.all(posts.map(post => loadCommentsForPost(post.id)));
            
            // Cache posts in localStorage for instant future loads
            try {
                localStorage.setItem('feedPosts', JSON.stringify(posts));
            } catch (e) {
                console.log('Failed to cache posts');
            }
            
            await renderPosts();
            return;
        }
    } catch (error) {
        console.log('Kunne ikke hente posts fra backend, loader demo posts');
    }
    
    // Fallback: Hvis backend ikke virker, load demo posts
    await loadDemoPosts();
}

// Load comments for a specific post from backend
async function loadCommentsForPost(postId) {
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/posts/${postId}/comments`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const comments = await response.json();
            const post = posts.find(p => p.id === postId);
            if (post) {
                post.comments = comments.map(c => ({
                    id: c.id,
                    author: c.author,
                    content: c.content,
                    timestamp: new Date(c.created_at + (c.created_at.includes('Z') ? '' : 'Z')),
                    avatar_url: c.avatar_url,
                    user_id: c.user_id
                }));
            }
        }
    } catch (error) {
        console.log('Could not load comments for post', postId);
    }
}

// Vis posts på feed
async function renderPosts() {
    const feedContainer = document.getElementById('feedPosts');
    
    if (posts.length === 0) {
        feedContainer.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">Ingen opslag endnu. Vær den første til at dele noget!</p>';
        return;
    }

    // Render posts immediately (lazy load link previews after)
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
        
        // Render comments (Facebook-style) with edit/delete
        let commentsHTML = '';
        if (post.comments && post.comments.length > 0) {
            commentsHTML = post.comments.map((comment, commentIndex) => {
                const commentInitials = comment.author.split(' ').map(n => n[0]).join('');
                const commentTimeAgo = getTimeAgo(comment.timestamp);
                const isOwnComment = comment.author === window.currentUser.name;
                
                // Comment avatar
                let commentAvatarHTML;
                if (comment.avatar_url) {
                    const commentImageUrl = 'https://flowfactory-frontend.onrender.com' + comment.avatar_url;
                    commentAvatarHTML = `<div class="comment-avatar" style="background-image: url(${commentImageUrl}); background-size: cover; background-position: center;"></div>`;
                } else if (comment.localPhoto) {
                    commentAvatarHTML = `<div class="comment-avatar" style="background-image: url(${comment.localPhoto}); background-size: cover; background-position: center;"></div>`;
                } else {
                    commentAvatarHTML = `<div class="comment-avatar">${commentInitials}</div>`;
                }
                
                // Edit/delete buttons for own comments
                const commentActionsHTML = isOwnComment ? `
                    <div style="margin-left: 50px; margin-top: 4px; margin-bottom: 8px; display: flex; gap: 10px;">
                        <button onclick="editComment(${post.id}, ${commentIndex})" style="background: none; border: none; color: #65676b; cursor: pointer; font-size: 12px; font-weight: 600;">✏️ Rediger</button>
                        <button onclick="deleteComment(${post.id}, ${commentIndex})" style="background: none; border: none; color: #65676b; cursor: pointer; font-size: 12px; font-weight: 600;">🗑️ Slet</button>
                        <span style="color: #65676b; font-size: 12px;">${commentTimeAgo}</span>
                    </div>
                ` : `
                    <div style="margin-left: 50px; margin-bottom: 8px; font-size: 12px; color: #65676b;">${commentTimeAgo}</div>
                `;
                
                return `
                    <div class="comment-item" style="display: flex; gap: 10px; margin-bottom: 4px;">
                        ${commentAvatarHTML}
                        <div style="flex: 1; background: #f0f2f5; padding: 8px 12px; border-radius: 18px;">
                            <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">${comment.author}</div>
                            <div style="font-size: 14px; color: #050505;">${comment.content}</div>
                        </div>
                    </div>
                    ${commentActionsHTML}
                `;
            }).join('');
        }
        
        // Current user avatar for comment input
        let currentUserAvatarHTML;
        if (window.currentUser.profile_image) {
            const imageUrl = 'https://flowfactory-frontend.onrender.com' + window.currentUser.profile_image;
            currentUserAvatarHTML = `<div class="comment-avatar" style="background-image: url(${imageUrl}); background-size: cover; background-position: center;"></div>`;
        } else if (window.currentUser.profilePhoto) {
            currentUserAvatarHTML = `<div class="comment-avatar" style="background-image: url(${window.currentUser.profilePhoto}); background-size: cover; background-position: center;"></div>`;
        } else {
            const initials = window.currentUser.name.split(' ').map(n => n[0]).join('');
            currentUserAvatarHTML = `<div class="comment-avatar">${initials}</div>`;
        }
        
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
                <div class="post-content" id="content-${post.id}">${linkifyContent(post.content)}</div>
                <div id="link-preview-${post.id}" class="link-preview-container"></div>
                ${attachmentsHTML}
                <div class="post-actions">
                    <button class="post-action-btn" onclick="likePost(${post.id})">👍 Synes godt om (${post.likes})</button>
                    <button class="post-action-btn" onclick="commentOnPost(${post.id})">💬 Kommenter${post.comments && post.comments.length > 0 ? ` (${post.comments.length})` : ''}</button>
                    <button class="post-action-btn" onclick="sharePost(${post.id})">↗️ Del</button>
                </div>
                
                <!-- Facebook-style comment section -->
                <div id="comments-${post.id}" class="comments-section" style="display: none; padding: 15px; border-top: 1px solid #e4e6eb; background: #f7f8fa; position: relative;">
                    ${commentsHTML}
                    <div style="display: flex; gap: 10px; align-items: center; position: relative;">
                        ${currentUserAvatarHTML}
                        <div style="flex: 1; position: relative;">
                            <input 
                                type="text" 
                                id="comment-input-${post.id}" 
                                placeholder="Skriv en kommentar..." 
                                onkeypress="handleCommentKeyPress(event, ${post.id})"
                                style="width: 100%; padding: 8px 40px 8px 12px; border: 1px solid #ccc; border-radius: 18px; font-size: 14px; outline: none;"
                            >
                            <button onclick="toggleCommentEmojiPicker(${post.id})" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 18px; padding: 4px;">😊</button>
                            
                            <!-- Emoji picker for comment -->
                            <div id="comment-emoji-picker-${post.id}" class="emoji-picker" style="display: none; position: absolute; bottom: 45px; right: 0; background: white; border: 1px solid #ccc; border-radius: 8px; padding: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1000; max-height: 300px; overflow-y: auto;">
                                <div class="emoji-grid" style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px;">
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😊')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😊</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😂')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😂</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤣')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤣</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😍')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😍</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😘')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😘</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😎')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😎</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🥳')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🥳</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤗')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤗</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🥰')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🥰</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😇')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😇</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🙃')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🙃</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😉')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😉</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😋')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😋</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😛')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😛</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😜')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😜</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😝')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😝</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤪')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤪</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😁')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😁</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😏')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😏</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😌')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😌</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😔')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😔</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😢')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😢</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😭')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😭</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😤')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😤</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😡')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😡</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤬')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤬</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😱')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😱</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😨')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😨</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🥺')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🥺</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤔')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤔</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤨')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤨</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😐')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😐</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😑')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😑</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🙄')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🙄</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '😴')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">😴</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤤')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤤</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🥱')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🥱</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '👍')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">👍</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '👎')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">👎</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '👏')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">👏</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🙌')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🙌</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤝')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤝</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '✋')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">✋</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤚')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤚</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '👋')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">👋</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤟')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤟</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '✌️')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">✌️</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤞')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤞</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🫰')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🫰</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💪')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💪</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🙏')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🙏</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '❤️')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">❤️</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🧡')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🧡</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💛')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💛</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💚')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💚</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💙')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💙</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💜')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💜</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🖤')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🖤</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤍')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤍</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤎')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤎</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💕')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💕</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💖')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💖</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💗')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💗</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💓')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💓</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💞')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💞</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🔥')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🔥</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '✨')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">✨</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💯')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💯</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '⭐')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">⭐</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🎉')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🎉</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🎊')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🎊</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🎈')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🎈</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '👀')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">👀</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💀')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💀</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '💩')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">💩</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '👻')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">👻</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🤡')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🤡</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '🦄')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">🦄</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '✅')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">✅</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '❌')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">❌</span>
                                    <span class="emoji-item" onclick="insertCommentEmoji(${post.id}, '⚠️')" style="cursor: pointer; font-size: 20px; padding: 4px; text-align: center;">⚠️</span>
                                </div>
                            </div>
                        </div>
                        <button onclick="addComment(${post.id})" style="padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 18px; cursor: pointer; font-weight: 600;">Post</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Lazy load link previews in background (non-blocking)
    posts.forEach(post => {
        lazyLoadLinkPreview(post.content, post.id);
    });
}

// Like et post - OPTIMISTIC UI UPDATE (instant!)
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
    
    // Update UI instantly (optimistic update!)
    const likeBtn = document.querySelector(`#post-${postId} .post-action-btn`);
    if (likeBtn) {
        likeBtn.textContent = `👍 Synes godt om (${post.likes})`;
    }
    
    // Gem til backend i baggrunden (non-blocking!)
    try {
        const token = sessionStorage.getItem('token');
        fetch(`https://flowfactory-frontend.onrender.com/api/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(error => {
            console.log('Could not sync like to backend');
        });
    } catch (error) {
        console.log('Could not sync like to backend');
    }
    
    // Update cache
    try {
        localStorage.setItem('feedPosts', JSON.stringify(posts));
    } catch (e) {
        // Ignore cache errors
    }
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

// Kommenter på et post - Facebook style
function commentOnPost(postId) {
    const commentSection = document.getElementById(`comments-${postId}`);
    if (!commentSection) return;
    
    // Toggle kommentar sektion synlighed
    if (commentSection.style.display === 'none' || !commentSection.style.display) {
        commentSection.style.display = 'block';
        // Focus på input felt
        const inputField = document.getElementById(`comment-input-${postId}`);
        if (inputField) inputField.focus();
    } else {
        commentSection.style.display = 'none';
    }
}

// Tilføj kommentar til post
async function addComment(postId) {
    const inputField = document.getElementById(`comment-input-${postId}`);
    if (!inputField) return;
    
    const comment = inputField.value.trim();
    if (!comment) return;
    
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    
    // Gem til backend
    try {
        const token = sessionStorage.getItem('token');
        const response = await fetch(`https://flowfactory-frontend.onrender.com/api/posts/${postId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ content: comment })
        });
        
        if (response.ok) {
            const newComment = await response.json();
            // Initialiser comments array hvis den ikke findes
            if (!post.comments) {
                post.comments = [];
            }
            
            // Tilføj kommentar fra backend response
            post.comments.push({
                id: newComment.id,
                author: newComment.author,
                content: newComment.content,
                timestamp: new Date(newComment.created_at + (newComment.created_at.includes('Z') ? '' : 'Z')),
                avatar_url: newComment.avatar_url,
                user_id: newComment.user_id
            });
        }
    } catch (error) {
        console.error('Failed to add comment to backend:', error);
        // Fallback: add locally
        if (!post.comments) post.comments = [];
        post.comments.push({
            author: window.currentUser.name,
            content: comment,
            timestamp: new Date(),
            avatar_url: window.currentUser.profile_image || null,
            localPhoto: window.currentUser.profilePhoto || null
        });
    }
    
    // Clear input og re-render
    inputField.value = '';
    await renderPosts();
    
    // Hold kommentar sektion åben
    const commentSection = document.getElementById(`comments-${postId}`);
    if (commentSection) commentSection.style.display = 'block';
}

// Handle Enter key i kommentar felt
function handleCommentKeyPress(event, postId) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        addComment(postId);
    }
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
async function savePost(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const newContent = document.getElementById(`edit-textarea-${postId}`).value.trim();
    
    if (!newContent) {
        alert('Opslaget kan ikke være tomt!');
        return;
    }

    post.content = newContent;
    await renderPosts();
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
                await renderPosts();
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
async function loadDemoPosts() {
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
    await renderPosts();
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

// Toggle emoji picker for post composer
function toggleFeedEmojiPicker() {
    const picker = document.getElementById('feedEmojiPicker');
    if (!picker) return;
    
    feedEmojiPickerOpen = !feedEmojiPickerOpen;
    picker.style.display = feedEmojiPickerOpen ? 'block' : 'none';
}

// Insert emoji into post composer
function insertFeedEmoji(emoji) {
    const input = document.getElementById('postContent');
    if (!input) return;
    
    input.value += emoji;
    input.focus();
    
    // Close picker
    const picker = document.getElementById('feedEmojiPicker');
    if (picker) picker.style.display = 'none';
    feedEmojiPickerOpen = false;
}

// Toggle emoji picker for comment
function toggleCommentEmojiPicker(postId) {
    const picker = document.getElementById(`comment-emoji-picker-${postId}`);
    if (!picker) return;
    
    // Close other pickers
    if (currentCommentEmojiPicker && currentCommentEmojiPicker !== postId) {
        const oldPicker = document.getElementById(`comment-emoji-picker-${currentCommentEmojiPicker}`);
        if (oldPicker) oldPicker.style.display = 'none';
    }
    
    // Toggle current picker
    const isOpen = picker.style.display === 'block';
    picker.style.display = isOpen ? 'none' : 'block';
    currentCommentEmojiPicker = isOpen ? null : postId;
}

// Insert emoji into comment
function insertCommentEmoji(postId, emoji) {
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;
    
    input.value += emoji;
    input.focus();
    
    // Close picker
    const picker = document.getElementById(`comment-emoji-picker-${postId}`);
    if (picker) picker.style.display = 'none';
    currentCommentEmojiPicker = null;
}

// Edit comment
async function editComment(postId, commentIndex) {
    const post = posts.find(p => p.id === postId);
    if (!post || !post.comments || !post.comments[commentIndex]) return;
    
    const comment = post.comments[commentIndex];
    if (comment.author !== window.currentUser.name) return;
    
    const newContent = prompt('Rediger kommentar:', comment.content);
    if (newContent && newContent.trim()) {
        // Update in backend
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`https://flowfactory-frontend.onrender.com/api/posts/${postId}/comments/${comment.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ content: newContent.trim() })
            });
            
            if (response.ok) {
                const updated = await response.json();
                comment.content = updated.content;
            }
        } catch (error) {
            console.error('Failed to update comment:', error);
            // Fallback: update locally
            comment.content = newContent.trim();
        }
        
        await renderPosts();
        
        // Keep comment section open
        const commentSection = document.getElementById(`comments-${postId}`);
        if (commentSection) commentSection.style.display = 'block';
    }
}

// Delete comment
async function deleteComment(postId, commentIndex) {
    const post = posts.find(p => p.id === postId);
    if (!post || !post.comments || !post.comments[commentIndex]) return;
    
    const comment = post.comments[commentIndex];
    if (comment.author !== window.currentUser.name) return;
    
    if (confirm('Er du sikker på at du vil slette denne kommentar?')) {
        // Delete from backend
        try {
            const token = sessionStorage.getItem('token');
            const response = await fetch(`https://flowfactory-frontend.onrender.com/api/posts/${postId}/comments/${comment.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                post.comments.splice(commentIndex, 1);
            }
        } catch (error) {
            console.error('Failed to delete comment:', error);
            // Fallback: delete locally
            post.comments.splice(commentIndex, 1);
        }
        
        await renderPosts();
        
        // Keep comment section open
        const commentSection = document.getElementById(`comments-${postId}`);
        if (commentSection) commentSection.style.display = 'block';
    }
}

// Cache for link previews to avoid refetching
const linkPreviewCache = new Map();

// Detect URLs and fetch link previews from backend
async function detectAndRenderLinks(content, postId) {
    try {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = content.match(urlRegex);
        
        if (!urls || urls.length === 0) return '';
        
        // Fetch previews for each URL with timeout
        const previewPromises = urls.map(async (url) => {
            // Check cache first
            if (linkPreviewCache.has(url)) {
                return linkPreviewCache.get(url);
            }
            
            try {
                const token = sessionStorage.getItem('token');
                
                // Add timeout to prevent hanging
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout (3x faster!)
                
                const response = await fetch('https://flowfactory-frontend.onrender.com/api/link-preview', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ url }),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const preview = await response.json();
                    linkPreviewCache.set(url, preview);
                    return preview;
                }
            } catch (error) {
                console.log('Link preview skipped for:', url);
            }
            
            // Fallback: basic preview
            return { url, title: url, description: '', image: '', siteName: '' };
        });
        
        const previews = await Promise.all(previewPromises);
        
        // Render preview cards
        return previews.map(preview => {
        const domain = preview.siteName || (preview.url ? new URL(preview.url).hostname.replace('www.', '') : '');
        const title = preview.title || preview.url;
        const description = preview.description || '';
        const image = preview.image || '';
        
        return `
            <a href="${preview.url}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: inherit; display: block;">
                <div class="link-preview-card" style="border: 1px solid #e4e6eb; border-radius: 8px; overflow: hidden; margin-top: 10px; max-width: 500px; cursor: pointer; transition: box-shadow 0.2s;">
                    ${image ? `
                        <div style="width: 100%; height: 260px; overflow: hidden; background: #f0f2f5;">
                            <img src="${image}" alt="${title}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.style.display='none'">
                        </div>
                    ` : ''}
                    <div style="padding: 12px; background: #f7f8fa;">
                        <div style="font-size: 12px; color: #65676b; text-transform: uppercase; margin-bottom: 4px;">${domain}</div>
                        <div style="font-weight: 600; font-size: 16px; color: #050505; margin-bottom: 4px; line-height: 20px;">${title.length > 80 ? title.substring(0, 80) + '...' : title}</div>
                        ${description ? `<div style="font-size: 14px; color: #65676b; line-height: 20px;">${description.length > 120 ? description.substring(0, 120) + '...' : description}</div>` : ''}
                    </div>
                </div>
            </a>
        `;
        }).join('');
    } catch (error) {
        console.error('detectAndRenderLinks error:', error);
        return ''; // Return empty string if anything fails
    }
}

// Lazy load link preview (non-blocking background fetch)
async function lazyLoadLinkPreview(content, postId) {
    const container = document.getElementById(`link-preview-${postId}`);
    if (!container) return;
    
    const previewHTML = await detectAndRenderLinks(content, postId);
    if (previewHTML) {
        container.innerHTML = previewHTML;
    }
}

// Make URLs clickable in text content
function linkifyContent(content) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return content.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #1877f2;">$1</a>');
}

// Start loading af posts når siden loader
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        if (document.getElementById('feedPage')) {
            loadPosts();
        }
    });
}
