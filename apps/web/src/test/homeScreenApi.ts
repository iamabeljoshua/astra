import type { components } from '@astra/contracts';
import { vi } from 'vitest';

type HomeScreenResponse = components['schemas']['HomeScreenResponseDto'];

export const EXAMPLE_STUDENT_NAME = 'Maya';

export const EXAMPLE_HOME_SCREEN: HomeScreenResponse = {
  studentName: EXAMPLE_STUDENT_NAME,
  isNewStudent: false,
  startHereQuestion: null,
  continueSession: {
    id: 'unfinished-session',
    title: 'Free-body diagrams',
    subject: 'Physics',
    language: 'en',
    status: 'in_progress',
    startedAt: '2026-10-31T12:00:00.000Z',
    durationSeconds: 252,
    detail: 'Next up: friction on a slope.',
    artwork: 'forces',
  },
  picks: [
    {
      id: 'drawn-pick',
      title: 'How a jump shot flies',
      subject: 'Physics',
      lengthMinutes: 12,
      reason: 'Because you play basketball',
      artwork: 'arc',
    },
    {
      id: 'pictured-pick',
      title: 'Why a breaking wave curls',
      subject: 'Astronomy',
      lengthMinutes: 10,
      reason: 'Because you follow surfing',
      artwork: 'wave',
    },
  ],
};

export function stubFetchWithHomeScreen(homeScreen: HomeScreenResponse = EXAMPLE_HOME_SCREEN) {
  vi.stubGlobal('fetch', async (request: Request) =>
    new URL(request.url).pathname === '/api/home'
      ? new Response(JSON.stringify(homeScreen))
      : new Response(null, { status: 404 }),
  );
}
