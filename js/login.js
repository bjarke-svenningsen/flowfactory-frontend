// js/login.js
import { Auth } from './api.js';

const form = document.getElementById('loginForm');
const emailEl = document.getElementById('email');
const passEl = document.getElementById('password');
const msgEl = document.getElementById('message');

// Login formular
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgEl.textContent = 'Logger ind...';
  msgEl.className = 'message';
  msgEl.style.display = 'block';
  
  try {
    const { user, token } = await Auth.login(emailEl.value.trim(), passEl.value);
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    
    msgEl.textContent = 'Login succesfuldt! Omdirigerer...';
    msgEl.className = 'message success';
    
    setTimeout(() => {
      location.href = 'dashboard.html';
    }, 1000);
  } catch (err) {
    msgEl.textContent = err.message || 'Forkert email eller adgangskode';
    msgEl.className = 'message error';
  }
});

// Demo-bruger knap
const createDemoBtn = document.getElementById('createDemo');
if (createDemoBtn) {
  createDemoBtn.addEventListener('click', async () => {
    msgEl.textContent = 'Opretter demo-bruger...';
    msgEl.className = 'message';
    msgEl.style.display = 'block';
    
    try {
      await Auth.register('Admin', 'admin@demo.local', 'Password123!');
      emailEl.value = 'admin@demo.local';
      passEl.value = 'Password123!';
      msgEl.textContent = 'Demo-bruger klar! Tryk "Log ind" nu.';
      msgEl.className = 'message success';
    } catch (err) {
      // Hvis brugeren allerede findes, er det OK
      if (err.message.includes('already')) {
        emailEl.value = 'admin@demo.local';
        passEl.value = 'Password123!';
        msgEl.textContent = 'Demo-bruger findes allerede. Tryk "Log ind".';
        msgEl.className = 'message success';
      } else {
        msgEl.textContent = 'Fejl: ' + err.message + '\n\nBackend URL: https://flowfactory-frontend.onrender.com';
        msgEl.className = 'message error';
      }
    }
  });
}
