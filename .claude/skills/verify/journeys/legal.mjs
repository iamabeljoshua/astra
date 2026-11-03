import assert from 'node:assert/strict';

const TYPED_ADDRESS = 'still-here@astra.test';
const MOST_TABS_TO_ANY_CONTROL = 15;
const DRAFT_LINE = /has not yet reviewed this page/;

function isFocused(locator) {
  return locator.evaluate((element) => element === document.activeElement);
}

async function pressUntilFocused(page, key, locator) {
  for (let presses = 0; presses < MOST_TABS_TO_ANY_CONTROL; presses += 1) {
    if (await isFocused(locator)) return;
    await page.keyboard.press(key);
  }
  throw new Error(`${key} never reached ${locator}.`);
}

async function assertDraftPage(page, title) {
  await page.getByRole('heading', { level: 1, name: title }).waitFor();
  await page.waitForFunction((headingText) => document.activeElement?.matches('h1') && document.activeElement.textContent === headingText, title);
  await page.getByText(DRAFT_LINE).waitFor();
}

async function chooseThemeByKeyboard(page, themeName) {
  await pressUntilFocused(page, 'Shift+Tab', page.getByRole('button', { name: themeName }));
  await page.keyboard.press('Enter');
  await page.locator(`html${themeName === 'Dark' ? '[data-theme="dark"]' : ':not([data-theme="dark"])'}`).waitFor({ state: 'attached' });
}

async function openPageByKeyboard(page, title) {
  await pressUntilFocused(page, 'Tab', page.getByRole('link', { name: title }));
  await page.keyboard.press('Enter');
  await assertDraftPage(page, title);
}

async function assertAddressKept(page) {
  const field = page.getByRole('textbox', { name: 'Your email address' });
  await field.waitFor();
  assert.equal(await field.inputValue(), TYPED_ADDRESS, 'the typed address is still there');
}

export default async function legal({ page, capture }) {
  await page.goto('/');
  await pressUntilFocused(page, 'Tab', page.getByRole('button', { name: 'Continue with email' }));
  await page.keyboard.press('Enter');
  await pressUntilFocused(page, 'Tab', page.getByRole('textbox', { name: 'Your email address' }));
  await page.keyboard.type(TYPED_ADDRESS);

  await openPageByKeyboard(page, 'Terms');
  await capture('terms-light');
  await chooseThemeByKeyboard(page, 'Dark');
  await capture('terms-dark');
  await pressUntilFocused(page, 'Tab', page.getByRole('link', { name: 'Back to Astra' }).first());
  await page.keyboard.press('Enter');
  await assertAddressKept(page);

  await openPageByKeyboard(page, 'Privacy Policy');
  await capture('privacy-dark');
  await chooseThemeByKeyboard(page, 'Light');
  await capture('privacy-light');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.goBack();
  await assertAddressKept(page);
  assert.equal(await page.evaluate(() => window.scrollY), 0, 'coming back starts at the top');
  await capture('kept-address');
}
