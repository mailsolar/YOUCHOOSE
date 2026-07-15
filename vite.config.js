import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => ({
  root: '.',
  publicDir: 'public',

  build: {
    outDir: 'dist',

    // SECURITY: Disable source maps in production.
    // Source maps expose your full readable source code to anyone who opens DevTools.
    sourcemap: mode === 'development' ? 'inline' : false,

    rollupOptions: {
      input: {
        main:    resolve(__dirname, 'index.html'),
        admin:   resolve(__dirname, 'admin.html'),
        profile: resolve(__dirname, 'profile.html'),
      },
    },
  },

  // SECURITY: Inject security headers in dev server.
  // For production, these must also be set at the hosting layer (Vercel/Netlify config).
  server: {
    headers: securityHeaders(),
  },

  preview: {
    headers: securityHeaders(),
  },
}));

function securityHeaders() {
  return {
    // Prevent clickjacking — disallow embedding in iframes from other origins
    'X-Frame-Options': 'SAMEORIGIN',

    // Prevent MIME-type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Don't send Referer header to external sites
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Restrict features available to the page
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',

    // Content Security Policy
    // - Allows Supabase, Google Fonts, Leaflet tiles, Nominatim, YouTube embeds
    // - Blocks inline scripts (except what Vite needs in dev)
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",          // unsafe-inline needed for Vite HMR in dev; tighten for prod
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://i.ytimg.com https://img.youtube.com https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co https://nominatim.openstreetmap.org wss://*.supabase.co",
      "frame-src https://www.youtube.com https://maps.google.com https://*.basemaps.cartocdn.com",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),

    // HSTS — tell browsers to always use HTTPS for this domain (1 year)
    // Only effective when served over HTTPS (i.e., in production, not localhost)
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}
