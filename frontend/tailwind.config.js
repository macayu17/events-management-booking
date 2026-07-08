/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // We don't really need toggle now, but good to keep
  theme: {
    extend: {
      fontFamily: {
        // Ticket-stub design system
        sans: ['Space Grotesk', 'Outfit', 'system-ui', 'sans-serif'],
        display: ['Anton', 'Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Zomato/District/BMS Red-Pink Accent (legacy admin)
        primary: {
          400: '#ff4f64',
          500: '#E23744', // Brand Color
          600: '#d12c39',
        },
        // Ticket-stub tokens (defined as CSS vars in index.css, light + dark)
        paper: 'var(--bg)',
        card: 'var(--card)',
        card2: 'var(--card2)',
        ink: 'var(--ink)',
        'ink-70': 'var(--ink70)',
        'ink-55': 'var(--ink55)',
        'ink-45': 'var(--ink45)',
        line: 'var(--line)',
        'line-60': 'var(--line60)',
        'line-20': 'var(--line20)',
        dash: 'var(--dash)',
        accent: 'var(--accent)',
        'on-accent': 'var(--on-accent)',
      },
      boxShadow: {
        ticket: '5px 5px 0 var(--shadow)',
        'ticket-sm': '4px 4px 0 var(--shadow)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      }
    },
  },
  plugins: [],
}
