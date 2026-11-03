export default async function servedPage({ page }) {
  await page.route('**/*', (route) =>
    route.fulfill({ contentType: 'text/html', body: process.env.SERVED_PAGE_HTML }),
  );
  await page.goto('/');
}
