import { expect, test } from '@playwright/test';

// The Normalize button in a real browser: it tidies the text, and the way
// back is still there after a reload.

const WRAPPED =
  'The meeting started late\nbecause the speaker was\nstuck in traffic.\n\nSecond paragraph here.';
const NORMALIZED =
  'The meeting started late because the speaker was stuck in traffic.\n\nSecond paragraph here.';

// The first transcript as saved in the browser. A reload right after a
// change can come before the save has finished, so the test waits for it.
// The script is text because it runs in the page.
const SAVED_TRANSCRIPT = `new Promise((resolve) => {
  const open = indexedDB.open('rsvp-web-reader');
  open.onerror = () => resolve(null);
  open.onsuccess = () => {
    const request = open.result.transaction('library').objectStore('library').get('current');
    request.onerror = () => { open.result.close(); resolve(null); };
    request.onsuccess = () => {
      open.result.close();
      const record = request.result;
      resolve((record && record.data && record.data.transcripts && record.data.transcripts[0]) || null);
    };
  };
})`;

test('Normalize tidies the text, and Revert is still there after a reload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByRole('button', { name: 'Blank transcript' }).click();
  await page.getByLabel('Transcript title').fill('Lecture');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(WRAPPED);

  await page.getByRole('button', { name: 'Normalize the text' }).click();
  await expect(page.getByLabel('Transcript text')).toHaveValue(NORMALIZED);
  const revert = page.getByRole('button', { name: 'Revert to the original text' });
  await expect(revert).toBeVisible();
  await expect
    .poll(async () => {
      const saved = await page.evaluate<Record<string, unknown> | null>(SAVED_TRANSCRIPT);
      return saved?.normalized_text;
    })
    .toBe(NORMALIZED);

  await page.reload();
  await page.getByRole('button', { name: 'Lecture', exact: true }).click();
  await expect(page.getByLabel('Transcript text')).toHaveValue(NORMALIZED);
  await revert.click();
  await expect(page.getByLabel('Transcript text')).toHaveValue(WRAPPED);
  await expect(page.getByRole('button', { name: 'Normalize the text' })).toBeVisible();
});
