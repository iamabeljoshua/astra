import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/apiError';
import { SCENE_LIBRARY_LABELS } from '../strings';
import { SceneLibraryPage } from './SceneLibraryPage';

const { fakeApi } = vi.hoisted(() => ({ fakeApi: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('../api/client', () => ({ api: fakeApi }));

const SCENE = { sceneId: 'scene-1', title: 'Why Saturn has rings', kind: 'opening', subject: 'Astronomy', narration: '[[rings]] The rings are ice.', close: 'What would you hit?', isFlagged: false, isCheckedByPerson: false };

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <SceneLibraryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function answerSample(scenes: unknown[]) {
  fakeApi.get.mockImplementation((route: string) => (route === '/scene-library/sample' ? Promise.resolve(scenes) : Promise.resolve(new Blob(['png']))));
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:sheet', revokeObjectURL: () => {} }));
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe('the scene library page', () => {
  it('shows a student one plain line and no scenes', async () => {
    fakeApi.get.mockRejectedValue(new ApiError({ kind: 'rejected', status: 403 }));
    renderPage();
    expect(await screen.findByText(SCENE_LIBRARY_LABELS.notForYou)).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('shows a reviewer the scene, its words with no marks, and that no person has checked it', async () => {
    answerSample([SCENE]);
    renderPage();
    expect(await screen.findByRole('heading', { name: SCENE.title })).toBeTruthy();
    expect(screen.getByText('The rings are ice.')).toBeTruthy();
    expect(screen.getByText(new RegExp(SCENE_LIBRARY_LABELS.notChecked))).toBeTruthy();
  });

  it('flags a scene and shows the flag the server kept', async () => {
    answerSample([SCENE]);
    fakeApi.put.mockImplementation(() => {
      answerSample([{ ...SCENE, isFlagged: true }]);
      return Promise.resolve();
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: SCENE_LIBRARY_LABELS.flag }));
    expect(await screen.findByText(SCENE_LIBRARY_LABELS.flagged)).toBeTruthy();
    await waitFor(() => expect(fakeApi.put).toHaveBeenCalledWith('/scene-library/{sceneId}/flag', { params: { path: { sceneId: SCENE.sceneId } } }));
  });
});
