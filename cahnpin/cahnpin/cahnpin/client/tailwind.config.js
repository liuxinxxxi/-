/** @type {import('tailwindcss').Config} */
// 低饱和蓝色系设计令牌（primary），整体极简、弱阴影、大留白
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F3F6FB',
          100: '#E6EDF7',
          200: '#C9D8EB',
          300: '#9FB9D9',
          400: '#7194C2',
          500: '#5578AE',
          600: '#446394',
          700: '#3A527B',
          800: '#334666',
          900: '#2E3D57',
        },
        canvas: '#F7F9FC',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(46, 61, 87, 0.04), 0 4px 16px rgba(46, 61, 87, 0.05)',
        cardHover:
          '0 2px 4px rgba(46, 61, 87, 0.05), 0 10px 28px rgba(46, 61, 87, 0.09)',
      },
    },
  },
  plugins: [],
}
