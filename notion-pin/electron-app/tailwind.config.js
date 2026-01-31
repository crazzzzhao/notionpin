/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      colors: {},
      animation: {
        shine: 'shine 2s linear infinite'
      },
      keyframes: {
        shine: {
          '0%': { backgroundPosition: '200% 0, 0 0' },
          '100%': { backgroundPosition: '-200% 0, 0 0' }
        }
      }
    }
  },
  plugins: []
}
