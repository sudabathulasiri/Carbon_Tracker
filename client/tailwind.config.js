/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"DM Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        forest:  '#1a2e1a',
        moss:    '#2d4a2d',
        sage:    '#4a7c59',
        lichen:  '#a8c5a0',
        offwhite:'#f0ede8',
        amber:   '#d47c2a',
        bark:    '#6b8f6b',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};