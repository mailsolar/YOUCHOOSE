/**
 * YOUCHOOSE — Admin Panel JS
 * Simple credential-based auth, quota display, scrape button, job history
 * (v2 - Fixed dashboard layout bug)
 */

import './style.css';
import { supabase } from './supabaseClient.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ─────────────────────────────────────────────
// ADMIN CONFIG — email loaded from env, never in source
// ─────────────────────────────────────────────
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || '';

let isAuthenticated = false;

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Validate admin email is configured
  if (!ADMIN_EMAIL) {
    window.location.replace('/');
    return;
  }

  // Check if authenticated in Supabase
  const { data: { session } } = await supabase.auth.getSession();

  if (session && session.user.email === ADMIN_EMAIL) {
    showDashboard();
  } else {
    // Not authenticated — hard redirect, no flash
    window.location.replace('/');
    return;
  }

  // Logout
  $('#logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.replace('/');
  });
});


function showDashboard() {
  isAuthenticated = true;
  // Reveal dashboard only now — was hidden by CSS
  const dash = $('#admin-dashboard');
  if (dash) dash.style.display = 'block';
  $('#admin-email').textContent = ADMIN_EMAIL;

  // Load all dashboard data
  loadQuota();
  loadStats();
  loadJobs();

  // Auto-refresh
  setInterval(loadQuota, 30000);
  setInterval(loadJobs, 15000);
  setInterval(loadStats, 60000);
}


// ─────────────────────────────────────────────
// QUOTA
// ─────────────────────────────────────────────
async function loadQuota() {
  const today = new Date().toISOString().split('T')[0];

  let used = 0, limit = 1500;

  try {
    const { data } = await supabase
      .from('api_quota')
      .select('*')
      .eq('date', today)
      .single();

    if (data) {
      used = data.used || 0;
      limit = data.limit || 1500;
    }
  } catch (e) {
    // Table may not exist yet — show defaults
  }

  const remaining = Math.max(0, limit - used);
  const pct = Math.min(100, (used / limit) * 100);
  const available = remaining > 0;

  // Update quota display
  $('#btn-quota-text').textContent = `${used} / ${limit}`;

  const bar = $('#btn-quota-bar');
  bar.style.width = `${pct}%`;

  if (pct < 50) {
    bar.className = 'h-full rounded-full transition-all duration-700 ease-out bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]';
  } else if (pct < 80) {
    bar.className = 'h-full rounded-full transition-all duration-700 ease-out bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]';
  } else {
    bar.className = 'h-full rounded-full transition-all duration-700 ease-out bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]';
  }

  // Reset time
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  $('#btn-status-reset').textContent = 'Resets at ' + tomorrow.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
  }) + ' IST';
  
  $('#btn-quota-container').classList.remove('opacity-0');

  // Update scrape button
  updateScrapeButton(available, remaining);
}


function updateScrapeButton(available, remaining) {
  const btn = $('#scrape-btn');
  const label = $('#btn-label');
  const glow = $('#btn-glow');

  if (available) {
    btn.disabled = false;
    btn.className = 'w-48 h-48 rounded-full flex flex-col items-center justify-center gap-3 transition-all duration-500 shadow-lg relative overflow-hidden group bg-emerald-600 hover:bg-emerald-500 hover:scale-105 cursor-pointer text-white';
    glow.className = 'absolute inset-0 rounded-full opacity-30 bg-emerald-400 blur-xl group-hover:opacity-50 transition-opacity duration-1000';
    label.textContent = 'Start Scraping';
    btn.onclick = triggerScrape;
  } else {
    btn.disabled = true;
    btn.className = 'w-48 h-48 rounded-full flex flex-col items-center justify-center gap-3 transition-all duration-500 shadow-lg disabled:cursor-not-allowed relative overflow-hidden group bg-red-900/60 text-red-300';
    glow.className = 'absolute inset-0 rounded-full opacity-20 bg-red-500 blur-xl transition-opacity duration-1000';
    label.textContent = 'Quota Exhausted';
    btn.onclick = null;
  }
}


async function triggerScrape() {
  const btn = $('#scrape-btn');
  const label = $('#btn-label');

  btn.disabled = true;
  btn.className = 'w-48 h-48 rounded-full flex flex-col items-center justify-center gap-3 transition-all duration-500 shadow-lg relative overflow-hidden group bg-yc-gold text-yc-navy cursor-wait animate-pulse';
  label.textContent = 'Queued...';

  try {
    const { error } = await supabase
      .from('scrape_jobs')
      .insert({
        status: 'pending',
        triggered_by: ADMIN_EMAIL,
      });

    if (error) throw error;

    label.textContent = 'Job Created!';
  } catch (e) {
    label.textContent = 'Error';
    void /* error suppressed */('Failed to create job:', e);
  }

  setTimeout(loadJobs, 1000);
  setTimeout(loadQuota, 3000);
}


// ─────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────
async function loadStats() {
  try {
    const [restaurants, reviews, scraped, jobs] = await Promise.all([
      supabase.from('restaurants').select('id', { count: 'exact', head: true }),
      supabase.from('reviews').select('id', { count: 'exact', head: true }),
      supabase.from('scraped_urls').select('url', { count: 'exact', head: true }),
      supabase.from('scrape_jobs').select('id', { count: 'exact', head: true }),
    ]);

    $('#stat-restaurants').textContent = restaurants.count ?? 0;
    $('#stat-reviews').textContent = reviews.count ?? 0;
    $('#stat-scraped').textContent = scraped.count ?? 0;
    $('#stat-jobs').textContent = jobs.count ?? 0;
  } catch (e) {
    // Tables may not exist yet
  }
}


// ─────────────────────────────────────────────
// JOBS TABLE
// ─────────────────────────────────────────────
async function loadJobs() {
  try {
    const { data: jobs } = await supabase
      .from('scrape_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    const tbody = $('#jobs-table');

    if (!jobs || !jobs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-white/20 text-xs">No jobs yet. Click the green button to start your first scrape.</td></tr>';
      return;
    }

    tbody.innerHTML = jobs.map(job => {
      const statusColors = {
        pending: 'bg-yellow-500/20 text-yellow-400',
        running: 'bg-blue-500/20 text-blue-400 animate-pulse',
        done: 'bg-emerald-500/20 text-emerald-400',
        failed: 'bg-red-500/20 text-red-400',
      };

      const statusClass = statusColors[job.status] || 'bg-white/10 text-white/40';
      const date = new Date(job.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      return `
        <tr class="hover:bg-white/[0.02] transition-colors">
          <td class="px-6 py-3">
            <span class="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${statusClass}">${job.status}</span>
          </td>
          <td class="px-6 py-3 text-white/50 text-xs">${date}</td>
          <td class="px-6 py-3 text-center text-white/60">${job.videos_processed || 0}</td>
          <td class="px-6 py-3 text-center text-yc-gold font-semibold">${job.videos_added || 0}</td>
          <td class="px-6 py-3 text-white/30 text-xs truncate max-w-[200px]">${job.error_log || '—'}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    // Table may not exist yet
  }
}
