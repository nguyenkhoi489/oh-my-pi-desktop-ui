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
        'surface-card': 'var(--color-surface-card)',
        border: 'var(--color-border)',
        'border-focus': 'var(--color-border-focus)',
        brand: {
          50: '#faf5ff',
          100: '#f3e8ff',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
        },
        codex: {
          50: '#f0fdf9',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          accent: '#10a37f',
          'accent-hover': '#0e8c6d',
          'accent-subtle': 'rgba(16, 163, 127, 0.12)',
          dark: '#0c0d10',
          panel: '#13151b',
          card: '#181b22',
          surface: '#1c1f28',
          highlight: '#242834',
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'sans-serif'
        ],
        mono: [
          'JetBrains Mono',
          'SF Mono',
          'Fira Code',
          'Menlo',
          'Consolas',
          'monospace'
        ],
      },
      boxShadow: {
        'codex-card': '0 4px 14px 0 rgba(0, 0, 0, 0.25)',
        'codex-glow': '0 0 20px -3px rgba(16, 163, 127, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.99)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        }
      }
    },
  },
  plugins: [],
}
