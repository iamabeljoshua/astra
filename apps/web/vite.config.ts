import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const DEFAULT_WEB_PORT = 5173;
const DEFAULT_API_PORT = 3000;

const webPort = Number(process.env.WEB_PORT ?? DEFAULT_WEB_PORT);
const apiPort = process.env.API_PORT ?? DEFAULT_API_PORT;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
  },
});
