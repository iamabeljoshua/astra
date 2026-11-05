import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The repo is public, so CI's runners have 4 threads.
    maxWorkers: 4,
  },
});
