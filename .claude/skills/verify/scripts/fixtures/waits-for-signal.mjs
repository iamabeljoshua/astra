export default async function waitsForSignal({ page }) {
  await page.goto('/');
  console.log('the journey is waiting');
  await new Promise(() => {});
}
