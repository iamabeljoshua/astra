import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { watchSignedInUser } from '../auth/session';
import { LEGAL_LABELS, LEGAL_PAGES, SIGN_IN_LABELS } from '../strings';
import { LEGAL_PATHS } from './legalPaths';

vi.mock('../auth/session', async () => ({
  ...(await import('../test/signedInSession')),
  hasStoredSession: () => false,
  sendEmailCode: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithPassword: vi.fn(),
  watchSignedInUser: vi.fn(),
}));

const LEGAL_PAGE_CASES = [
  { path: LEGAL_PATHS.terms, legalDocument: LEGAL_PAGES.terms },
  { path: LEGAL_PATHS.privacy, legalDocument: LEGAL_PAGES.privacy },
];
const TYPED_EMAIL = 'maya@astra.test';
const STORED_DATA_HEADING = 'What we store';

function openAt(path: string) {
  window.history.replaceState(null, '', path);
  render(<App />);
}

function clickBackLink() {
  fireEvent.click(screen.getAllByRole('link', { name: LEGAL_LABELS.back }).at(0)!);
}

async function typeEmailThenOpen(linkName: string) {
  openAt('/');
  fireEvent.change(await screen.findByPlaceholderText(SIGN_IN_LABELS.emailPlaceholder), { target: { value: TYPED_EMAIL } });
  fireEvent.click(screen.getByRole('link', { name: linkName }));
  await screen.findByRole('heading', { level: 1, name: linkName });
}

beforeEach(() => {
  vi.mocked(watchSignedInUser).mockImplementation((onChange) => {
    onChange(null);
    return () => undefined;
  });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});

describe.each(LEGAL_PAGE_CASES)('$path', ({ path, legalDocument }) => {
  it('opens signed out, says it is a draft, and takes focus to its heading', async () => {
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);

    openAt(path);

    const heading = await screen.findByRole('heading', { level: 1, name: legalDocument.title });
    screen.getByText(LEGAL_LABELS.draftNotice);
    expect(document.activeElement).toBe(heading);
    expect(document.title).toBe(LEGAL_LABELS.pageTitle(legalDocument.title));
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('opens while Auth has not answered, because it sits outside the account gate', async () => {
    vi.mocked(watchSignedInUser).mockImplementation(() => () => undefined);

    openAt(path);

    await screen.findByRole('heading', { level: 1, name: legalDocument.title });
  });

  it('labels every planned statement', async () => {
    openAt(path);

    await screen.findByRole('heading', { level: 1, name: legalDocument.title });
    for (const statement of legalDocument.sections.flatMap((section) => section.planned)) {
      within(screen.getByText(statement).parentElement!).getByText(LEGAL_LABELS.planned);
    }
  });

  it('keeps the typed email when the student returns by the page link', async () => {
    await typeEmailThenOpen(legalDocument.title);

    clickBackLink();

    expect((await screen.findByPlaceholderText<HTMLInputElement>(SIGN_IN_LABELS.emailPlaceholder)).value).toBe(TYPED_EMAIL);
  });

  it('keeps the typed email and refocuses the field when the student returns by browser Back', async () => {
    await typeEmailThenOpen(legalDocument.title);

    await act(async () => {
      window.history.back();
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    });

    const field = await screen.findByPlaceholderText<HTMLInputElement>(SIGN_IN_LABELS.emailPlaceholder);
    expect(field.value).toBe(TYPED_EMAIL);
    expect(document.activeElement).toBe(field);
  });
});

describe('the Privacy Policy', () => {
  it('says Supabase holds everything under What we store, so a row added there stays covered', async () => {
    openAt(LEGAL_PATHS.privacy);

    await screen.findByRole('heading', { level: 2, name: STORED_DATA_HEADING });
    const recipients = screen.getByRole('heading', { level: 2, name: 'Who receives your data' }).parentElement!;

    expect(within(recipients).getByText(/^Supabase /).textContent).toContain(`holds everything listed under ${STORED_DATA_HEADING}`);
  });
});

describe('returning to the first step', () => {
  it('takes focus to its field, so a keyboard or screen reader user is not left on the body', async () => {
    openAt('/');
    fireEvent.click(await screen.findByRole('link', { name: LEGAL_PAGES.terms.title }));
    await screen.findByRole('heading', { level: 1, name: LEGAL_PAGES.terms.title });

    clickBackLink();

    expect(document.activeElement).toBe(await screen.findByPlaceholderText(SIGN_IN_LABELS.emailPlaceholder));
  });
});
