import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { refuseCostLine, refuseDevelopmentAccounts, requireSupabaseValues } from './build-guards';

const DEFAULT_WEB_PORT = 5173;
const DEFAULT_API_PORT = 3000;
const LOCAL_HOST = '127.0.0.1';

// These replace window.location or run a real Vite build, and neither works in the vm context that vmForks gives a test file.
const TESTS_THAT_NEED_THEIR_OWN_PROCESS = [
  'src/RootErrorBoundary.test.tsx',
  'src/api/QueryDevtools.test.ts',
  'src/api/client.test.ts',
  'src/auth/AuthProvider.test.tsx',
  'src/auth/session.test.ts',
  'src/auth/sessionWithBlockedStorage.test.ts',
  'src/buildGuards.test.ts',
];

const webPort = Number(process.env.WEB_PORT ?? DEFAULT_WEB_PORT);
const apiPort = process.env.API_PORT ?? DEFAULT_API_PORT;

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  if (command === 'build') requireSupabaseValues(env);

  return {
    define: { __DEV_SIGN_IN__: command === 'serve' },
    plugins: [react(), tailwindcss(), refuseDevelopmentAccounts(), refuseCostLine(env)],
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
      // Vitest empties any stylesheet not listed here, and a test reads the font rules in KaTeX's.
      css: { include: [/katex/] },
      setupFiles: ['./src/testSetup.ts'],
      env: {
        VITE_SUPABASE_URL: 'http://127.0.0.1:54421',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      },
      projects: [
        {
          extends: true,
          test: { name: 'vm-context', pool: 'vmForks', exclude: [...configDefaults.exclude, ...TESTS_THAT_NEED_THEIR_OWN_PROCESS] },
        },
        {
          extends: true,
          test: { name: 'own-process', pool: 'forks', include: TESTS_THAT_NEED_THEIR_OWN_PROCESS },
        },
      ],
    },
  };
});
