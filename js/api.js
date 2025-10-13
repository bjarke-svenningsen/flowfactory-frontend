// js/api.js
// PRODUCTION: Backend hosted on Render with Supabase database
// Updated: 2025-10-14
const API = 'https://flowfactory-frontend.onrender.com';

function token() {
  return sessionStorage.getItem('token') || '';
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token() ? `Bearer ${token()}` : '',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Fejl');
  return data;
}

export const Auth = {
  login: (email, password) =>
    api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (name, email, password) =>
    api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  me: () => api('/api/users/me'),
  updateMe: (data) => 
    api('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

export const Feed = {
  getPosts: () => api('/api/posts'),
  createPost: (content) =>
    api('/api/posts', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  likePost: (postId) =>
    api(`/api/posts/${postId}/like`, {
      method: 'POST',
    }),
};

export const Files = {
  uploadImage: async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(API + '/api/upload', {
      method: 'POST',
      headers: { Authorization: token() ? `Bearer ${token()}` : '' },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload fejlede');
    return data.url;
  },
};
