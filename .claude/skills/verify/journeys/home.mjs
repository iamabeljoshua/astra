export default async function home({ page }) {
  await page.goto('/');
  await page.getByText('The API is connected.').waitFor();
}
