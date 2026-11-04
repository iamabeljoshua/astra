import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = import.meta.dirname;
const isAppSource = (name: string) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.startsWith('test/');
const appSources = readdirSync(SOURCE_ROOT, { recursive: true, encoding: 'utf8' }).filter(isAppSource);

describe('what the page can capture', () => {
  it.each([
    ['a camera', /\bvideo\s*:\s*(?:true|\{)|setCameraEnabled|createLocalVideoTrack|createCameraTrack/],
    ['a recording of the microphone', /\bMediaRecorder\b/],
    ['a screen', /getDisplayMedia|setScreenShareEnabled/],
  ])('never asks for %s', (_what, pattern) => {
    const found = appSources.filter((name) => pattern.test(readFileSync(join(SOURCE_ROOT, name), 'utf8')));
    expect(found).toEqual([]);
  });
});
