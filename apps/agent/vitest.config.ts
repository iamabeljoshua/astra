import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // These tests mostly wait on real timers, so on CI's 2 threads, where the default is 1 worker, they would wait in turn.
    maxWorkers: 3,
  },
});
