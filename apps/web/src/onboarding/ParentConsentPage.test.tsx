import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PARENT_CONSENT_LABELS } from '../strings';
import { renderWithQueryClient } from '../test/renderWithQueryClient';
import { ParentConsentPage } from './ParentConsentPage';
import { PARENT_CONSENT_PATH } from './parentConsentPath';

const LINK_TOKEN = 'a-link-token';
const LINK_PATH = `/parent-consent/${LINK_TOKEN}`;

vi.mock('../auth/session', () => ({ getAccessToken: async () => null }));

function renderPage() {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={[LINK_PATH]}>
      <Routes>
        <Route path={PARENT_CONSENT_PATH} element={<ParentConsentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function stubApi(answer: (route: string) => Response) {
  const routes: string[] = [];
  vi.stubGlobal('fetch', async (request: Request) => {
    const route = `${request.method} ${new URL(request.url).pathname}`;
    routes.push(route);
    return answer(route);
  });
  return routes;
}

function json(body: object) {
  return new Response(JSON.stringify(body));
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the parent consent page', () => {
  it('names the student and accepts nothing until the parent presses the button', async () => {
    const routes = stubApi(() => json({ studentName: 'Tolu', isAccepted: false }));

    renderPage();

    await screen.findByRole('heading', { name: PARENT_CONSENT_LABELS.question('Tolu') });
    screen.getByText(PARENT_CONSENT_LABELS.about);
    expect(routes).toEqual([`GET /api${LINK_PATH}`]);
  });

  it('tells a parent what is held before they accept and after, and that lessons are planned', async () => {
    stubApi(() => json({ studentName: 'Tolu', isAccepted: false }));

    renderPage();

    await screen.findByRole('button', { name: PARENT_CONSENT_LABELS.accept });
    const page = screen.getByRole('main').textContent;
    for (const fact of ['date of birth', 'their email address', 'when they signed in', 'IP address', 'browser', 'interests', 'tutor voice', 'first answer']) {
      expect(page).toContain(fact);
    }
    expect(page).toContain('planned and not open yet');
    expect(page).not.toContain('talks with your child');
  });

  it('calls only the public routes and shows thanks after accepting', async () => {
    let isAccepted = false;
    const routes = stubApi((route) => {
      if (route.startsWith('POST')) isAccepted = true;
      return json({ studentName: 'Tolu', isAccepted });
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: PARENT_CONSENT_LABELS.accept }));

    await screen.findByRole('heading', { name: PARENT_CONSENT_LABELS.acceptedQuestion });
    screen.getByText(PARENT_CONSENT_LABELS.acceptedAbout('Tolu'));
    expect(new Set(routes)).toEqual(new Set([`GET /api${LINK_PATH}`, 'POST /api/parent-consent/accept']));
  });

  it('shows thanks at once for a link already accepted', async () => {
    stubApi(() => json({ studentName: 'Tolu', isAccepted: true }));

    renderPage();

    await screen.findByRole('heading', { name: PARENT_CONSENT_LABELS.acceptedQuestion });
    expect(screen.queryByRole('button', { name: PARENT_CONSENT_LABELS.accept })).toBeNull();
  });

  it('says a replaced link no longer works', async () => {
    stubApi(() => new Response(null, { status: 404 }));

    renderPage();

    await screen.findByText(PARENT_CONSENT_LABELS.deadLink);
    expect(screen.queryByRole('button', { name: PARENT_CONSENT_LABELS.accept })).toBeNull();
  });

  it('refers to the child when the student gave no name', async () => {
    stubApi(() => json({ studentName: null, isAccepted: false }));

    renderPage();

    await screen.findByRole('heading', { name: PARENT_CONSENT_LABELS.question(null) });
  });
});
