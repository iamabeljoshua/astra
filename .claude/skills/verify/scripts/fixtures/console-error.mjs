export default async function consoleError({ page }) {
  await page.goto('/');
  await page.evaluate(() => console.error('deliberate console error'));
}
