import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_LABELS, STUDENT_GOAL_LABELS, STUDENT_INTEREST_LABELS, STUDENT_LEVEL_LABELS } from '../strings';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { ProfilePage } from './ProfilePage';

const PROFILE = { interests: ['space', 'music'], level: 'university', goal: 'exam' };
const ACCOUNT = { status: 'active', student: { id: 'student', name: 'Maya', profile: PROFILE } };

vi.mock('../auth/session', () => ({ getAccessToken: async () => 'test-token', forgetSession: vi.fn(), renewSession: vi.fn() }));

function stubApi() {
  const saved: unknown[] = [];
  vi.stubGlobal('fetch', async (request: Request) => {
    if (request.method === 'PUT') {
      const body = (await request.json()) as object;
      saved.push(body);
      return new Response(JSON.stringify({ ...ACCOUNT, student: { ...ACCOUNT.student, ...body } }));
    }
    return new Response(JSON.stringify(ACCOUNT));
  });
  return saved;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('changing answers later', () => {
  it('shows the saved answers and saves a change to any of them', async () => {
    const saved = stubApi();
    renderWithQueryClient(<ProfilePage />);

    const name = await screen.findByLabelText<HTMLInputElement>(PROFILE_LABELS.name);
    expect(name.value).toBe('Maya');
    expect(screen.getByRole('button', { name: STUDENT_INTEREST_LABELS.space }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: STUDENT_LEVEL_LABELS.university }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: STUDENT_GOAL_LABELS.exam }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.change(name, { target: { value: 'Mai' } });
    fireEvent.click(screen.getByRole('button', { name: STUDENT_LEVEL_LABELS.high_school }));
    fireEvent.click(screen.getByRole('button', { name: STUDENT_INTEREST_LABELS.music }));
    fireEvent.click(screen.getByRole('button', { name: STUDENT_INTEREST_LABELS.art }));
    fireEvent.click(screen.getByRole('button', { name: STUDENT_GOAL_LABELS.curiosity }));
    fireEvent.click(screen.getByRole('button', { name: PROFILE_LABELS.save }));

    await screen.findByText(PROFILE_LABELS.saved);
    expect(saved).toEqual([{ name: 'Mai', interests: ['space', 'art'], level: 'high_school', goal: 'curiosity' }]);
  });

  it('will not save a blank name', async () => {
    const saved = stubApi();
    renderWithQueryClient(<ProfilePage />);

    fireEvent.change(await screen.findByLabelText(PROFILE_LABELS.name), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: PROFILE_LABELS.save }));

    await waitFor(() => screen.getByText(PROFILE_LABELS.missing));
    expect(saved).toEqual([]);
  });
});
