import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const DEFAULT_WEB_PORT = 5173;
const DEFAULT_API_PORT = 3000;
const LOCAL_HOST = '127.0.0.1';
const SUPABASE_VALUES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];

const webPort = Number(process.env.WEB_PORT ?? DEFAULT_WEB_PORT);
const apiPort = process.env.API_PORT ?? DEFAULT_API_PORT;

// Without these the page throws on load, so a build that lacks them would ship a blank page.
function requireSupabaseValues(mode: string) {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  const missing = SUPABASE_VALUES.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Set ${missing.join(' and ')} to build the web app.`);
  if (!URL.canParse(env.VITE_SUPABASE_URL ?? '')) throw new Error('VITE_SUPABASE_URL is not a valid URL.');
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build') requireSupabaseValues(mode);

  return {
    define: { __DEV_SIGN_IN__: command === 'serve' },
    plugins: [react(), tailwindcss()],
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
