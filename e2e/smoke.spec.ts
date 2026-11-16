import { expect, test, type Page } from '@playwright/test';

// The smoke test: does the built site load, and can a person read with it?
// These run in real time on the browser's own clock, so they also cover the
// few lines no unit test reaches (src/engine/browserClock.ts).

// 21 words. Words 1, 11 and 21 are very different in length, and Forward
// skips 10 words, so a paused reader can be stepped from one to the next.
const TEXT = [
  'I two three four five six seven eight nine ten',
  'extraordinarily twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty',
  'cat',
].join(' ');

async function startReading(page: Page, text: string): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByLabel('Transcript title').fill('Smoke test');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(text);
  await page.getByRole('button', { name: 'Start reading' }).click();
}

// Where the middle of the focus letter is, in pixels from the left.
async function focusLetterCentre(page: Page): Promise<number> {
  const box = await page.getByTestId('word').locator('span').nth(1).boundingBox();
  if (box === null) throw new Error('the focus letter is not on the page');
  return box.x + box.width / 2;
}

test('the page loads under its base path', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('RSVP Web Reader');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('List of Transcripts');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

test('paste, start, the words advance, and pause holds', async ({ page }) => {
  await startReading(page, TEXT);
  const word = page.getByTestId('word');
  await expect(word).toHaveText('I');

  // At 300 words a minute the first word gives way after a fifth of a second.
  await expect(word).not.toHaveText('I');

  await page.getByRole('button', { name: 'Pause' }).click();
  const held = await word.textContent();
  // Long enough for five more words, if reading had gone on.
  await page.waitForTimeout(1000);
  await expect(word).toHaveText(held ?? '');

  await page.getByRole('button', { name: 'Play' }).click();
  await expect(word).not.toHaveText(held ?? '');
});

test('reading runs to the end and Restart starts again', async ({ page }) => {
  await startReading(page, 'one two three');
  await expect(page.getByText('End of the text.')).toBeVisible();
  await expect(page.getByText('100%')).toBeVisible();
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(page.getByTestId('word')).toHaveText('one');
});

test('the focus letter stays on one spot', async ({ page }) => {
  await startReading(page, TEXT);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Restart' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  const word = page.getByTestId('word');

  await expect(word).toHaveText('I');
  const first = await focusLetterCentre(page);

  await page.getByRole('button', { name: 'Forward 10 words' }).click();
  await expect(word).toHaveText('extraordinarily');
  const second = await focusLetterCentre(page);

  await page.getByRole('button', { name: 'Forward 10 words' }).click();
  await expect(word).toHaveText('cat');
  const third = await focusLetterCentre(page);

  // Half a pixel of room, because browsers round letter widths.
  expect(Math.abs(second - first)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(third - first)).toBeLessThanOrEqual(0.5);

  // And that spot is the middle of the reading row.
  const row = await word.boundingBox();
  if (row === null) throw new Error('the word row is not on the page');
  expect(Math.abs(first - (row.x + row.width / 2))).toBeLessThanOrEqual(0.5);
});

test('transcripts live in their own Space', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByLabel('Transcript title').fill('In General');
  await page.getByRole('button', { name: 'Create' }).click();

  await page.getByRole('button', { name: 'New Space' }).click();
  await page.getByLabel('Space name').fill('Work');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('button', { name: 'In General', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Select Space' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'General', exact: true }).click();
  await expect(page.getByRole('button', { name: 'In General', exact: true })).toBeVisible();
});

test('the site asks for nothing from anywhere else', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin;
  const elsewhere: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(origin) && !url.startsWith('data:')) elsewhere.push(url);
  });
  await startReading(page, TEXT);
  await expect(page.getByTestId('word')).not.toHaveText('I');
  // The fonts come from the site itself, never from a font service.
  // A string, because this file is checked as Node code and has no `document`.
  await expect.poll(() => page.evaluate('document.fonts.check("16px Quicksand")')).toBe(true);
  expect(elsewhere).toEqual([]);
});
