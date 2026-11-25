import type { Config } from 'tailwindcss';

/*
 * Design system: dark, hairline-bordered, square-cornered, mono-labelled.
 * The site is dark-only (see pages/_document.js). Existing class names are
 * kept and remapped here so every page picks up the new look:
 *   brand  → cool blue accent (#3b82f6), used as a cyan→blue→indigo gradient
 *   navy   → near-black panels and hairlines
 *   slate  → warm neutral grays
 *   blue → accent; indigo/purple/violet/fuchsia → indigo; cyan → cyan
 *   rounded-* → square (rounded-full kept for dots, spinners, avatars)
 */

const accent = {
  50: '#EEF6FF',
  100: '#D9EBFF',
  200: '#BCDCFF',
  300: '#8EC6FF',
  400: '#59A5FF',
  500: '#3B82F6',
  600: '#2563EB',
  700: '#1D4ED8',
  800: '#1E40AF',
  900: '#1E3A8A',
  950: '#172554',
};

// Gradient partners so `from-brand-500 to-indigo-500` etc. read as cool blue sweeps.
const indigo = {
  50: '#EEF2FF',
  100: '#E0E7FF',
  200: '#C7D2FE',
  300: '#A5B4FC',
  400: '#818CF8',
  500: '#6366F1',
  600: '#4F46E5',
  700: '#4338CA',
  800: '#3730A3',
  900: '#312E81',
  950: '#1E1B4B',
};

const cyan = {
  50: '#ECFEFF',
  100: '#CFFAFE',
  200: '#A5F3FC',
  300: '#67E8F9',
  400: '#22D3EE',
  500: '#06B6D4',
  600: '#0891B2',
  700: '#0E7490',
  800: '#155E75',
  900: '#164E63',
  950: '#083344',
};

const neutral = {
  50: '#F5F5F4',
  100: '#E7E7E4',
  200: '#C9C9C6',
  300: '#B0B0AC',
  400: '#8B8B87',
  500: '#6F6F6B',
  600: '#5C5C59',
  700: '#333333',
  800: '#232323',
  900: '#121212',
  950: '#0A0A0A',
};

export default {
  content: [
    './components/**/*.{js,jsx,ts,tsx}',
    './pages/**/*.{js,jsx,ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './index.html',
  ],
  darkMode: 'class',
  theme: {
    borderRadius: {
      none: '0',
      sm: '0',
      DEFAULT: '0',
      md: '0',
      lg: '0',
      xl: '0',
      '2xl': '0',
      '3xl': '0',
      full: '9999px',
    },
    extend: {
      colors: {
        brand: accent,
        accent: accent[500],
        secondary: accent[500],
        indigo,
        purple: indigo,
        violet: indigo,
        fuchsia: indigo,
        blue: accent,
        cyan,
        slate: neutral,
        gray: neutral,
        navy: {
          DEFAULT: '#070707',
          950: '#070707',
          900: '#0D0D0D',
          800: '#121212',
          700: '#232323',
          600: '#333333',
          500: '#5C5C59',
          400: '#6F6F6B',
          300: '#8B8B87',
        },
        canvas: '#070707',
        line: { DEFAULT: '#232323', 2: '#333333' },
        ink: {
          DEFAULT: '#F5F5F4',
          2: '#C9C9C6',
          muted: '#8B8B87',
          faint: '#5C5C59',
        },
        ok: '#4ADE80',
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: '0 20px 60px #000',
        xl: '0 30px 90px #000',
        '2xl': '0 40px 120px #000',
        card: 'none',
        lift: '0 40px 120px #000',
        cardHover: 'none',
      },
      fontSize: {
        h1: ['2.5rem', { lineHeight: '1.02', letterSpacing: '-0.04em', fontWeight: '700' }],
        h2: ['1.75rem', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700' }],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #22D3EE 0%, #3B82F6 50%, #6366F1 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #67E8F9 0%, #59A5FF 50%, #818CF8 100%)',
      },
      maxWidth: {
        page: '1320px',
      },
    },
  },
  plugins: [],
} satisfies Config;
