import assert from 'node:assert/strict';

export const deadlineMs = 90_000;

export default async function signIn({ page, capture, viewportName, signInWithCode }) {
  await page.goto('/terms');
  await page.goto('/');
  await page.getByRole('heading', { name: 'Welcome, I am Astra, your personal AI tutor.' }).waitFor();
  await page.getByText('A learning app, made for you').waitFor();
  await capture('email');

  await signInWithCode(`verify-${viewportName}-${Date.now()}@astra.test`);
  await page.getByRole('heading', { name: 'When were you born?' }).waitFor();
  await capture('birth-date');
  await page.getByRole('textbox', { name: 'Day' }).fill('14');
  await page.getByRole('textbox', { name: 'Month' }).fill('3');
  await page.getByRole('textbox', { name: 'Year' }).fill('2004');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Is this right?' }).waitFor();
  await capture('confirm');
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  await page.getByRole('heading', { name: 'Welcome.' }).waitFor();
  await capture('home');

  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('textbox', { name: 'Your email' }).waitFor();

  await page.goBack();
  await page.getByRole('heading', { name: 'Terms' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Welcome.', exact: true }).count(), 0, 'Back shows no student page');
  await capture('after-back');
}
