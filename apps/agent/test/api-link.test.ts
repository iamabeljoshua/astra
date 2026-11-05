import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRefusedError, createApiLink } from '../src/tutor/api-link.ts';

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

  it.each([[400, true], [413, true], [500, false], [503, false]])('says a save answered %i was refused for good: %s', async (status, isRefused) => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status }));
    const saving = createApiLink({ apiUrl: 'http://api.test', agentKey: 'key', roomName: `session-${SESSION}` }).saveLog({ runId: 'r', runStartedAt: new Date(), events: [] });
    await expect(saving.catch((problem: unknown) => problem instanceof ApiRefusedError)).resolves.toBe(isRefused);
  });

  it('sends a new title', async () => {
    const sent: { address: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (address: string, init: RequestInit) => {
      sent.push({ address, body: init.body });
      return new Response(null, { status: 204 });
    });

    await createApiLink({ apiUrl: 'http://api.test', agentKey: 'key', roomName: `session-${SESSION}` }).setTitle('Black holes');

    expect(sent).toEqual([{ address: `http://api.test/agent/sessions/${SESSION}/title`, body: JSON.stringify({ title: 'Black holes' }) }]);
  });
});

describe('the job opening', () => {
  const answer = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)));
  const link = () => createApiLink({ apiUrl: 'http://api.test', agentKey: 'key', roomName: `session-${SESSION}` });

  it('reads the student and a typed question, and treats blank words as none', async () => {
    answer({ studentId: 'maya', question: 'How volcanoes erupt' });
    await expect(link().fetchOpening()).resolves.toEqual({ studentId: 'maya', question: 'How volcanoes erupt' });
    answer({ studentId: 'maya', question: '  ' });
    await expect(link().fetchOpening()).resolves.toEqual({ studentId: 'maya', question: null });
  });

  it('names no student it was not told of', async () => {
    answer({ question: 'How volcanoes erupt' });
    await expect(link().fetchOpening()).rejects.toThrow(/no student/);
  });
});
