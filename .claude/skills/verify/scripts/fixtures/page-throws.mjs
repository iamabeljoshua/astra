export default async function pageThrows({ page }) {
  await page.route('**/src/main.tsx', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "throw new Error('deliberate page failure');",
    }),
  );
  await page.goto('/');
}
