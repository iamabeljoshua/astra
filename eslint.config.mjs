import css from '@eslint/css';
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { noLiteralColors } from './packages/theme/eslint/no-literal-colors.mjs';

const themePlugin = { rules: { 'no-literal-colors': noLiteralColors } };
const APP_TEXT_MESSAGE = 'Put app text in apps/web/src/strings.ts.';
const HAS_A_LETTER = '/\\p{L}/u';
const API_CLIENT_MESSAGE = 'Call the API through apps/web/src/api/client.ts.';

export default defineConfig([
  globalIgnores(['**/dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/strings.ts', '**/*.test.{ts,tsx}'],
    plugins: { theme: themePlugin },
    rules: { 'theme/no-literal-colors': 'error' },
  },
  {
    files: ['apps/web/src/**/*.css'],
    plugins: { css, theme: themePlugin },
    language: 'css/css',
    languageOptions: { tolerantMode: true },
    rules: { 'theme/no-literal-colors': 'error' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ignores: ['apps/web/src/api/**'],
    rules: {
      'no-restricted-globals': ['error', { name: 'fetch', message: API_CLIENT_MESSAGE }],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].map((object) => ({ object, property: 'fetch', message: API_CLIENT_MESSAGE })),
      ],
      'no-restricted-imports': ['error', { name: 'openapi-fetch', message: API_CLIENT_MESSAGE }],
    },
  },
  {
    files: ['apps/web/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `JSXText[value=${HAS_A_LETTER}]`, message: APP_TEXT_MESSAGE },
        {
          selector: `JSXAttribute[name.name=/^(aria-label|title|alt|placeholder)$/] > Literal[value=${HAS_A_LETTER}]`,
          message: APP_TEXT_MESSAGE,
        },
      ],
    },
  },
]);
