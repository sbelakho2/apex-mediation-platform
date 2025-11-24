import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1.5rem',
        md: '2rem',
        lg: '2.5rem',
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1200px',
        '2xl': '1350px',
      },
    },
    extend: {
      colors: {
        ink: '#0B1220',
        inkMuted: '#475569',
        brand: {
          DEFAULT: 'var(--brand-500)',
          50: 'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          800: 'var(--brand-800)',
          900: 'var(--brand-900)',
        },
        gray: {
          50: 'var(--gray-50)',
          100: 'var(--gray-100)',
          200: 'var(--gray-200)',
          300: 'var(--gray-300)',
          400: 'var(--gray-400)',
          500: 'var(--gray-500)',
          600: 'var(--gray-600)',
          700: 'var(--gray-700)',
          800: 'var(--gray-800)',
          900: 'var(--gray-900)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-pjs)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        hero: ['5rem', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'hero-md': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'hero-sm': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        h2: ['2.8rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'h2-md': ['2rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        'h2-sm': ['1.5rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        h3: ['1.6rem', { lineHeight: '1.4' }],
        body: ['1.15rem', { lineHeight: '1.7' }],
        'body-large': ['1.35rem', { lineHeight: '1.7' }],
      },
      letterSpacing: {
        tight: '-1.5px',
        body: '-0.4px',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15,23,42,.06)',
        md: '0 4px 16px rgba(15,23,42,.08)',
        lg: '0 10px 30px rgba(15,23,42,.12)',
        hero: '0 40px 80px rgba(0, 23, 51, 0.28)',
        inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        card: '0 1px 2px rgba(16,24,40,.06), 0 10px 20px rgba(16,24,40,.06)',
      },
      borderRadius: {
        DEFAULT: '16px',
        xl: '16px',
        '2xl': '20px',
      },
    },
  },
  plugins: [
    forms(),
    typography(),
  ],
};

export default config;
