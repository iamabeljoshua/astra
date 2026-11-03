import home from '../../journeys/home.mjs';

export default async function changedHome({ page }) {
  await home({ page });
  await page.evaluate(process.env.HOME_CHANGE_SCRIPT);
}
