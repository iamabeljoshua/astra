export default async function appearance({ page, capture, viewportName, signIn }) {
  const darkThemeRoot = page.locator('html[data-theme="dark"]');
  await signIn();
  await page.getByRole('heading', { name: 'Welcome back, Maya.' }).waitFor();
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Dark' }).click();
  await darkThemeRoot.waitFor({ state: 'attached' });
  await capture('dark');
  await page.reload();
  await darkThemeRoot.waitFor({ state: 'attached' });
  await capture('dark-after-reload');
}
