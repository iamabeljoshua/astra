const SEEDED_STUDENT_EMAIL = 'maya@astra.test';

// Uses the Development sign-in box, which only the dev server shows, with the accounts that pnpm db:up creates.
export function createSignIn(page) {
  return async (email = SEEDED_STUDENT_EMAIL) => {
    await page.goto('/');
    await page.getByRole('button', { name: email }).click();
  };
}
