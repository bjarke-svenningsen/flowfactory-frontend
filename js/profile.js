// js/profile.js
import { Auth, Files } from './api.js';

let currentUser = null;

// Når siden loader
document.addEventListener('DOMContentLoaded', async () => {
  const t = sessionStorage.getItem('token');
  if (!t) { 
    location.href = 'index.html'; 
    return; 
  }

  try {
    const { user } = await Auth.me();
    currentUser = user;
    
    // Udfyld felter
    setValue('name', user.name || '');
    setValue('position', user.position || '');
    setValue('department', user.department || '');
    setValue('phone', user.phone || '');
    renderAvatar(user.avatar_url);
  } catch {
    sessionStorage.removeItem('token');
    location.href = 'index.html';
  }

  // Event listeners
  const avatarInput = document.getElementById('avatarInput');
  if (avatarInput) {
    avatarInput.addEventListener('change', handleAvatarChange);
  }
  
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveProfile);
  }
});

function byId(id) { 
  return document.getElementById(id); 
}

function setValue(id, value) { 
  const el = byId(id); 
  if (el) el.value = value; 
}

function renderAvatar(url) {
  const el = byId('avatarPreview'); 
  if (!el) return;
  
  if (url) {
    el.src = `https://flowfactory-backend-production.up.railway.app${url}`;
  } else {
    el.removeAttribute('src');
  }
}

async function handleAvatarChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  
  try {
    const url = await Files.uploadImage(file);
    currentUser.avatar_url = url;
    renderAvatar(url);
  } catch (err) {
    alert('Kunne ikke uploade billede: ' + err.message);
  }
}

async function saveProfile() {
  const payload = {
    name: byId('name')?.value.trim(),
    position: byId('position')?.value.trim(),
    department: byId('department')?.value.trim(),
    phone: byId('phone')?.value.trim(),
    avatar_url: currentUser.avatar_url || null,
  };
  
  try {
    const { user } = await Auth.updateMe(payload);
    currentUser = user;
    renderAvatar(user.avatar_url);
    
    // Opdater sessionStorage
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    
    // Vis succes besked
    const msg = byId('savedMsg');
    if (msg) {
      msg.style.display = 'block';
      setTimeout(() => msg.style.display = 'none', 1500);
    }
  } catch (e) {
    alert('Kunne ikke gemme profil: ' + e.message);
  }
}
