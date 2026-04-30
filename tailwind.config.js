import plugin from 'tailwindcss/plugin';

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
        'row-even-dark': '#1f2937', // gray-800 — linha neutra (igual ao card)
        'row-odd-dark':  '#374151', // gray-700 — linha destacada (~40 pts mais clara)
      },
    },
  },
  plugins: [
    plugin(function ({ addComponents, theme }) {
      addComponents({
        '.imp-row-even': {
          backgroundColor: '#ffffff',
          '&:hover': { backgroundColor: '#f9fafb' },
          '.dark &': {
            backgroundColor: '#213040',
            '&:hover': { backgroundColor: '#263548' },
          },
        },
        '.imp-row-odd': {
          backgroundColor: 'rgba(248,250,252,0.7)',
          '&:hover': { backgroundColor: 'rgba(241,245,249,0.8)' },
          '.dark &': {
            backgroundColor: '#1e3858',
            '&:hover': { backgroundColor: '#234260' },
          },
        },
      });
    }),
  ],
}
