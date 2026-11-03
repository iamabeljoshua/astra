export default async function pageCrashes({ page }) {
  await page.goto('/');
  await page.goto('chrome://crash').catch(() => {});
}
