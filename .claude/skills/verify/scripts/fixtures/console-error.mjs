export default async function consoleError({ page, productName }) {
  await page.goto('/');
  await page.getByRole('heading', { name: productName }).waitFor();
  await page.evaluate(() => console.error('deliberate console error'));
}
