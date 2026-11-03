export default async function menu({ page, capture, viewportName }) {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Welcome back, Maya.' }).waitFor();
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
  await capture('sessions');
}
