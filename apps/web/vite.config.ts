import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { refuseDevelopmentAccounts, requireSupabaseValues } from './build-guards';

const DEFAULT_WEB_PORT = 5173;
const DEFAULT_API_PORT = 3000;
const LOCAL_HOST = '127.0.0.1';

const webPort = Number(process.env.WEB_PORT ?? DEFAULT_WEB_PORT);
const apiPort = process.env.API_PORT ?? DEFAULT_API_PORT;

export default defineConfig(({ command, mode }) => {
  if (command === 'build') requireSupabaseValues(loadEnv(mode, import.meta.dirname, 'VITE_'));

  return {
    define: { __DEV_SIGN_IN__: command === 'serve' },
    plugins: [react(), tailwindcss(), refuseDevelopmentAccounts()],
    server: {
      host: LOCAL_HOST,
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://${LOCAL_HOST}:${apiPort}`,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    preview: {
      host: LOCAL_HOST,
      port: webPort,
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/testSetup.ts'],
      env: {
        VITE_SUPABASE_URL: 'http://127.0.0.1:54421',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      },
    },
  };
});
