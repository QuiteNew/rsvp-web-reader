import { expect, test, type Page } from '@playwright/test';

import { installClock, startReadingPaused } from './helpers.js';

// The OpenDyslexic switch in a real browser: the whole page changes font at
// once, the files come from the site itself and only when the switch is on,
// and the reader measures its word in the new font.

async function startPaused(page: Page, text: string): Promise<void> {
  await installClock(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByRole('button', { name: 'Blank transcript' }).click();
  await page.getByLabel('Transcript title').fill('Font');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(text);
  await startReadingPaused(page);
}

// The size once it has stopped changing: the same twice, a moment apart. The
// word can be drawn at a size from a measure taken before a font finished
// loading, and then again at the right one, so a single read is not enough.
async function settledSize(page: Page): Promise<number> {
  let last = await page.evaluate<number>(SIZE);
  for (let tries = 0; tries < 20; tries += 1) {
    await page.waitForTimeout(300);
    const now = await page.evaluate<number>(SIZE);
    if (now === last) return now;
    last = now;
  }
  throw new Error('the size of the word keeps changing');
}

async function setSwitch(page: Page, on: boolean): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  const box = page.getByLabel('Use the OpenDyslexic font');
  if (on) await box.check();
  else await box.uncheck();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

// Runs in the page, so it is text. The first family of an element, with its
// weight, as the browser worked them out.
function fontOf(selector: string): string {
  return `(() => {
    const style = getComputedStyle(document.querySelector(${JSON.stringify(selector)}));
    return style.fontWeight + ' ' + style.fontFamily.split(',')[0].replaceAll('"', '');
  })()`;
}

// The size the word is drawn at, in px. Runs in the page.
const SIZE = `Number.parseFloat(
  getComputedStyle(document.querySelector('[data-testid=word]').parentElement).fontSize,
)`;

// How far the focus letter's middle is from the row's, and how much of the
// row spills past its sides, in px. Runs in the page.
const WHERE = `(() => {
  const row = document.querySelector('[data-testid=word]');
  const [before, focus, after] = Array.from(row.children);
  const box = focus.getBoundingClientRect();
  const rowBox = row.getBoundingClientRect();
  return {
    off: box.left + box.width / 2 - (rowBox.left + rowBox.width / 2),
    spill: Math.max(before.scrollWidth - before.clientWidth, after.scrollWidth - after.clientWidth),
  };
})()`;

test('off, the page uses Quicksand and Fredoka, and never fetches OpenDyslexic', async ({
  page,
}) => {
  const fetched: string[] = [];
  page.on('request', (request) => fetched.push(request.url()));
  await startPaused(page, 'Reading information carefully helps');
  expect(await page.evaluate<string>(fontOf('body'))).toBe('500 Quicksand');
  expect(await page.evaluate<string>(fontOf('[data-testid=word]'))).toBe('600 Fredoka');
  expect(fetched.filter((url) => url.includes('OpenDyslexic'))).toEqual([]);
});

test('on, every font follows, and the files come from the site itself', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? '').origin;
  const fetched: string[] = [];
  page.on('request', (request) => fetched.push(request.url()));
  await startPaused(page, 'Reading information carefully helps');
  await setSwitch(page, true);
  await expect.poll(() => page.evaluate<string>(fontOf('body'))).toBe('500 OpenDyslexic');
  expect(await page.evaluate<string>(fontOf('[data-testid=word]'))).toBe('600 OpenDyslexic');
  // Strings, because this file is checked as Node code and has no `document`.
  await expect
    .poll(() => page.evaluate('document.fonts.check("400 16px OpenDyslexic")'))
    .toBe(true);
  await expect
    .poll(() => page.evaluate('document.fonts.check("700 16px OpenDyslexic")'))
    .toBe(true);
  const files = fetched.filter((url) => url.includes('OpenDyslexic'));
  expect(files.length).toBe(2);
  for (const url of files) expect(url.startsWith(origin)).toBe(true);
  expect(fetched.filter((url) => !url.startsWith(origin) && !url.startsWith('data:'))).toEqual([]);
});

test('the word is measured in the new font: drawn smaller to fit, and centred', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await startPaused(page, 'extraordinarily straightforward unbelievably comprehensive words');
  await page.getByLabel('Group', { exact: true }).check();
  // The widest chunk does not fit at the chosen size, so the fit is already
  // working: the word is drawn smaller than 32 px.
  const before = await page.evaluate<number>(SIZE);
  expect(before).toBeLessThan(32);
  // Nothing moves the reader after the switch, so the only thing that can
  // make the fit right is measuring again in the new font. OpenDyslexic is
  // wider, so the word has to come out smaller still.
  await setSwitch(page, true);
  await expect.poll(() => page.evaluate<string>(fontOf('[data-testid=word]'))).toContain('Dysl');
  await expect
    .poll(() => page.evaluate('document.fonts.check("700 16px OpenDyslexic")'))
    .toBe(true);
  const dyslexic = await settledSize(page);
  expect(dyslexic).toBeLessThan(before);
  const where = await page.evaluate<{ off: number; spill: number }>(WHERE);
  expect(Math.abs(where.off)).toBeLessThan(0.5);
  expect(where.spill).toBeLessThanOrEqual(1);
  // Back and forth. Both sets are loaded by now, so no font loading event
  // comes, and only the change of the set itself can make it measure again.
  await setSwitch(page, false);
  await expect.poll(() => page.evaluate<number>(SIZE)).toBe(before);
  await setSwitch(page, true);
  expect(await settledSize(page)).toBe(dyslexic);
});

test('the switch is kept after a reload, and off again goes back', async ({ page }) => {
  await startPaused(page, 'Reading information carefully helps');
  await setSwitch(page, true);
  await page.reload();
  await expect.poll(() => page.evaluate<string>(fontOf('body'))).toBe('500 OpenDyslexic');
  await setSwitch(page, false);
  await expect.poll(() => page.evaluate<string>(fontOf('body'))).toBe('500 Quicksand');
});
