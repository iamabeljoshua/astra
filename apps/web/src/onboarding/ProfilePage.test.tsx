import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELETE_DATA_LABELS, PROFILE_LABELS, STUDENT_GOAL_LABELS, STUDENT_INTEREST_LABELS, STUDENT_LEVEL_LABELS } from '../strings';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { ProfilePage } from './ProfilePage';

const PROFILE = { interests: ['space', 'music'], level: 'university', goal: 'exam' };
const ACCOUNT = { status: 'active', student: { id: 'student', name: 'Maya', profile: PROFILE } };

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('../auth/session', () => ({ getAccessToken: async () => 'test-token', forgetSession: vi.fn(), renewSession: vi.fn(), signOut }));

function stubApi() {
  const saved: unknown[] = [];
  vi.stubGlobal('fetch', async (request: Request) => {
    if (new URL(request.url).pathname.endsWith('/me/record')) return new Response(JSON.stringify({ notes: [] }));
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

  it('shows the picture on each interest chip', async () => {
    stubApi();
    renderWithQueryClient(<ProfilePage />);
    await screen.findByLabelText(PROFILE_LABELS.name);

    for (const label of Object.values(STUDENT_INTEREST_LABELS)) {
      expect(screen.getByRole('button', { name: label }).querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('tells a screen reader a slow save is on its way', async () => {
    stubApi();
    renderWithQueryClient(<ProfilePage />);
    await screen.findByLabelText(PROFILE_LABELS.name);
    vi.stubGlobal('fetch', () => new Promise(() => undefined));

    fireEvent.click(screen.getByRole('button', { name: PROFILE_LABELS.save }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(PROFILE_LABELS.saving));
  });

  it('will not save a blank name', async () => {
    const saved = stubApi();
    renderWithQueryClient(<ProfilePage />);

    fireEvent.change(await screen.findByLabelText(PROFILE_LABELS.name), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: PROFILE_LABELS.save }));

    await waitFor(() => screen.getByText(PROFILE_LABELS.missing));
    expect(saved).toEqual([]);
  });

  it('will not save a name of only invisible characters', async () => {
    const saved = stubApi();
    renderWithQueryClient(<ProfilePage />);

    fireEvent.change(await screen.findByLabelText(PROFILE_LABELS.name), { target: { value: '\u200b' } });
    fireEvent.click(screen.getByRole('button', { name: PROFILE_LABELS.save }));

    await waitFor(() => screen.getByText(PROFILE_LABELS.missing));
    expect(saved).toEqual([]);
  });

  it('drops the blank name problem as soon as the student types a name', async () => {
    stubApi();
    renderWithQueryClient(<ProfilePage />);
    const name = await screen.findByLabelText(PROFILE_LABELS.name);
    fireEvent.change(name, { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: PROFILE_LABELS.save }));
    await screen.findByText(PROFILE_LABELS.missing);

    fireEvent.change(name, { target: { value: 'Mai' } });

    expect(screen.queryByText(PROFILE_LABELS.missing)).toBeNull();
  });
});

describe('deleting my data', () => {
  function stubDeleteApi(deleteStatus = 200) {
    const deletes: string[] = [];
    vi.stubGlobal('fetch', async (request: Request) => {
      if (request.method === 'DELETE') {
        deletes.push(new URL(request.url).pathname);
        return new Response(JSON.stringify({ deleted: true }), { status: deleteStatus });
      }
      return new Response(JSON.stringify(ACCOUNT));
    });
    return deletes;
  }

  it('asks first, and the first press deletes nothing', async () => {
    const deletes = stubDeleteApi();
    renderWithQueryClient(<ProfilePage />);

    fireEvent.click(await screen.findByRole('button', { name: DELETE_DATA_LABELS.title }));

    expect(screen.getByText(DELETE_DATA_LABELS.confirm)).toBeTruthy();
    expect(deletes).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: DELETE_DATA_LABELS.no }));
    expect(screen.getByRole('button', { name: DELETE_DATA_LABELS.title })).toBeTruthy();
  });

  it('deletes on the confirm step, then signs out', async () => {
    signOut.mockClear();
    const deletes = stubDeleteApi();
    renderWithQueryClient(<ProfilePage />);

    fireEvent.click(await screen.findByRole('button', { name: DELETE_DATA_LABELS.title }));
    fireEvent.click(screen.getByRole('button', { name: DELETE_DATA_LABELS.yes }));

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(deletes).toEqual(['/api/me']);
  });

  it('stays signed in and says so when the delete fails', async () => {
    signOut.mockClear();
    stubDeleteApi(500);
    renderWithQueryClient(<ProfilePage />);

    fireEvent.click(await screen.findByRole('button', { name: DELETE_DATA_LABELS.title }));
    fireEvent.click(screen.getByRole('button', { name: DELETE_DATA_LABELS.yes }));

    await screen.findByRole('alert');
    expect(signOut).not.toHaveBeenCalled();
  });
});
