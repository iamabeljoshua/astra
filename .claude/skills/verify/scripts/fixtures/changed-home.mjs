import home from '../../journeys/home.mjs';

export default async function changedHome({ page, signIn }) {
  await home({ page, signIn });
  await page.evaluate(process.env.HOME_CHANGE_SCRIPT);
}
