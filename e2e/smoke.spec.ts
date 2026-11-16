import { expect, test, type Page } from '@playwright/test';

// The smoke test: does the built site load, and can a person read with it?
// These run in real time on the browser's own clock, so they also cover the
// few lines no unit test reaches (src/engine/browserClock.ts).
//
// Real time means a slow browser can be several words on by the time a
// click lands. So no test here expects a certain word while reading is
// going. They pause first, or they only ask that the word changes.

// Words 1, 11 and 21 are very different in length, and Forward skips 10
// words, so a paused reader can be stepped from one to the next. The 300
// words after them are there so that reading is nowhere near the end when
// a test pauses it.
const TEXT = [
  'I two three four five six seven eight nine ten',
  'extraordinarily twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty',
  'cat',
  ...Array.from({ length: 300 }, (_, index) => `w${index}`),
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
  await expect(word).not.toHaveText('');

  // At 300 words a minute a word gives way after a fifth of a second.
  const shown = await word.textContent();
  await expect(word).not.toHaveText(shown ?? '');

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

  // The three words go by in well under a second, too fast to look for one
  // of them from here. The page itself writes down every word it shows.
  // A string, because this file is checked as Node code and has no `document`.
  await page.evaluate(`
    window.wordsShown = [];
    new MutationObserver(() => {
      const word = document.querySelector('[data-testid="word"]');
      if (word !== null) window.wordsShown.push(word.textContent);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  `);
  await page.getByRole('button', { name: 'Restart' }).click();
  for (const expected of ['one', 'two', 'three']) {
    await expect
      .poll(() => page.evaluate(`window.wordsShown.includes(${JSON.stringify(expected)})`))
      .toBe(true);
  }
  await expect(page.getByText('End of the text.')).toBeVisible();
});

test('the focus letter stays on one spot', async ({ page }) => {
  await startReading(page, TEXT);
  await page.getByRole('button', { name: 'Pause' }).click();
  const word = page.getByTestId('word');

  // Paused somewhere in the text. Step back to the first word. Restart is
  // no help here, because it leaves the reader playing.
  const back = page.getByRole('button', { name: 'Back 10 words' });
  for (let step = 0; step < 40 && (await word.textContent()) !== 'I'; step += 1) {
    await back.click();
  }
  await expect(word).toHaveText('I');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
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
