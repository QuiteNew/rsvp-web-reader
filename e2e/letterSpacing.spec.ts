import { expect, test, type Page } from '@playwright/test';

import { installClock, letTheClickSettle, startReadingPaused } from './helpers.js';

// Letter spacing in a real browser. The page spaces the letters with CSS,
// where the desktop builds each gap out of thin space characters, so these
// check the three things the desktop promises, by measuring the text on
// screen: the focus letter stays on its spot, each letter gets the level's
// gap, and between the words of a chunk the room is the larger of the plain
// space and twice the letter gap.
//
// Only the ends of each piece of text are measured, not each letter. WebKit
// gives a letter's box in whole pixels from the start of its element, so a
// letter in the middle can be reported up to a pixel off where it is drawn,
// while Chromium and Firefox give fractions. The ends are where the text
// really starts and stops in all three: measured on 2026-11-23, Chromium
// and WebKit agreed on them to 0.02 px at every level.

const GAPS = { Off: 0, Small: 0.1, Medium: 0.18, Large: 0.3 } as const;
type Level = keyof typeof GAPS;
// At the default 32 px size, 0.01 em is about a third of a pixel.
const CLOSE_EM = 0.01;

async function startPaused(page: Page): Promise<void> {
  await installClock(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByRole('button', { name: 'Blank transcript' }).click();
  await page.getByLabel('Transcript title').fill('Spacing');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill('Reading information carefully helps');
  await startReadingPaused(page);
}

async function chooseLevel(page: Page, level: Level): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await page.getByLabel('Letter spacing').selectOption({ label: level });
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/**
 * Goes to "information", the second word. Alone, its focus letter is "o".
 * In a chunk, the chunk is "Reading information", with "a" as its focus.
 */
async function goToSecondWord(page: Page): Promise<void> {
  await letTheClickSettle(page);
  await page.getByRole('slider', { name: 'Position' }).focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
}

interface Measured {
  readonly before: string;
  readonly after: string;
  // How far the focus letter's middle is from the middle of the row, in px.
  // The box of a spaced letter takes in the gap after it, so this is only
  // read with no spacing.
  readonly offCentrePx: number;
  // Where the focus letter starts, from the middle of the row, in px.
  readonly focusLeftPx: number;
  // The width of the text before the focus letter, in em: from its first
  // letter to the right edge of its last letter, which takes in the gap
  // after that letter.
  readonly beforeEm: number;
  // How far the text after the focus letter reaches, in em: from the left
  // edge of the focus letter to the right edge of the last letter.
  readonly afterEm: number;
}

// Runs in the page, so it is text. A letter's box comes from a Range over
// that one character.
const MEASURE = `(() => {
  const row = document.querySelector('[data-testid=word]');
  const [before, focus, after] = Array.from(row.children);
  const size = Number.parseFloat(getComputedStyle(row).fontSize);
  const letter = (element, index) => {
    const node = element.firstChild;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    return range.getBoundingClientRect();
  };
  const beforeText = before.textContent;
  const afterText = after.textContent;
  const rowBox = row.getBoundingClientRect();
  const focusBox = letter(focus, 0);
  const beforeEnd = letter(before, beforeText.length - 1).right;
  const afterEnd = letter(after, afterText.length - 1).right;
  return {
    before: beforeText,
    after: afterText,
    offCentrePx: focusBox.left + focusBox.width / 2 - (rowBox.left + rowBox.width / 2),
    focusLeftPx: focusBox.left - (rowBox.left + rowBox.width / 2),
    beforeEm: (beforeEnd - letter(before, 0).left) / size,
    afterEm: (afterEnd - focusBox.left) / size,
  };
})()`;

async function measure(page: Page): Promise<Measured> {
  return page.evaluate<Measured>(MEASURE);
}

// The width of the font's space at the word's size, in em, with no spacing.
// The probe goes inside the after text: the row is a grid, and a child of
// its own would be stretched to a column.
const SPACE_EM = `(() => {
  const row = document.querySelector('[data-testid=word]');
  const probe = document.createElement('span');
  probe.style.whiteSpace = 'pre';
  probe.style.letterSpacing = '0';
  probe.style.wordSpacing = '0';
  probe.textContent = ' ';
  row.children[2].appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width / Number.parseFloat(getComputedStyle(row).fontSize);
})()`;

for (const grouped of [false, true]) {
  test(`${grouped ? 'a chunk' : 'one word'}: the focus letter stays put, and the gaps are the level's`, async ({
    page,
  }) => {
    await startPaused(page);
    if (grouped) await page.getByLabel('Group', { exact: true }).check();
    await goToSecondWord(page);
    const off = await measure(page);
    expect(Math.abs(off.offCentrePx)).toBeLessThan(0.5);
    // A chunk has one space after the focus letter, one word has none.
    const spaces = off.after.split(' ').length - 1;
    expect(spaces).toBe(grouped ? 1 : 0);
    const spaceEm = await page.evaluate<number>(SPACE_EM);
    expect(spaceEm).toBeGreaterThan(0.1);

    for (const level of ['Small', 'Medium', 'Large'] as const) {
      await chooseLevel(page, level);
      await goToSecondWord(page);
      const spaced = await measure(page);
      const gap = GAPS[level];
      expect([spaced.before, spaced.after]).toEqual([off.before, off.after]);

      // The focus letter does not move.
      expect(Math.abs(spaced.focusLeftPx - off.focusLeftPx)).toBeLessThan(0.1);

      // Every letter before it gets one gap after it, the last one too,
      // which is the gap in front of the focus letter.
      const beforeGrows = off.before.length * gap;
      expect(Math.abs(spaced.beforeEm - off.beforeEm - beforeGrows)).toBeLessThan(CLOSE_EM);

      // From the focus letter on. The focus letter gets no gap, so it keeps
      // its width. Then one gap in front of the after text, and one after
      // every character, the last one included (it is past the end, out of
      // sight, but it is in the letter's box). Across a space the room
      // would then be the space and two gaps; the desktop has the larger of
      // the space and twice the gap, so each space gives the difference
      // back.
      const perSpace = Math.max(spaceEm, 2 * gap) - spaceEm - 2 * gap;
      const afterGrows = gap + off.after.length * gap + spaces * perSpace;
      expect(Math.abs(spaced.afterEm - off.afterEm - afterGrows)).toBeLessThan(CLOSE_EM);
    }
  });
}

test('the level is kept after a reload', async ({ page }) => {
  await startPaused(page);
  await chooseLevel(page, 'Medium');
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await expect(page.getByLabel('Letter spacing')).toHaveValue('2');
});
