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
                brand: {
                    50: '#eef6ff',
                    100: '#d9eaff',
                    200: '#bcdaff',
                    300: '#8ec3ff',
                    400: '#59a2ff',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                }
            }
        },
    },
    plugins: [],
}
