import type { Config } from 'tailwindcss';

/*
 * Design system: dark, hairline-bordered, square-cornered, mono-labelled.
 * The site is dark-only (see pages/_document.js). Existing class names are
 * kept and remapped here so every page picks up the new look:
 *   brand  → orange accent (#f26a2e)
 *   navy   → near-black panels and hairlines
 *   slate  → warm neutral grays
 *   indigo/purple/violet/blue → accent, so old gradients stay on-palette
 *   rounded-* → square (rounded-full kept for dots, spinners, avatars)
 */

const accent = {
  50: '#FEF3EC',
  100: '#FDE3D3',
  200: '#FBC4A5',
  300: '#F8A06F',
  400: '#F5844A',
  500: '#F26A2E',
  600: '#E1561A',
  700: '#BB4214',
  800: '#953617',
  900: '#782F16',
  950: '#411509',
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
        indigo: accent,
        purple: accent,
        violet: accent,
        fuchsia: accent,
        blue: accent,
        cyan: accent,
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
      maxWidth: {
        page: '1320px',
      },
    },
  },
  plugins: [],
} satisfies Config;
