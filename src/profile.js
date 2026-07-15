/**
 * YOUCHOOSE — Profile JS
 */

import './style.css';
import { supabase } from './supabaseClient.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const ADMIN_EMAIL = 'deepaknair1104@gmail.com';
const TASTES = ['Indian', 'Italian', 'Japanese', 'Chinese', 'Street Food', 'Fine Dining', 'Cafe', 'Mexican', 'Thai', 'American'];
let currentUser = null;
let userProfile = null;
let selectedTastes = new Set();

const ANIMATED_PRESETS = [
  // Golden Aura
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g1"><stop offset="0%" stop-color="%23F59E0B"><animate attributeName="stop-color" values="%23F59E0B;%23D4AF37;%23F59E0B" dur="3s" repeatCount="indefinite"/></stop><stop offset="100%" stop-color="%23D4AF37"><animate attributeName="stop-color" values="%23D4AF37;%23F59E0B;%23D4AF37" dur="3s" repeatCount="indefinite"/></stop></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g1)"/></svg>`,
  // Oceanic Pulse
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%233b82f6"><animate attributeName="stop-color" values="%233b82f6;%230ea5e9;%233b82f6" dur="4s" repeatCount="indefinite"/></stop><stop offset="100%" stop-color="%231e3a8a"><animate attributeName="stop-color" values="%231e3a8a;%233b82f6;%231e3a8a" dur="4s" repeatCount="indefinite"/></stop></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g2)"/></svg>`,
  // Lavender Dream
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g3" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="%23C4B5FD"><animate attributeName="stop-color" values="%23C4B5FD;%23A78BFA;%23C4B5FD" dur="3.5s" repeatCount="indefinite"/></stop><stop offset="100%" stop-color="%23ede9fe"><animate attributeName="stop-color" values="%23ede9fe;%23C4B5FD;%23ede9fe" dur="3.5s" repeatCount="indefinite"/></stop></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g3)"/></svg>`,
  // Crimson Flow
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g4"><stop offset="0%" stop-color="%23fb7185"><animate attributeName="stop-color" values="%23fb7185;%23f43f5e;%23fb7185" dur="2s" repeatCount="indefinite"/></stop><stop offset="100%" stop-color="%239f1239"><animate attributeName="stop-color" values="%239f1239;%23fb7185;%239f1239" dur="2s" repeatCount="indefinite"/></stop></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g4)"/></svg>`,
  // Emerald Glow
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g5"><stop offset="0%" stop-color="%2334d399"><animate attributeName="stop-color" values="%2334d399;%2310b981;%2334d399" dur="2.5s" repeatCount="indefinite"/></stop><stop offset="100%" stop-color="%23064e3b"><animate attributeName="stop-color" values="%23064e3b;%2310b981;%23064e3b" dur="2.5s" repeatCount="indefinite"/></stop></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(%23g5)"/></svg>`,
  // Midnight Spark
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%230f172a"/><circle cx="50" cy="50" r="2" fill="%23ffffff"><animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="indefinite"/><animate attributeName="r" values="1;4;1" dur="1.5s" repeatCount="indefinite"/></circle></svg>`
];

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    window.location.href = '/';
    return;
  }
  
  currentUser = session.user;
  
  // Fetch profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
    
  if (profile) {
    userProfile = profile;
    if (profile.taste_preferences) {
      selectedTastes = new Set(profile.taste_preferences);
    }
  } else {
    // Should have been created on signup, but fallback
    userProfile = { 
      id: currentUser.id, 
      email: currentUser.email, 
      name: currentUser.email.split('@')[0], 
      role: currentUser.email === ADMIN_EMAIL ? 'admin' : 'user' 
    };
  }

  renderProfile();
  renderTastes();

  // Event Listeners
  $('#profile-logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  });

  $('#profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = $('#profile-name').value.trim();
    
    const { error } = await supabase.from('user_profiles').upsert({
      id: currentUser.id,
      email: currentUser.email,
      name: newName,
      taste_preferences: Array.from(selectedTastes),
      role: userProfile.role // preserve role
    });
    
    if (!error) {
      userProfile.name = newName;
      renderProfile();
      const status = $('#profile-status');
      status.classList.remove('hidden');
      setTimeout(() => status.classList.add('hidden'), 3000);
    }
  });

  // Avatar Modal Logic
  $('#upload-overlay')?.addEventListener('click', openAvatarModal);
  $('#avatar-modal-close')?.addEventListener('click', closeAvatarModal);
  $('#avatar-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'avatar-modal-overlay') closeAvatarModal();
  });

  // Render presets
  const presetGrid = $('#preset-avatars-grid');
  if (presetGrid) {
    presetGrid.innerHTML = ANIMATED_PRESETS.map((svg, i) => `
      <button type="button" class="preset-avatar-btn w-full aspect-square rounded-full overflow-hidden hover:scale-105 transition-transform border-2 border-transparent hover:border-yc-gold focus:outline-none" data-index="${i}">
        <img src="${svg}" class="w-full h-full object-cover" />
      </button>
    `).join('');

    $$('.preset-avatar-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const svgUri = ANIMATED_PRESETS[btn.dataset.index];
        await saveAvatar(svgUri);
        closeAvatarModal();
      });
    });
  }

  // Handle custom upload via file input
  $('#avatar-upload-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const img = new Image();
        img.onload = async () => {
          // Resize image to 200x200 max to save space
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const size = Math.min(img.width, img.height);
          canvas.width = 200;
          canvas.height = 200;
          
          // Crop to center square
          const startX = (img.width - size) / 2;
          const startY = (img.height - size) / 2;
          
          ctx.drawImage(img, startX, startY, size, size, 0, 0, 200, 200);
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          
          await saveAvatar(base64);
          closeAvatarModal();
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
});

function openAvatarModal() {
  const overlay = $('#avatar-modal-overlay');
  overlay.classList.remove('opacity-0', 'pointer-events-none');
  overlay.querySelector('#avatar-modal-panel').classList.remove('scale-95', 'opacity-0');
}

function closeAvatarModal() {
  const overlay = $('#avatar-modal-overlay');
  overlay.classList.add('opacity-0', 'pointer-events-none');
  overlay.querySelector('#avatar-modal-panel').classList.add('scale-95', 'opacity-0');
}

async function saveAvatar(dataUri) {
  const { error } = await supabase.from('user_profiles').upsert({
    id: currentUser.id,
    email: currentUser.email,
    name: userProfile.name,
    taste_preferences: Array.from(selectedTastes),
    role: userProfile.role,
    avatar_url: dataUri
  });
  
  if (!error) {
    userProfile.avatar_url = dataUri;
    renderProfile();
  }
}


function renderProfile() {
  $('#profile-name').value = userProfile.name || '';
  $('#profile-email').value = userProfile.email || '';
  
  $('#profile-name-display').textContent = userProfile.name || 'User';
  $('#profile-email-display').textContent = userProfile.email;
  
  const initial = (userProfile.name || userProfile.email || '?').charAt(0).toUpperCase();
  const avatarContainer = $('#profile-avatar-container');
  
  if (userProfile.avatar_url) {
    // Clear initial
    $('#profile-initial').textContent = '';
    
    // Check if img exists
    let img = avatarContainer.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.className = 'absolute inset-0 w-full h-full object-cover z-0';
      avatarContainer.appendChild(img);
    }
    img.src = userProfile.avatar_url;
  } else {
    const img = avatarContainer.querySelector('img');
    if (img) img.remove();
    $('#profile-initial').textContent = initial;
  }

  // Admin access
  if (userProfile.role === 'admin' || currentUser.email === ADMIN_EMAIL) {
    $('#profile-admin-btn').classList.remove('hidden');
  }
}


function renderTastes() {
  const container = $('#taste-container');
  if (!container) return;
  
  container.innerHTML = TASTES.map(t => {
    const active = selectedTastes.has(t);
    const classes = active 
      ? 'bg-yc-navy text-white border-yc-navy shadow-sm' 
      : 'bg-white text-yc-textmuted border-yc-lavender hover:border-yc-softpurple';
      
    return `<button type="button" class="taste-toggle-btn px-5 py-2.5 rounded-full border text-sm font-medium transition-all ${classes}" data-taste="${t}">${t}</button>`;
  }).join('');
  
  $$('.taste-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const t = btn.dataset.taste;
      if (selectedTastes.has(t)) {
        selectedTastes.delete(t);
        btn.className = `taste-toggle-btn px-5 py-2.5 rounded-full border text-sm font-medium transition-all bg-white text-yc-textmuted border-yc-lavender hover:border-yc-softpurple`;
      } else {
        selectedTastes.add(t);
        btn.className = `taste-toggle-btn px-5 py-2.5 rounded-full border text-sm font-medium transition-all bg-yc-navy text-white border-yc-navy shadow-sm`;
      }
      
      // Auto save tastes
      await supabase.from('user_profiles').upsert({
        id: currentUser.id,
        email: currentUser.email,
        name: userProfile.name,
        taste_preferences: Array.from(selectedTastes),
        role: userProfile.role
      });
    });
  });
}
