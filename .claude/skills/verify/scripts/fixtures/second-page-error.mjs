export default async function secondPageError({ page }) {
  await page.goto('/');
  const secondPage = await page.context().newPage();
  await secondPage.goto('/');
  await secondPage.evaluate(() => {
    console.error('deliberate second page console error');
    setTimeout(() => {
      throw new Error('deliberate second page failure');
    }, 0);
  });
  await secondPage.waitForTimeout(200);
  await secondPage.close();
}
