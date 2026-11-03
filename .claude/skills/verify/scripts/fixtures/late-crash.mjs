export default async function lateCrash({ page }) {
  await page.goto('/');
  setTimeout(() => page.goto('chrome://crash').catch(() => {}), 150);
}
