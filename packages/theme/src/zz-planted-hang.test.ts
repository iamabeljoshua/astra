import { it } from 'vitest';

it('PLANTED hang from the CI speed review', () => {
  if (!process.env.GITHUB_ACTIONS) return;
  console.log('PLANTED hang starts now');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
});
