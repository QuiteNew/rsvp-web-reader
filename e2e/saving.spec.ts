import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

// Saving, in a real browser: the unit tests cannot run IndexedDB, so this
// is where src/store/indexedDbLibrary.ts is checked. Every test starts
// with a browser that has nothing saved.

// A transcript's card in the list. Exact, because the card's delete button
// has the title in its name too.
function card(page: Page, title: string) {
  return page.getByRole('button', { name: title, exact: true });
}

async function addTranscript(page: Page, title: string, text: string): Promise<void> {
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByLabel('Transcript title').fill(title);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(text);
}

// Forty words that tell their own place: w0, w1, w2 and so on.
const FORTY_WORDS = Array.from({ length: 40 }, (_, index) => `w${index}`).join(' ');

// Start reading, pause, and step ten words on. Returns the word the reader
// is paused on. Where the pause lands is not fixed, because it depends on
// how fast the browser clicks, so the word is read back instead of assumed.
// (Restart is no help here: it always leaves the reader playing.)
async function pauseTenWordsOn(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Start reading' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  const shown = ((await page.getByTestId('word').textContent()) ?? '').trim();
  const expected = `w${Number(shown.slice(1)) + 10}`;
  await page.getByRole('button', { name: 'Forward 10 words' }).click();
  await expect(page.getByTestId('word')).toHaveText(expected);
  return expected;
}

test('transcripts, Spaces and the place in the text survive a reload', async ({ page }) => {
  await page.goto('./');
  await addTranscript(page, 'Kept', FORTY_WORDS);
  // The reader is left open and paused on a known word.
  const place = await pauseTenWordsOn(page);

  await page.getByRole('button', { name: 'New Space' }).click();
  await page.getByLabel('Space name').fill('Work');
  await page.getByRole('button', { name: 'Create' }).click();
  await addTranscript(page, 'At work', 'other words');

  await page.reload();

  // The Space that was open is open again, with its transcript.
  await expect(card(page, 'At work')).toBeVisible();
  await page.getByRole('button', { name: 'Select Space' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'General', exact: true }).click();
  // It was left in the reader, so it opens in the reader, paused on the
  // same word. Nothing is playing, so there is no timing to race.
  await card(page, 'Kept').click();
  await expect(page.getByTestId('word')).toHaveText(place);
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  // Its text is saved too.
  await page.getByRole('button', { name: 'Stop reading' }).click();
  await expect(page.getByLabel('Transcript text')).toHaveValue(/^w0 w1 w2/);
});

test('a save that cannot be read is put aside and the app starts empty', async ({ page }) => {
  await page.goto('./');
  await addTranscript(page, 'Before', 'some words');
  await expect(card(page, 'Before')).toBeVisible();

  // Write something that is not a library over the saved record.
  const damage = `new Promise((resolve, reject) => {
    const open = indexedDB.open('rsvp-web-reader');
    open.onsuccess = () => {
      const transaction = open.result.transaction('library', 'readwrite');
      transaction.objectStore('library').put({ format: 1, data: { transcripts: [5] } }, 'current');
      transaction.oncomplete = () => { open.result.close(); resolve(true); };
      transaction.onerror = () => reject(transaction.error);
    };
    open.onerror = () => reject(open.error);
  })`;
  await expect.poll(() => page.evaluate(damage)).toBe(true);
  await page.reload();

  const notice = page.getByRole('alert');
  await expect(notice).toContainText('could not be read');
  await expect(notice).toContainText('library.damaged-');
  await expect(card(page, 'Before')).toHaveCount(0);

  // A second reload finds the same damaged record and keeps one copy, not two.
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('library.damaged-');
  const copies = `new Promise((resolve, reject) => {
    const open = indexedDB.open('rsvp-web-reader');
    open.onsuccess = () => {
      const count = open.result.transaction('damaged').objectStore('damaged').count();
      count.onsuccess = () => { open.result.close(); resolve(count.result); };
      count.onerror = () => reject(count.error);
    };
    open.onerror = () => reject(open.error);
  })`;
  expect(await page.evaluate(copies)).toBe(1);

  // The app still works, and what is added now is saved over the bad record.
  await page.getByRole('alert').getByRole('button', { name: 'OK' }).click();
  await addTranscript(page, 'After', 'new words');
  await page.reload();
  await expect(card(page, 'After')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('an export file brings everything back after it is deleted', async ({ page }) => {
  await page.goto('./');
  await addTranscript(page, 'Café notes', 'one two three');

  await page.getByRole('button', { name: 'Settings' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to a file' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('rsvp-reader-export.json');
  const path = await download.path();
  const bundle = JSON.parse(await readFile(path, 'utf8')) as {
    bundle_format: number;
    data: { transcripts: { title: string; raw_text: string }[] };
    settings: object;
  };
  expect(bundle.bundle_format).toBe(1);
  expect(bundle.data.transcripts).toMatchObject([
    { title: 'Café notes', raw_text: 'one two three' },
  ]);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Delete Café notes' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(card(page, 'Café notes')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Import from a file').setInputFiles(path);
  await page.getByRole('button', { name: 'Replace everything' }).click();
  await expect(card(page, 'Café notes')).toBeVisible();

  // And the import itself was saved.
  await page.reload();
  await card(page, 'Café notes').click();
  await expect(page.getByLabel('Transcript text')).toHaveValue('one two three');
});

test('a reload comes back to the word being read, paused', async ({ page }) => {
  await page.goto('./');
  await addTranscript(page, 'Lecture', FORTY_WORDS);
  const place = await pauseTenWordsOn(page);

  await page.reload();

  // No click needed: the reader is open on the same word, and it is paused.
  await expect(page.getByTestId('word')).toHaveText(place);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lecture');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('word')).toHaveText(place);
});
