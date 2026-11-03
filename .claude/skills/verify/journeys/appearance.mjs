export default async function appearance({ page, capture, viewportName }) {
  const darkThemeRoot = page.locator('html[data-theme="dark"]');
  await page.goto('/');
  await page.getByText('The API is connected.').waitFor();
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Dark' }).click();
  await darkThemeRoot.waitFor({ state: 'attached' });
  await capture('dark');
  await page.reload();
  await darkThemeRoot.waitFor({ state: 'attached' });
  await capture('dark-after-reload');
}
