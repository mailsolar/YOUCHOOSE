/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './*.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      colors: {
        yc: {
          // Elegant & Golden Palette
          navy: '#0F172A',       // Deep elegant navy
          gold: '#D4AF37',       // Rich gold
          amber: '#F59E0B',      // Warm amber glow
          cream: '#FDFBF7',      // Soft off-white for backgrounds
          
          // Calm & Airy Palette
          lavender: '#E9E4F0',   // Very soft purple/grey
          softpurple: '#C4B5FD', // Muted purple accent
          white: '#FFFFFF',
          
          textmain: '#1E293B',   // Soft black for readable text
          textmuted: '#64748B',  // Slate gray for muted text
        },
      },
      fontSize: {
        'fluid-hero': 'clamp(3rem, 8vw, 6rem)',
        'fluid-section': 'clamp(2rem, 5vw, 4rem)',
      },
      boxShadow: {
        'soft': '0 10px 40px -10px rgba(0,0,0,0.08)',
        'elegant': '0 20px 50px -10px rgba(15, 23, 42, 0.2)',
        'glow': '0 0 40px -10px rgba(212, 175, 55, 0.3)',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '3rem',
      }
    },
  },
  plugins: [],
};
