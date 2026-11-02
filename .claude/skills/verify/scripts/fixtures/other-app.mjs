export default async function otherApp({ page }) {
  await page.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Some other app</title><h1>Some other app</h1>',
    }),
  );
  await page.goto('/');
}
