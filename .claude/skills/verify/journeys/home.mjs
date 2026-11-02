export default async function home({ page, productName }) {
  await page.goto('/');
  await page.getByRole('heading', { name: productName }).waitFor();
  await page.getByText('The API is connected.').waitFor();
}
