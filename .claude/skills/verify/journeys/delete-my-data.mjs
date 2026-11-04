// Deletes a seeded student, so seed again before the next run. Without SUPABASE_SECRET_KEY the sign-in stays and only the app's data goes.
const STUDENT_OF_VIEWPORT = { laptop: 'tola@astra.test', phone: 'maya@astra.test' };

export default async function deleteMyData({ page, capture, viewportName, signIn }) {
  await signIn(STUDENT_OF_VIEWPORT[viewportName]);
  await page.getByRole('heading', { name: /^Welcome/ }).waitFor();
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Your notes' }).click();

  await page.getByRole('button', { name: 'Delete my data' }).click();
  await page.getByText('This cannot be undone.').waitFor();
  await capture('confirm');

  await page.getByRole('button', { name: 'Keep my data' }).click();
  await page.getByRole('button', { name: 'Delete my data' }).click();
  await page.getByRole('button', { name: 'Delete everything' }).click();

  await page.getByRole('textbox', { name: 'Your email' }).waitFor();
  await capture('signed-out');
}
