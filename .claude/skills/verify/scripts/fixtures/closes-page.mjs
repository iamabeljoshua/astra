export default async function closesPage({ page }) {
  await page.goto('/');
  await page.close();
}
