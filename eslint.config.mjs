import css from '@eslint/css';
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { noLiteralColors } from './packages/theme/eslint/no-literal-colors.mjs';
import { noVendorImports } from './packages/theme/eslint/no-vendor-imports.mjs';

const themePlugin = { rules: { 'no-literal-colors': noLiteralColors, 'no-vendor-imports': noVendorImports } };
const APP_TEXT_MESSAGE = 'Put app text in apps/web/src/strings.ts.';
const HAS_A_LETTER = '/\\p{L}/u';
const API_CLIENT_MESSAGE = 'Call the API through apps/web/src/api/client.ts.';
const FETCH_HOLDERS = ['window', 'globalThis', 'self', 'global'];
const SECOND_CLIENT_IMPORT = { selector: "ImportExpression[source.value='openapi-fetch']", message: API_CLIENT_MESSAGE };
const REAL_FETCH_CALLS = [
  { selector: "CallExpression[callee.name='fetch']", message: API_CLIENT_MESSAGE },
  {
    selector: `CallExpression[callee.object.name=/^(${FETCH_HOLDERS.join('|')})$/][callee.property.name='fetch']`,
    message: API_CLIENT_MESSAGE,
  },
];

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
    files: ['apps/**/*.{ts,tsx,js,jsx,mjs,cjs}', 'packages/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ignores: ['packages/theme/eslint/no-vendor-imports.test.ts'],
    plugins: { theme: themePlugin },
    rules: { 'theme/no-vendor-imports': 'error' },
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
        ...FETCH_HOLDERS.map((object) => ({ object, property: 'fetch', message: API_CLIENT_MESSAGE })),
      ],
      'no-restricted-imports': ['error', { name: 'openapi-fetch', message: API_CLIENT_MESSAGE }],
      'no-restricted-syntax': ['error', SECOND_CLIENT_IMPORT],
    },
  },
  {
    files: ['apps/web/**/*.test.{ts,tsx}'],
    ignores: ['apps/web/src/api/**'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-syntax': ['error', SECOND_CLIENT_IMPORT, ...REAL_FETCH_CALLS],
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
        SECOND_CLIENT_IMPORT,
      ],
    },
  },
]);
