export const deadlineMs = 1_000;

export default async function neverSettles({ page }) {
  setInterval(() => {}, 60_000);
  await page.goto('/');
  await page.evaluate(() => new Promise(() => {}));
}
