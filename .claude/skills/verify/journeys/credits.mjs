export default async function credits({ page, capture, viewportName, signIn }) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Credits' }).click();
  await page.getByRole('heading', { level: 1, name: 'Credits' }).waitFor();
  await page.getByText('The whole Earth, taken from Apollo 17 on 7 December 1972. Credit NASA.').waitFor();
  await capture('page');

  await signIn();
  await page.getByRole('heading', { name: 'Welcome back, Maya.' }).waitFor();
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Credits' }).click();
  await page.getByRole('heading', { level: 1, name: 'Credits' }).waitFor();
}
