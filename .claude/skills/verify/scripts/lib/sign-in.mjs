const SEEDED_STUDENT_EMAIL = 'maya@astra.test';

export function createSignIn(page) {
  return async (email = SEEDED_STUDENT_EMAIL) => {
    await page.goto('/');
    await page.getByRole('button', { name: email }).click();
  };
}
