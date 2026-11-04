import assert from 'node:assert/strict';

export const deadlineMs = 90_000;

function getMarkedBoxes(page) {
  return page.locator('[data-active]').evaluateAll((boxes) => boxes.flatMap((box, index) => (box.dataset.active === 'true' ? [index] : [])));
}

async function assertForcedColorsKeepTheCodeStepReadable(page, field) {
  await page.emulateMedia({ forcedColors: 'active' });
  assert.equal(await field.evaluate((input) => getComputedStyle(input).color), 'rgba(0, 0, 0, 0)', 'forced colors draw the typed digits once');
  const [dot, pageColor] = await page.locator('main .rounded-full').first().evaluate((element) => [getComputedStyle(element).backgroundColor, getComputedStyle(document.body).backgroundColor]);
  assert.notEqual(dot, pageColor, 'forced colors keep the tutor dot');
  await page.emulateMedia({ forcedColors: 'none' });
}

// Inserting the whole code at once has the shape of a paste, and leaves the clipboard of whoever runs this alone.
const enterCodeOverTypedDigits = (page) => async (field, code) => {
  await field.pressSequentially('12');
  await assertForcedColorsKeepTheCodeStepReadable(page, field);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert.deepEqual(await getMarkedBoxes(page), [2], 'Tab back keeps the digits and marks the next box');
  await page.evaluate((wholeCode) => document.execCommand('insertText', false, wholeCode), code);
};

export default async function signIn({ page, capture, viewportName, signInWithCode }) {
  await page.goto('/terms');
  await page.goto('/');
  await page.getByRole('heading', { name: 'Welcome, I am Astra, your personal AI tutor.' }).waitFor();
  await page.getByText('A learning app, made for you').waitFor();
  await capture('email');

  await signInWithCode(`verify-${viewportName}-${Date.now()}@astra.test`, enterCodeOverTypedDigits(page));
  await page.getByRole('textbox', { name: 'Your first name' }).fill('Maya');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'When were you born?' }).waitFor();
  await capture('birth-date');
  await page.getByRole('textbox', { name: 'Day' }).fill('14');
  await page.getByRole('textbox', { name: 'Month' }).fill('3');
  await page.getByRole('textbox', { name: 'Year' }).fill('2004');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('heading', { name: 'Is this right?' }).waitFor();
  await capture('confirm');
  await page.getByRole('button', { name: 'Yes, continue' }).click();
  await page.getByRole('heading', { name: 'Where are you in your learning?' }).waitFor();
  await capture('onboarding');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('textbox', { name: 'Your email' }).waitFor();

  await page.goBack();
  await page.getByRole('heading', { name: 'Terms' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Where are you in your learning?' }).count(), 0, 'Back shows no student page');
  await capture('after-back');
}
