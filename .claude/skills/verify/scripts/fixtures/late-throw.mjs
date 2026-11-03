export default async function lateThrow({ page }) {
  await page.goto('/');
  await page.evaluate(() => {
    setTimeout(() => {
      console.error('deliberate late console error');
      throw new Error('deliberate late page failure');
    }, 800);
  });
}
