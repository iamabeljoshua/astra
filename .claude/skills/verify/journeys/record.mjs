import assert from 'node:assert/strict';

const EMPTY_LINE = /Nothing yet/;
const REMOVED_ON_LAPTOP = 'free-body diagrams';
const REMOVED_ON_PHONE = 'why the sky is dark at night';

// The seed holds three notes, so a laptop run removes one, and a phone run after it removes another and forgets the last. Seed again before running again.
export default async function record({ page, capture, viewportName, signIn }) {
  await signIn();
  await page.getByRole('heading', { name: 'Welcome back, Maya.' }).waitFor();
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Your notes' }).click();
  const notes = page.getByRole('region', { name: 'What your tutor remembers' });
  const topic = viewportName === 'phone' ? REMOVED_ON_PHONE : REMOVED_ON_LAPTOP;
  await notes.getByText(topic, { exact: true }).waitFor();
  await notes.getByText(/On the board: .*Marked right\./).waitFor();
  await notes.getByText(/You said: /).first().waitFor();
  await capture('notes');

  await notes.getByRole('button', { name: `Remove ${topic}` }).click();
  await notes.getByText(topic, { exact: true }).waitFor({ state: 'detached' });
  await page.reload();
  await notes.getByText(/On the board: .*Marked right\./).waitFor();
  assert.equal(await notes.getByText(topic, { exact: true }).count(), 0, 'a removed note stays gone after a reload');
  await capture('one-removed');

  if (viewportName === 'phone') {
    await notes.getByRole('button', { name: 'Forget everything' }).click();
    await notes.getByRole('button', { name: 'Yes, forget everything' }).click();
    await notes.getByText(EMPTY_LINE).waitFor();
    await capture('empty');
  }
}
