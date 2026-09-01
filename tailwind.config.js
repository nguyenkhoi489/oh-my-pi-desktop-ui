/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--color-bg)',
        panel: 'var(--color-panel)',
        surface: 'var(--color-surface)',
        'surface-highlight': 'var(--color-surface-highlight)',
        border: 'var(--color-border)',
        'border-focus': 'rgba(147, 51, 234, 0.5)',
        brand: {
          50: '#faf5ff',
          100: '#f3e8ff',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
        },
        codex: {
          accent: '#10a37f',
          dark: '#0b0c0e',
          card: '#16171b',
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Inter',
          'sans-serif'
        ],
        mono: [
          'SF Mono',
          'JetBrains Mono',
          'Fira Code',
          'Menlo',
          'monospace'
        ],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 10px rgba(168, 85, 247, 0.2)' },
          '100%': { boxShadow: '0 0 25px rgba(168, 85, 247, 0.5)' },
        }
      }
    },
  },
  plugins: [],
}
