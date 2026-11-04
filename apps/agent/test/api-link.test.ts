import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiLink } from '../src/tutor/api-link.ts';

const SESSION = '3f2b8c1e-9a4d-4c7b-8e21-6d5f0a9b1c2d';

describe('the agent link to the API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([`session-${SESSION}`, `session-${SESSION}-ab12cd34`])('reads the session from room %s, with or without its suffix', async (roomName) => {
    const addresses: string[] = [];
    vi.stubGlobal('fetch', async (address: string) => {
      addresses.push(address);
      return new Response(JSON.stringify({ level: 'secondary', interests: [], goal: 'exam' }));
    });
    await createApiLink({ apiUrl: 'http://api.test', agentKey: 'key', roomName }).fetchProfile();
    expect(addresses).toEqual([`http://api.test/agent/sessions/${SESSION}/brief`]);
  });
});
