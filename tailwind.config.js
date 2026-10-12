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
        discord: {
          darkest: '#111214',
          rail: '#1e1f22',
          sidebar: '#2b2d31',
          hover: '#35373c',
          active: '#404249',
          main: '#313338',
          card: '#232428',
          popover: '#111214',
          blurple: '#5865f2',
          'blurple-hover': '#4752c4',
          green: '#23a55a',
          yellow: '#f0b232',
          red: '#f23f43',
          text: {
            normal: '#dbdee1',
            muted: '#949ba4',
            header: '#f2f3f5',
            interactive: '#b5bac1',
          }
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'discord-elevation-low': '0 1px 0 rgba(4,4,5,0.2),0 1.5px 0 rgba(6,6,7,0.05),0 2px 0 rgba(4,4,5,0.05)',
        'discord-elevation-high': '0 8px 16px rgba(0,0,0,0.24)',
        'discord-modal': '0 0 0 1px rgba(32,34,37,0.6), 0 16px 32px rgba(0,0,0,0.3)',
      },
      borderRadius: {
        'discord': '16px',
        'squircle': '18px',
      },
      transitionTimingFunction: {
        'discord': 'cubic-bezier(0.2, 0, 0, 1)',
      }
    },
  },
  plugins: [],
}
