/**
 * YOUCHOOSE — Supabase Client Configuration
 * Shared between main app and admin panel.
 *
 * Keys are loaded from environment variables (VITE_ prefix for Vite).
 * In development: set values in root .env (never commit that file).
 * In production: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 *                as environment variables in your hosting platform.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[YOUCHOOSE] Missing Supabase environment variables.\n' +
    'Create a .env file at the project root with:\n' +
    '  VITE_SUPABASE_URL=...\n' +
    '  VITE_SUPABASE_ANON_KEY=...'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session in localStorage (default) — fine for SPA
    persistSession: true,
    // Auto-refresh the JWT before it expires
    autoRefreshToken: true,
    // Detect session in URL hash (needed for magic links / OAuth)
    detectSessionInUrl: true,
  },
});
