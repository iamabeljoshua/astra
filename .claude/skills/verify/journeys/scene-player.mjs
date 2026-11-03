export default async function scenePlayer({ page, capture }) {
  await page.goto('/lab/scene-player');
  await page.getByRole('heading', { name: 'Scene player lab' }).waitFor();
  await page.getByRole('region', { name: 'Board' }).waitFor();
  await page.getByText('Start the lab with pnpm lab, then open the address it prints.').waitFor();
  await capture('scene-player');
}
