export default async function missingAwait({ page }) {
  await page.goto('/');
  page.getByRole('button', { name: 'Does not exist' }).click();
}
