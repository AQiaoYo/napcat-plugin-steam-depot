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
                steam: {
                    blue: '#1b2838',
                    dark: '#171a21',
                    light: '#2a475e',
                    accent: '#66c0f4',
                    green: '#4c6b22',
                    text: '#c7d5e0',
                },
                primary: '#FB7299',
                brand: {
                    50: '#fff1f3',
                    100: '#ffe0e6',
                    200: '#ffc6d3',
                    300: '#ff9db3',
                    400: '#fb7299',
                    500: '#FB7299',
                    600: '#e05a80',
                    700: '#c4446a',
                    800: '#a33758',
                    900: '#88304d',
                }
            },
            keyframes: {
                'fade-in-up': {
                    '0%': { opacity: '0', transform: 'translateY(12px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in-down': {
                    '0%': { opacity: '0', transform: 'translateY(-8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'scale-in': {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                'slide-in-right': {
                    '0%': { opacity: '0', transform: 'translateX(16px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                'slide-in-left': {
                    '0%': { opacity: '0', transform: 'translateX(-16px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                'expand-down': {
                    '0%': { opacity: '0', maxHeight: '0', transform: 'scaleY(0.95)' },
                    '100%': { opacity: '1', maxHeight: '500px', transform: 'scaleY(1)' },
                },
                'pulse-soft': {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.6' },
                },
                'shimmer': {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
                'status-pulse': {
                    '0%, 100%': { boxShadow: '0 0 0 0 currentColor' },
                    '50%': { boxShadow: '0 0 0 4px transparent' },
                },
            },
            animation: {
                'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                'fade-in-down': 'fade-in-down 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                'fade-in': 'fade-in 0.3s ease both',
                'scale-in': 'scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
                'slide-in-right': 'slide-in-right 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                'slide-in-left': 'slide-in-left 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                'expand-down': 'expand-down 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
                'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
                'shimmer': 'shimmer 2s linear infinite',
                'status-pulse': 'status-pulse 2s ease-in-out infinite',
            },
        },
    },
    plugins: [],
}
