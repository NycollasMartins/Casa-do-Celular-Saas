import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        // Paleta definida no briefing do projeto
        brand: {
          DEFAULT: '#0066CC',
          dark: '#004499',
          light: '#E6F0FA',
        },
        surface: '#F5F5F5',
        card: '#FFFFFF',
        ink: '#333333',
        success: '#10B981',
        danger: '#EF4444',
        warning: '#F59E0B',
      },
      borderRadius: { sm: '4px', DEFAULT: '6px', md: '6px', lg: '8px' },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)',
        'card-hover': '0 4px 12px rgba(16, 24, 40, 0.08)',
      },
      transitionDuration: { DEFAULT: '200ms' },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in 240ms ease-out both' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
