/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy:        '#1a2852',
          'navy-dark':  '#0f1a38',
          'navy-light': '#253668',
          gold:         '#E8B800',
          'gold-light': '#FDE68A',
          'gold-dark':  '#B58900',
          red:          '#CC1414',
          'off-white':  '#F8F6F0',
        },
      },
      fontFamily: {
        brand: ['Georgia', 'Cambria', 'serif'],
      },
    },
  },
  plugins: [],
}

