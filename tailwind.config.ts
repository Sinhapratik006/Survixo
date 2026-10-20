import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './index.html',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EFF4FF',
          100: '#D1E0FF',
          200: '#B2CCFF',
          300: '#84ADFF',
          400: '#528BFF',
          500: '#2970FF',
          600: '#155EEF',
          700: '#004EEB',
          800: '#0040C1',
          900: '#00359E',
          950: '#002266',
        },
        secondary: '#3B82F6',
        navy: {
          DEFAULT: '#0B1220',
          950: '#070C17',
          900: '#0B1220',
          800: '#111A2E',
          700: '#18233B',
          600: '#22304D',
          500: '#33415F',
        },
        canvas: '#F5F8FF',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(21, 94, 239, 0.06)',
        lift: '0 8px 24px -8px rgba(21, 94, 239, 0.18)',
      },
      borderRadius: {
        xl: '0.75rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
