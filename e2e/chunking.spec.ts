import { expect, test, type Page } from '@playwright/test';

import { letTheClickSettle } from './helpers.js';

// Chunking in a real browser: the group is on one line with the first word's
// focus letter on the spot it has for a single word, and the choice is kept.

const TEXT = Array.from({ length: 60 }, (_, index) => `w${index}`).join(' ');

async function startPaused(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByRole('button', { name: 'Blank transcript' }).click();
  await page.getByLabel('Transcript title').fill('Grouped');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(TEXT);
  await page.getByRole('button', { name: 'Start reading' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await letTheClickSettle(page);
  await page.getByRole('slider', { name: 'Position' }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('word')).toHaveText('w0');
}

// What is saved in the browser for the first transcript, read straight from
// the database. A reload in the instant after a change can come before the
// save has finished, so the tests wait for the save and then reload. The
// script is text because it runs in the page, not here.
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

async function savedTranscript(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate<Record<string, unknown> | null>(SAVED_TRANSCRIPT);
}

async function focusLetterMiddle(page: Page): Promise<number> {
  const box = await page.getByTestId('word').locator('span').nth(1).boundingBox();
  if (!box) throw new Error('no focus letter on the page');
  return box.x + box.width / 2;
}

test('a group keeps the focus letter of its first word on the same spot', async ({ page }) => {
  await startPaused(page);
  const alone = await focusLetterMiddle(page);
  await page.getByLabel('Group', { exact: true }).check();
  await page.getByRole('button', { name: 'More words per group' }).click();
  await expect(page.getByTestId('word')).toHaveText('w0 w1 w2');
  expect(Math.abs((await focusLetterMiddle(page)) - alone)).toBeLessThan(1);
});

test('reading moves on a whole group at a time', async ({ page }) => {
  await startPaused(page);
  await page.getByLabel('Group', { exact: true }).check();
  await page.getByRole('button', { name: 'Play' }).click();
  // No particular group is expected while it plays: a slow browser may
  // be past it before the test looks.
  await expect(page.getByTestId('word')).not.toHaveText('w0 w1');
  await page.getByRole('button', { name: 'Pause' }).click();
  // Paused on a group: always an even word first.
  const shown = await page.getByTestId('word').textContent();
  expect(shown).toMatch(/^w\d*[02468] w\d*[13579]$/);
});

test('chunking is kept with the transcript over a reload', async ({ page }) => {
  await startPaused(page);
  await page.getByLabel('Group', { exact: true }).check();
  await expect(page.getByTestId('word')).toHaveText('w0 w1');
  await expect.poll(async () => (await savedTranscript(page))?.chunking_enabled).toBe(true);
  await page.reload();
  await expect(page.getByLabel('Group', { exact: true })).toBeChecked();
  await expect(page.getByTestId('word')).toHaveText('w0 w1');
});
