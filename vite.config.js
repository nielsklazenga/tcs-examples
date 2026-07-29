import jigsaw from '@tighten/jigsaw-vite-plugin';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [
        jigsaw({
            input: ['source/assets/js/main.js', 'source/assets/css/main.css'],
            refresh: {
            files: [
                    'source/**/*.md',
                    'source/**/*.php',
                    'source/**/*.html',
                ],
            },
        }),
        tailwindcss()
    ],
    server: {
        host: '0.0.0.0',
        port: 5175,
        strictPort: true,
        watch: {
            usePolling: true, // Forces Vite to check files manually
            interval: 100,    // Checks every 100ms
        },
        hmr: {
            host: 'tcs-examples.test',
        },
    },
});
