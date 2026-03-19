/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c1d3fe',
          300: '#93b4fd',
          400: '#608dfa',
          500: '#3b6ef5',
          600: '#2952e8',
          700: '#1f3dd6',
          800: '#1f35b0',
          900: '#1e308b',
        },
      },
    },
  },
  plugins: [],
}
