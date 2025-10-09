// js/dashboard.js
import { Auth } from './api.js';

async function init() {
  // 1) Tjek token
  const t = sessionStorage.getItem('token');
  if (!t) {
    location.href = 'index.html';
    return;
  }

  // 2) Hent "mig"
  try {
    const { user } = await Auth.me();
    // Sæt navn de steder, du vil
    document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = user.name || '');
    // Fx initialer
    const initials = (user.name || '')
      .split(' ')
      .map(n => n[0]?.toUpperCase())
      .join('');
    const iniEl = document.querySelector('[data-user-initials]');
    if (iniEl) iniEl.textContent = initials;

  } catch (e) {
    // Token udløbet → tilbage til login
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('currentUser');
    location.href = 'index.html';
  }
}

// Log ud-knap (valgfrit)
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-logout]')) {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('currentUser');
    location.href = 'index.html';
  }
});

init();
