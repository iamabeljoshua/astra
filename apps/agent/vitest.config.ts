import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // These tests mostly wait on real timers, so they gain from more workers than threads. The repo is public, so CI's runners have 4 threads, and the job's limit has no room for fewer workers.
    maxWorkers: 4,
  },
});
