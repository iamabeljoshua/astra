export default async function journeyGivesUp({ page }) {
  await page.goto('/');
  throw new Error('deliberate journey failure');
}
