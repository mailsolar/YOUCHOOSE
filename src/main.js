/**
 * YOUCHOOSE - Main Frontend JS (v4: Geo-Location & City Discovery)
 * 
 * Features:
 *  - Live data from Supabase (restaurants + reviews)
 *  - Falls back to mock data if DB is empty
 *  - Geolocation detection (browser API + IP fallback)
 *  - City selector with search & override
 *  - India-focused cuisine filters
 *  - Proximity-based sorting
 *  - Multi-review detail modal
 *  - Supabase Realtime for live updates
 */

import './style.css';
import { supabase } from './supabaseClient.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let currentFilter = 'all';
let currentCity = 'all';
let userLat = null;
let userLng = null;
let detectedCity = null;
let leafletMap = null;
let allRestaurants = [];

// Popular Indian cities for the city selector
const INDIAN_CITIES = [
  { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { name: 'Delhi', lat: 28.7041, lng: 77.1025 },
  { name: 'Bangalore', lat: 12.9716, lng: 77.5946 },
  { name: 'Pune', lat: 18.5204, lng: 73.8567 },
  { name: 'Hyderabad', lat: 17.385, lng: 78.4867 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { name: 'Goa', lat: 15.2993, lng: 74.124 },
  { name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
  { name: 'Lucknow', lat: 26.8467, lng: 80.9462 },
  { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { name: 'Kochi', lat: 9.9312, lng: 76.2673 },
  { name: 'Thane', lat: 19.2183, lng: 72.9781 },
  { name: 'Chandigarh', lat: 30.7333, lng: 76.7794 },
  { name: 'Varanasi', lat: 25.3176, lng: 82.9739 },
  { name: 'Amritsar', lat: 31.634, lng: 74.8723 },
  { name: 'Navi Mumbai', lat: 19.033, lng: 73.0297 },
  { name: 'Indore', lat: 22.7196, lng: 75.8577 },
  { name: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
  { name: 'Nagpur', lat: 21.1458, lng: 79.0882 },
];

// ─────────────────────────────────────────────
// MOCK DATA — fallback when DB is empty
// ─────────────────────────────────────────────
const MOCK_DATA = [
  { id: 'm1', name: "Bademiya", cuisine: 'Mughlai', category: 'street_stall', city: 'Mumbai', rank_score: 0.88, review_count: 1, address: 'Tulloch Rd, Behind Taj Hotel, Colaba', lat: 18.9217, lng: 72.8332, hours: 'Until 4 AM', parking: 'difficult',
    reviews: [{ creator_name: 'MumbaiFoodie', creator_handle: '@mumbaifoodie', rating: 4.6, dishes: ['Seekh Kebab', 'Chicken Tikka Roll'], thumbnail_url: null, video_url: null }] },
  { id: 'm2', name: 'Karim\'s', cuisine: 'Mughlai', category: 'restaurant', city: 'Delhi', rank_score: 0.91, review_count: 1, address: '16, Gali Kababian, Jama Masjid', lat: 28.6506, lng: 77.2340, hours: 'Until 12:30 AM', parking: 'difficult',
    reviews: [{ creator_name: 'DelhiFoodWalks', creator_handle: '@delhifoodwalks', rating: 4.8, dishes: ['Mutton Burra', 'Chicken Jahangiri'], thumbnail_url: null, video_url: null }] },
  { id: 'm3', name: 'MTR 1924', cuisine: 'South Indian', category: 'restaurant', city: 'Bangalore', rank_score: 0.85, review_count: 1, address: '14, Lalbagh Rd, Mavalli', lat: 12.9529, lng: 77.5779, hours: 'Until 9:30 PM', parking: 'available',
    reviews: [{ creator_name: 'BangaloreEats', creator_handle: '@bangaloreeats', rating: 4.7, dishes: ['Masala Dosa', 'Rava Idli', 'Filter Coffee'], thumbnail_url: null, video_url: null }] },
  { id: 'm4', name: 'Vohuman Cafe', cuisine: 'Irani Cafe', category: 'cafe', city: 'Pune', rank_score: 0.78, review_count: 1, address: '1251/1, Dastur Meher Rd, Camp', lat: 18.5196, lng: 73.8734, hours: 'Until 11:30 PM', parking: 'difficult',
    reviews: [{ creator_name: 'PuneFoodies', creator_handle: '@punefoodies', rating: 4.5, dishes: ['Bun Maska', 'Irani Chai', 'Keema Pav'], thumbnail_url: null, video_url: null }] },
  { id: 'm5', name: 'Paradise Biryani', cuisine: 'Biryani', category: 'restaurant', city: 'Hyderabad', rank_score: 0.92, review_count: 1, address: 'SD Rd, Secunderabad', lat: 17.4399, lng: 78.4983, hours: 'Until 11 PM', parking: 'available',
    reviews: [{ creator_name: 'FoodieExplorers', creator_handle: '@foodieexplorers', rating: 4.9, dishes: ['Hyderabadi Biryani', 'Mirchi Ka Salan'], thumbnail_url: null, video_url: null }] },
  { id: 'm6', name: 'Murugan Idli Shop', cuisine: 'South Indian', category: 'restaurant', city: 'Chennai', rank_score: 0.80, review_count: 1, address: 'T Nagar, Chennai', lat: 13.0418, lng: 80.2341, hours: 'Until 10 PM', parking: 'available',
    reviews: [{ creator_name: 'ChennaiCravings', creator_handle: '@chennaicravings', rating: 4.6, dishes: ['Idli', 'Podi Dosa', 'Sambar'], thumbnail_url: null, video_url: null }] },
];


// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
// GLOBAL ERROR HANDLERS
// Catch unhandled promise rejections and errors without exposing internals.
// ─────────────────────────────────────────────
window.addEventListener('unhandledrejection', (event) => {
  // Prevent the raw error from appearing in console in production
  event.preventDefault();
  // Log only in development (Vite sets MODE to 'development' in dev)
  if (import.meta.env.DEV) {
    console.error('[YOUCHOOSE] Unhandled rejection:', event.reason);
  }
});

window.addEventListener('error', (event) => {
  if (import.meta.env.DEV) {
    console.error('[YOUCHOOSE] Global error:', event.error);
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  initHeader();
  initScrollReveals();
  initFilters();
  initSearch();
  initDetailPanel();
  initKeyboard();
  initAuth();
  initCitySelector();
  initCustomCursor();
  initLiquidScrollbar();
  initLiveClock();

  // Detect location + load data
  await detectLocation();
  await loadRestaurants();

  // Realtime: listen for new restaurants
  supabase
    .channel('restaurant-inserts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'restaurants' }, async () => {
      await loadRestaurants();
    })
    .subscribe();
});


// ─────────────────────────────────────────────
// CUSTOM CURSOR
// ─────────────────────────────────────────────
function initCustomCursor() {
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  let mouseX = 0, mouseY = 0;
  let ringX = 0, ringY = 0;
  let animId;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left = mouseX + 'px';
    dot.style.top  = mouseY + 'px';
  }, { passive: true });

  function animateRing() {
    ringX += (mouseX - ringX) * 0.15;
    ringY += (mouseY - ringY) * 0.15;
    ring.style.left = ringX + 'px';
    ring.style.top  = ringY + 'px';
    animId = requestAnimationFrame(animateRing);
  }
  animateRing();

  // Hover state on interactive elements
  const hoverTargets = 'a, button, .restaurant-card, .filter-pill, input, [role="button"]';
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest(hoverTargets)) document.body.classList.add('cursor-hover');
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest(hoverTargets)) document.body.classList.remove('cursor-hover');
  });
  document.addEventListener('mousedown', () => document.body.classList.add('cursor-click'));
  document.addEventListener('mouseup', () => document.body.classList.remove('cursor-click'));

  // Hide on touch devices
  document.addEventListener('touchstart', () => {
    cancelAnimationFrame(animId);
    dot.style.display = 'none';
    ring.style.display = 'none';
  }, { once: true });
}


// ─────────────────────────────────────────────
// LIQUID SCROLLBAR + PAGE PROGRESS
// ─────────────────────────────────────────────
function initLiquidScrollbar() {
  const thumb    = document.getElementById('liquid-scrollbar-thumb');
  const progress = document.getElementById('page-progress');
  const label    = document.getElementById('scroll-pct-label');

  if (!thumb) return;

  const update = () => {
    const scrollTop = window.scrollY;
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docH > 0 ? Math.min(1, scrollTop / docH) : 0;

    // Thumb position within track (track is 60vh = 60% of viewport)
    const trackH = window.innerHeight * 0.6;
    const thumbH = Math.max(40, trackH * 0.25); // 25% of track
    const thumbTop = pct * (trackH - thumbH);

    thumb.style.top    = thumbTop + 'px';
    thumb.style.height = thumbH + 'px';

    if (progress) progress.style.width = (pct * 100) + '%';
    if (label) label.textContent = Math.round(pct * 100) + '%';
  };

  window.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  update();
}


// ─────────────────────────────────────────────
// LIVE CLOCK (IST)
// ─────────────────────────────────────────────
function initLiveClock() {
  const timeEl = document.getElementById('live-time-ist');
  const dateEl = document.getElementById('live-date');

  if (!timeEl && !dateEl) return;

  const tick = () => {
    const now = new Date();
    const opts = { timeZone: 'Asia/Kolkata' };
    const timeStr = now.toLocaleTimeString('en-IN', { ...opts, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const dateStr = now.toLocaleDateString('en-IN', { ...opts, weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    if (timeEl) timeEl.textContent = `IST — ${timeStr}`;
    if (dateEl) dateEl.textContent = dateStr;
  };

  tick();
  setInterval(tick, 1000);
}



// ─────────────────────────────────────────────
// GEO-LOCATION DETECTION
// ─────────────────────────────────────────────
async function detectLocation() {
  const label = $('#city-label');
  const subtitle = $('#location-subtitle');

  // Try browser geolocation first
  if ('geolocation' in navigator) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 600000, // cache for 10 minutes
        });
      });

      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      detectedCity = findNearestCity(userLat, userLng);

      if (detectedCity) {
        currentCity = detectedCity.name.toLowerCase();
        if (label) label.textContent = detectedCity.name;
        if (subtitle) subtitle.textContent = `The best spots in ${detectedCity.name} and nearby.`;
        return;
      }
    } catch (e) {
      console.log('Geolocation denied or failed, trying IP fallback...');
    }
  }

  // IP-based fallback (free, no API key needed)
  try {
    const resp = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
    const data = await resp.json();
    if (data.city) {
      userLat = data.latitude;
      userLng = data.longitude;
      detectedCity = findNearestCity(userLat, userLng) || { name: data.city };
      currentCity = detectedCity.name.toLowerCase();
      if (label) label.textContent = detectedCity.name;
      if (subtitle) subtitle.textContent = `The best spots in ${detectedCity.name} and nearby.`;
      return;
    }
  } catch (e) {
    console.log('IP geolocation failed.');
  }

  // Final fallback: show all cities
  currentCity = 'all';
  if (label) label.textContent = 'All Cities';
  if (subtitle) subtitle.textContent = 'The most exceptional spots across India.';
}

function findNearestCity(lat, lng) {
  let nearest = null;
  let minDist = Infinity;

  for (const city of INDIAN_CITIES) {
    const dist = haversine(lat, lng, city.lat, city.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = city;
    }
  }

  // Only match if within 50km
  return minDist < 50 ? nearest : null;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// ─────────────────────────────────────────────
// CITY SELECTOR
// ─────────────────────────────────────────────
function initCitySelector() {
  const btn = $('#city-selector-btn');
  const dropdown = $('#city-dropdown');
  const cityList = $('#city-list');
  const searchInput = $('#city-search-input');

  if (!btn || !dropdown) return;

  // Populate city list
  renderCityList(INDIAN_CITIES);

  // Toggle dropdown
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.classList.contains('opacity-0');
    if (isOpen) {
      closeCityDropdown();
    } else {
      dropdown.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
      if (searchInput) { searchInput.value = ''; searchInput.focus(); }
      renderCityList(INDIAN_CITIES);
    }
  });

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      closeCityDropdown();
    }
  });

  // Search filter
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const filtered = q
        ? INDIAN_CITIES.filter(c => c.name.toLowerCase().includes(q))
        : INDIAN_CITIES;
      renderCityList(filtered);
    });
  }

  // Handle "All Cities" and "Near Me" buttons
  document.querySelectorAll('.city-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const city = opt.dataset.city;
      if (city === 'all') {
        selectCity('all', 'All Cities');
      } else if (city === 'nearby') {
        if (detectedCity) {
          selectCity(detectedCity.name.toLowerCase(), detectedCity.name);
        } else {
          selectCity('all', 'All Cities');
        }
      }
    });
  });
}

function renderCityList(cities) {
  const cityList = $('#city-list');
  if (!cityList) return;

  cityList.innerHTML = cities.map(c => `
    <button class="city-option" data-city="${c.name.toLowerCase()}" data-label="${c.name}">
      <span style="width:20px;height:20px;border-radius:50%;background:var(--cream);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--ink);flex-shrink:0;">${c.name.charAt(0)}</span>
      ${c.name}
    </button>
  `).join('');

  // Bind clicks
  cityList.querySelectorAll('.city-option').forEach(item => {
    item.addEventListener('click', () => {
      selectCity(item.dataset.city, item.dataset.label);
    });
  });
}

function selectCity(cityKey, cityLabel) {
  currentCity = cityKey;
  const label = $('#city-label');
  const subtitle = $('#location-subtitle');

  if (label) label.textContent = cityLabel;

  if (cityKey === 'all') {
    if (subtitle) subtitle.textContent = 'The most exceptional spots across India.';
  } else {
    if (subtitle) subtitle.textContent = `The best spots in ${cityLabel} and nearby.`;
  }

  closeCityDropdown();
  renderGrid(filtered());
}

function closeCityDropdown() {
  const dropdown = $('#city-dropdown');
  if (dropdown) {
    dropdown.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
  }
}


// ─────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────
async function loadRestaurants() {
  try {
    const { data: restaurants, error } = await supabase
      .from('restaurants')
      .select('*, reviews(*)')
      .order('rank_score', { ascending: false })
      .limit(100);

    if (error) throw error;

    if (restaurants && restaurants.length > 0) {
      allRestaurants = restaurants;
    } else {
      allRestaurants = MOCK_DATA;
    }
  } catch (e) {
    console.warn('Supabase fetch failed, using mock data:', e);
    allRestaurants = MOCK_DATA;
  }

  renderGrid(filtered());
}


// ─────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────
function initHeader() {
  const header = $('#header');
  window.addEventListener('scroll', () => {
    requestAnimationFrame(() => header.classList.toggle('scrolled', window.scrollY > 40));
  }, { passive: true });
}


// ─────────────────────────────────────────────
// SCROLL REVEALS
// ─────────────────────────────────────────────
function initScrollReveals() {
  const io = new IntersectionObserver(
    (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } }),
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );
  $$('.fade-up:not(#hero .fade-up)').forEach(el => io.observe(el));
}


// ─────────────────────────────────────────────
// FILTERS — India-focused
// ─────────────────────────────────────────────
function initFilters() {
  $$('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderGrid(filtered());
    });
  });
}

function filtered() {
  let data = allRestaurants;

  // City filter
  if (currentCity !== 'all') {
    data = data.filter(d => {
      const city = (d.city || '').toLowerCase();
      return city.includes(currentCity);
    });

    // If we have user coordinates, sort by proximity
    if (userLat && userLng) {
      data = data.sort((a, b) => {
        const distA = (a.lat && a.lng) ? haversine(userLat, userLng, a.lat, a.lng) : 99999;
        const distB = (b.lat && b.lng) ? haversine(userLat, userLng, b.lat, b.lng) : 99999;
        return distA - distB;
      });
    }
  }

  // Cuisine filter
  if (currentFilter !== 'all') {
    data = data.filter(d => {
      const cuisine = (d.cuisine || '').toLowerCase();
      const cat = (d.category || '').toLowerCase();

      switch (currentFilter) {
        case 'street_food': return cuisine.includes('street') || cat === 'street_stall' || cat === 'food_truck';
        case 'north_indian': return cuisine.includes('north indian') || cuisine.includes('mughlai') || cuisine.includes('punjabi');
        case 'south_indian': return cuisine.includes('south indian') || cuisine.includes('chettinad') || cuisine.includes('kerala');
        case 'cafe': return cat === 'cafe' || cuisine.includes('cafe') || cuisine.includes('coffee') || cuisine.includes('bakery');
        case 'biryani': return cuisine.includes('biryani');
        case 'chinese': return cuisine.includes('chinese') || cuisine.includes('indo-chinese');
        case 'seafood': return cuisine.includes('seafood') || cuisine.includes('fish');
        default: return true;
      }
    });
  }

  return data;
}


// ─────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────
function initSearch() {
  const input = $('#search-input');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { renderGrid(filtered()); return; }
    const matches = filtered().filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.cuisine || '').toLowerCase().includes(q) ||
      (d.city || '').toLowerCase().includes(q) ||
      (d.address || '').toLowerCase().includes(q)
    );
    renderGrid(matches);
  });
}


// ─────────────────────────────────────────────
// GRID RENDER
// ─────────────────────────────────────────────
function renderGrid(data) {
  const grid = $('#grid');
  if (!grid) return;

  if (!data.length) {
    grid.innerHTML = `
      <div class="col-span-full py-24 text-center" id="empty-state">
        <p class="text-5xl mb-4" style="font-family: 'Cormorant Garamond', serif; color: rgba(12,10,8,0.1);">∅</p>
        <p style="font-family: 'Cormorant Garamond', serif; font-style: italic; color: var(--muted); font-size: 1.25rem;">No restaurants found for this selection.</p>
        <p style="color: var(--muted); font-size: 0.8rem; margin-top: 0.5rem; font-weight: 300;">Try a different filter or city.</p>
      </div>`;
    return;
  }

  grid.innerHTML = data.map((d, i) => {
    const name = d.name || d.restaurant;
    const reviews = d.reviews || [];
    const topReview = reviews[0] || {};
    const avgRating = reviews.length
      ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : (d.rank_score ? (d.rank_score * 5).toFixed(1) : null);
    const initial = name ? name.charAt(0) : '?';
    const reviewCount = d.review_count || reviews.length || 0;
    const thumbnail = topReview.thumbnail_url;
    const cityName = d.city || '';
    const distanceText = (userLat && userLng && d.lat && d.lng)
      ? `${haversine(userLat, userLng, d.lat, d.lng).toFixed(1)} km`
      : null;
    const dishes = [...new Set(reviews.flatMap(r => r.dishes || []))].slice(0, 3);

    return `
      <article class="restaurant-card" data-id="${d.id}" style="transition-delay: ${Math.min(i * 50, 400)}ms">

        <!-- Image area -->
        <div class="card-image-wrapper">
          ${thumbnail
            ? `<img src="${thumbnail}" alt="${name}" loading="lazy" />`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#F0EBE3,#E8E4DC);">
                 <span style="font-family:'Cormorant Garamond',serif;font-size:3rem;color:rgba(12,10,8,0.12);font-style:italic;">${initial}</span>
               </div>`
          }
          
          <!-- Cuisine badge -->
          <div class="card-cuisine-badge">${d.cuisine || 'Restaurant'}</div>

          <!-- Rating badge -->
          ${avgRating ? `<div class="card-rating-badge">${avgRating}</div>` : ''}

          <!-- Hover CTA -->
          <div class="card-hover-action">
            <span class="card-action-btn">
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              View Details
            </span>
          </div>
        </div>

        <!-- Card body -->
        <div class="card-body">
          <h3 class="card-title">${name}</h3>
          ${cityName || distanceText ? `
          <div class="card-location">
            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/></svg>
            ${cityName}${distanceText ? ` <span style="opacity:0.5;margin-left:4px">· ${distanceText}</span>` : ''}
          </div>` : ''}

          ${dishes.length ? `
          <div class="card-dishes">
            ${dishes.map(dish => `<span class="card-dish-tag">${dish}</span>`).join('')}
          </div>` : ''}

          <div class="card-meta-line">
            <span class="card-review-count">${reviewCount} review${reviewCount !== 1 ? 's' : ''}</span>
            <div class="card-arrow-icon">
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Observe cards for fade-in
  const io = new IntersectionObserver(
    (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } }),
    { threshold: 0.08, rootMargin: '30px' }
  );

  grid.querySelectorAll('.restaurant-card').forEach(card => {
    io.observe(card);

    // Click to open detail
    card.addEventListener('click', () => {
      const item = allRestaurants.find(d => String(d.id) === card.dataset.id);
      if (item) openDetail(item);
    });

    // 3D tilt on hover
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(800px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}


// ─────────────────────────────────────────────
// DETAIL MODAL - Multi-Review
// ─────────────────────────────────────────────
function initDetailPanel() {
  $('#detail-close')?.addEventListener('click', closeDetail);
  $('#detail-backdrop')?.addEventListener('click', closeDetail);
}

function openDetail(item) {
  const name = item.name || item.restaurant;
  const reviews = item.reviews || [];
  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : null;

  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('#detail-name', name);
  set('#detail-cuisine', item.cuisine || '');
  set('#detail-rating', avgRating ? `${avgRating} avg from ${reviews.length || 1} review${reviews.length !== 1 ? 's' : ''}` : 'No rating yet');
  set('#detail-hours', item.hours || 'Hours N/A');
  set('#detail-address', [item.address, item.city].filter(Boolean).join(', ') || 'Address unknown');

  const dirBtn = $('#detail-directions-btn');
  if (dirBtn) {
    dirBtn.classList.remove('hidden');
    if (item.lat && item.lng) {
      dirBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`;
    } else {
      const query = encodeURIComponent([name, item.city, 'India'].filter(Boolean).join(' '));
      dirBtn.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
    }
  }

  const parkEl = $('#detail-parking');
  if (parkEl) {
    parkEl.textContent = item.parking === 'available' ? 'Parking Available' : item.parking === 'difficult' ? 'Limited Parking' : 'Unknown';
    parkEl.className = item.parking === 'available'
      ? 'inline-flex items-center px-3 py-1 rounded-full bg-white border border-yc-lavender text-yc-textmuted text-sm'
      : 'inline-flex items-center px-3 py-1 rounded-full bg-white border border-orange-200 text-orange-600 text-sm';
  }

  const topReview = reviews[0] || {};
  set('#detail-avatar', (topReview.creator_name || '?').charAt(0));
  set('#detail-creator-name', topReview.creator_name || 'Unknown');
  set('#detail-creator-handle', topReview.creator_handle || '');

  const allDishes = [...new Set(reviews.flatMap(r => r.dishes || []))];
  const dishesEl = $('#detail-dishes');
  if (dishesEl) {
    dishesEl.innerHTML = allDishes.length
      ? allDishes.map(d => `<span class="px-3 py-1.5 bg-yc-cream border border-yc-lavender rounded-full text-xs text-yc-navy font-medium">${d}</span>`).join('')
      : '<span class="text-xs text-yc-textmuted">No dishes mentioned</span>';
  }

  let reviewsContainer = $('#detail-reviews');
  if (!reviewsContainer) {
    const parent = dishesEl?.parentElement?.parentElement;
    if (parent) {
      const section = document.createElement('div');
      section.id = 'detail-reviews';
      section.className = 'mt-6';
      parent.appendChild(section);
      reviewsContainer = section;
    }
  }

  if (reviewsContainer && reviews.length > 0) {
    reviewsContainer.innerHTML = `
      <h4 class="text-xs font-semibold text-yc-textmuted uppercase tracking-wider mb-3">All Reviews (${reviews.length})</h4>
      <div class="space-y-3 max-h-48 overflow-y-auto">
        ${reviews.map(r => `
          <div class="flex items-start gap-3 p-3 bg-white border border-yc-lavender/50 rounded-xl">
            <div class="w-8 h-8 rounded-full bg-yc-navy flex items-center justify-center flex-shrink-0">
              <span class="text-[10px] text-yc-gold font-serif">${(r.creator_name || '?').charAt(0)}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-medium text-yc-navy">${r.creator_name || 'Unknown'}</span>
                <span class="text-[10px] text-yc-textmuted">${r.creator_handle || ''}</span>
                ${r.rating ? `<span class="ml-auto text-xs font-semibold text-yc-amber">${r.rating}</span>` : ''}
              </div>
              ${r.dishes && r.dishes.length ? `<p class="text-[11px] text-yc-textmuted truncate">${r.dishes.join(', ')}</p>` : ''}
              ${r.video_url ? `<a href="${r.video_url}" target="_blank" rel="noopener" class="text-[10px] text-yc-softpurple hover:underline mt-1 inline-block">Watch review</a>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (reviewsContainer) {
    reviewsContainer.innerHTML = '';
  }

  const overlay = $('#detail-overlay');
  overlay.classList.remove('opacity-0', 'pointer-events-none');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  setTimeout(() => initMap(item.lat, item.lng, name, item.city), 500);
}

function closeDetail() {
  const overlay = $('#detail-overlay');
  overlay.classList.remove('open');
  overlay.classList.add('opacity-0', 'pointer-events-none');
  document.body.style.overflow = '';
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  const container = $('#detail-map');
  if (container) container.innerHTML = '';
}

function initMap(lat, lng, name, city) {
  const container = $('#detail-map');
  if (!container) return;

  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  container.innerHTML = ''; // Clear existing map/iframe

  if (lat && lng) {
    leafletMap = L.map(container, { center: [lat, lng], zoom: 15, zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(leafletMap);
    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);

    const icon = L.divIcon({ html: '<div class="map-pin-elegant"></div>', className: '', iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -10] });
    L.marker([lat, lng], { icon }).addTo(leafletMap).bindPopup(name).openPopup();
    setTimeout(() => leafletMap.invalidateSize(), 100);
  } else {
    // Fallback: Try on-the-fly frontend geocoding (bypasses backend rate limits)
    container.innerHTML = '<div class="flex items-center justify-center h-full w-full text-yc-navy/40 text-sm font-medium animate-pulse">Searching map...</div>';
    
    const query = encodeURIComponent([name, city, 'India'].filter(Boolean).join(', '));
    fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          // Success! Call initMap again with the new coordinates
          initMap(parseFloat(data[0].lat), parseFloat(data[0].lon), name, city);
        } else {
          // Final fallback: Google Maps Iframe
          container.innerHTML = `<iframe 
            width="100%" 
            height="100%" 
            frameborder="0" 
            scrolling="no" 
            marginheight="0" 
            marginwidth="0" 
            src="https://www.google.com/maps?width=100%25&amp;height=100%25&amp;hl=en&amp;q=${query}&amp;t=&amp;z=15&amp;ie=UTF8&amp;iwloc=B&amp;output=embed">
          </iframe>`;
        }
      })
      .catch(() => {
        container.innerHTML = `<iframe 
          width="100%" 
          height="100%" 
          frameborder="0" 
          scrolling="no" 
          marginheight="0" 
          marginwidth="0" 
          src="https://www.google.com/maps?width=100%25&amp;height=100%25&amp;hl=en&amp;q=${query}&amp;t=&amp;z=15&amp;ie=UTF8&amp;iwloc=B&amp;output=embed">
        </iframe>`;
      });
  }
}

// ─────────────────────────────────────────────
// KEYBOARD
// ─────────────────────────────────────────────
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = $('#detail-overlay');
      if (overlay?.classList.contains('open')) closeDetail();
      
      const authOverlay = $('#auth-modal-overlay');
      if (authOverlay && !authOverlay.classList.contains('opacity-0')) {
        closeAuthModal();
      }

      closeCityDropdown();
    }
  });
}

// ─────────────────────────────────────────────
// AUTHENTICATION & MODAL
// ─────────────────────────────────────────────
let currentUser = null;
let userProfile = null;
let isSignUpMode = false;
const ADMIN_EMAIL = 'deepaknair1104@gmail.com';

// ── Client-side rate limiting ────────────────
// Prevents brute-force login attempts in the UI.
// Real rate limiting is enforced by Supabase on the server side.
const AUTH_MAX_ATTEMPTS = 5;         // max failures before lockout
const AUTH_LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutes
let authAttempts  = 0;
let authLockedUntil = null;

// ── User-friendly error messages ────────────
// Maps internal Supabase error messages to generic messages
// so we never leak server details to the user.
function sanitizeAuthError(message = '') {
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('wrong password')) {
    return 'Incorrect email or password.';
  }
  if (m.includes('email not confirmed')) {
    return 'Please check your email and confirm your account before signing in.';
  }
  if (m.includes('user already registered') || m.includes('already exists')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (m.includes('password should be')) {
    return 'Password must be at least 6 characters long.';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Network error. Please check your connection and try again.';
  }
  // Generic fallback — never expose raw server error
  return 'Something went wrong. Please try again.';
}

const TASTES = ['North Indian', 'South Indian', 'Street Food', 'Biryani', 'Chinese', 'Italian', 'Cafe', 'Seafood', 'Fine Dining', 'Mughlai'];
let selectedTastes = new Set();

async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await handleLoginSuccess(session.user);
  }

  $('#header-login-btn')?.addEventListener('click', openAuthModal);
  $('#auth-modal-close')?.addEventListener('click', closeAuthModal);
  $('#auth-modal-backdrop')?.addEventListener('click', closeAuthModal);
  
  $('#auth-toggle-btn')?.addEventListener('click', toggleAuthMode);
  $('#auth-form')?.addEventListener('submit', handleAuthSubmit);

  $('#header-avatar-btn')?.addEventListener('click', () => {
    $('#header-dropdown').classList.toggle('opacity-0');
    $('#header-dropdown').classList.toggle('pointer-events-none');
    $('#header-dropdown').classList.toggle('-translate-y-2');
  });

  $('#dropdown-logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
  });

  const container = $('#auth-tastes-container');
  if (container) {
    container.innerHTML = TASTES.map(t => 
      `<button type="button" class="taste-btn px-3 py-1.5 rounded-full border border-yc-lavender text-xs text-yc-textmuted hover:border-yc-softpurple transition-colors" data-taste="${t}">${t}</button>`
    ).join('');
    
    $$('.taste-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.taste;
        if (selectedTastes.has(t)) {
          selectedTastes.delete(t);
          btn.classList.remove('bg-yc-navy', 'text-white', 'border-yc-navy');
          btn.classList.add('text-yc-textmuted', 'border-yc-lavender');
        } else {
          selectedTastes.add(t);
          btn.classList.add('bg-yc-navy', 'text-white', 'border-yc-navy');
          btn.classList.remove('text-yc-textmuted', 'border-yc-lavender');
        }
      });
    });
  }
}

function openAuthModal() {
  const overlay = $('#auth-modal-overlay');
  overlay.classList.remove('opacity-0', 'pointer-events-none');
  overlay.querySelector('#auth-modal-panel').classList.remove('scale-95', 'opacity-0');
}

function closeAuthModal() {
  const overlay = $('#auth-modal-overlay');
  overlay.classList.add('opacity-0', 'pointer-events-none');
  overlay.querySelector('#auth-modal-panel').classList.add('scale-95', 'opacity-0');
}

function toggleAuthMode() {
  isSignUpMode = !isSignUpMode;
  $('#auth-modal-title').textContent = isSignUpMode ? 'Create Account' : 'Welcome Back';
  $('#auth-modal-subtitle').textContent = isSignUpMode ? 'Join to personalize your discovery.' : 'Sign in to discover your next favorite spot.';
  $('#auth-submit-btn').textContent = isSignUpMode ? 'Sign Up' : 'Sign In';
  $('#auth-toggle-text').textContent = isSignUpMode ? 'Already have an account?' : 'New here?';
  $('#auth-toggle-btn').textContent = isSignUpMode ? 'Sign in' : 'Create an account';
  
  if (isSignUpMode) {
    $('#auth-name-group').classList.remove('hidden');
    $('#auth-tastes-group').classList.remove('hidden');
    $('#auth-name').required = true;
  } else {
    $('#auth-name-group').classList.add('hidden');
    $('#auth-tastes-group').classList.add('hidden');
    $('#auth-name').required = false;
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const errorEl = $('#auth-error-msg');
  const btn = $('#auth-submit-btn');

  // ── Rate limiting check ──
  if (authLockedUntil && Date.now() < authLockedUntil) {
    const mins = Math.ceil((authLockedUntil - Date.now()) / 60000);
    errorEl.textContent = `Too many failed attempts. Please wait ${mins} minute${mins !== 1 ? 's' : ''} before trying again.`;
    errorEl.classList.remove('hidden');
    return;
  }

  errorEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Please wait...';

  try {
    if (isSignUpMode) {
      const name = $('#auth-name').value.trim();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      // Reset attempt counter on success
      authAttempts = 0;
      authLockedUntil = null;

      if (data.user) {
        await supabase.from('user_profiles').upsert({
          id: data.user.id,
          email: email,
          name: name,
          role: email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user',
          taste_preferences: Array.from(selectedTastes)
        });
        await handleLoginSuccess(data.user);
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Reset attempt counter on success
      authAttempts = 0;
      authLockedUntil = null;

      await handleLoginSuccess(data.user);
    }
    closeAuthModal();
  } catch (err) {
    // Track failed sign-in attempts (only for sign-in, not sign-up)
    if (!isSignUpMode) {
      authAttempts++;
      if (authAttempts >= AUTH_MAX_ATTEMPTS) {
        authLockedUntil = Date.now() + AUTH_LOCKOUT_MS;
        authAttempts = 0;
      }
    }

    // Show a sanitized, user-friendly error — never the raw server message
    const friendlyMsg = sanitizeAuthError(err.message);
    errorEl.textContent = friendlyMsg;
    errorEl.classList.remove('hidden');

    // Log full error only in development
    if (import.meta.env.DEV) {
      console.error('[Auth error]', err);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = isSignUpMode ? 'Sign Up' : 'Sign In';
  }
}

async function handleLoginSuccess(user) {
  currentUser = user;
  
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('email', user.email)
    .single();
    
  const email = user.email ? user.email.toLowerCase() : '';
  const isAdmin = email === ADMIN_EMAIL.toLowerCase();

  userProfile = profile || { name: email.split('@')[0], email: email, role: isAdmin ? 'admin' : 'user' };

  $('#header-login-btn').style.display = 'none';
  $('#header-user-menu').classList.remove('hidden');
  
  const initial = (userProfile.name || userProfile.email || '?').charAt(0).toUpperCase();
  const avatarBtn = $('#header-avatar-btn');
  
  if (userProfile.avatar_url) {
    avatarBtn.innerHTML = `<img src="${userProfile.avatar_url}" class="w-full h-full rounded-full object-cover" />`;
  } else {
    avatarBtn.textContent = initial;
  }
  
  $('#dropdown-name').textContent = userProfile.name || 'User';
  $('#dropdown-email').textContent = userProfile.email;
  
  if (userProfile.role === 'admin' || isAdmin) {
    $('#dropdown-admin-link').classList.remove('hidden');
  } else {
    $('#dropdown-admin-link').classList.add('hidden');
  }
}

