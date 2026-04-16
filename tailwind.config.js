/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        wolf: {
          bg: '#020617',
          panel: '#0f172a',
          panelSoft: '#111827',
          stroke: '#1f2937',
          accent: '#f59e0b',
          text: '#f8fafc',
          muted: '#94a3b8',
        },
      },
      boxShadow: {
        premium: '0 0 0 1px rgba(255,255,255,0.03), 0 14px 30px rgba(0,0,0,0.35)',
      },
      borderRadius: {
        xl2: '1rem',
      },
    },
  },
  plugins: [],
}

