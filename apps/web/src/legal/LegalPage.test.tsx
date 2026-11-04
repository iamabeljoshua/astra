import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { watchSignedInUser } from '../auth/session';
import { LEGAL_LABELS, LEGAL_PAGES, SIGN_IN_LABELS } from '../strings';
import { LEGAL_PATHS } from './legalPaths';

vi.mock('../auth/session', async () => ({
  ...(await import('../test/signedInSession')),
  hasStoredSession: () => false,
  sendEmailLink: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithPassword: vi.fn(),
  watchSignedInUser: vi.fn(),
}));

const LEGAL_PAGE_CASES = [
  { path: LEGAL_PATHS.terms, legalDocument: LEGAL_PAGES.terms },
  { path: LEGAL_PATHS.privacy, legalDocument: LEGAL_PAGES.privacy },
];
const TYPED_EMAIL = 'maya@astra.test';

function openAt(path: string) {
  window.history.replaceState(null, '', path);
  render(<App />);
}

function getEmailField() {
  return screen.getByPlaceholderText<HTMLInputElement>(SIGN_IN_LABELS.emailPlaceholder);
}

function clickBackLink() {
  fireEvent.click(screen.getAllByRole('link', { name: LEGAL_LABELS.back }).at(0)!);
}

async function typeEmailThenOpen(linkName: string) {
  openAt('/');
  fireEvent.click(await screen.findByRole('button', { name: SIGN_IN_LABELS.email }));
  fireEvent.change(getEmailField(), { target: { value: TYPED_EMAIL } });
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
  it('says Supabase holds what we store on our servers, with no list to go stale and no claim on what stays in the browser', async () => {
    openAt(LEGAL_PATHS.privacy);

    const recipients = (await screen.findByRole('heading', { level: 2, name: 'Who receives your data' })).parentElement!;

    expect(within(recipients).getByText(/^Supabase /).textContent).toBe(
      'Supabase runs our sign-in service and our database, so it holds everything we store on our servers, and it sends the sign-in email.',
    );
  });
});

describe('returning to the welcome step', () => {
  it('takes focus to its heading, so a keyboard or screen reader user is not left on the body', async () => {
    openAt('/');
    fireEvent.click(await screen.findByRole('link', { name: LEGAL_PAGES.terms.title }));
    await screen.findByRole('heading', { level: 1, name: LEGAL_PAGES.terms.title });

    clickBackLink();

    expect(document.activeElement).toBe(await screen.findByRole('heading', { level: 1, name: SIGN_IN_LABELS.tagline }));
  });
});

describe('what the legal pages say', () => {
  it('says a student\'s name, level, interests, and goal and a question sent from Home are stored', () => {
    const stored = LEGAL_PAGES.privacy.sections.find(({ heading }) => heading === 'What we store')?.today.join(' ');

    expect(stored).toContain('The name you give your tutor, your level, the interests you choose, and your goal. We keep these in our database');
    expect(stored).toContain("A question you send from the home screen becomes its session's title, cut to 200 characters, so we store those words.");
    expect(stored).not.toContain('question box');
  });

  it('tells a student under 18 that no parent or guardian is asked', () => {
    const underEighteen = LEGAL_PAGES.privacy.sections.find(({ heading }) => heading === 'If you are under 18');

    expect(underEighteen?.today.join(' ')).toContain('We do not ask a parent or guardian to approve your account.');
    expect(underEighteen?.planned).toEqual([]);
  });

  it.each([
    ['parent consent', /consent/i],
    ['a parent who accepts or receives anything', /parent's|for parents|or a parent|they accept/i],
    ['a choice of voice', /tutor voice|voice samples/i],
    ['a first answer to the tutor', /first answer|first hello|first question/i],
  ])('claims nothing about %s, which the app no longer has', (_caseName, wording) => {
    expect(JSON.stringify(LEGAL_PAGES)).not.toMatch(wording);
  });
});
