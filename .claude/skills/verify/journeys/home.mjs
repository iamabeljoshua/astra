export default async function home({ page, signIn }) {
  await signIn();
  await page.getByRole('heading', { name: 'Welcome back, Maya.' }).waitFor();
  await page.getByRole('button', { name: 'Continue session' }).waitFor();
}
