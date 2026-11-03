export default async function home({ page }) {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Welcome back, Maya.' }).waitFor();
  await page.getByRole('button', { name: 'Continue session' }).waitFor();
}
