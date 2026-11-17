import { expect, test, type Page } from '@playwright/test';

// Fitting a wide flash, in a real browser, where text has a real width.
// The words are 13 letters long and read two at a time, which is wider than
// the reading row at the default size in a window 800 px wide.

const LONG = Array.from({ length: 40 }, (_, index) => `abcdefghijk${index + 10}`).join(' ');
const SHORT = Array.from({ length: 40 }, (_, index) => `w${index}`).join(' ');

async function startPaused(page: Page, text: string): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByLabel('Transcript title').fill('Wide');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(text);
  await page.getByRole('button', { name: 'Start reading' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
}

// These two run in the page, so they are text.
async function drawnSize(page: Page): Promise<number> {
  return page.evaluate<number>(
    `Number.parseFloat(getComputedStyle(document.querySelector('[data-testid=word]')).fontSize)`,
  );
}

// How many px of the flash are cut off, on the wider side.
async function cutOff(page: Page): Promise<number> {
  return page.evaluate<number>(`(() => {
    const row = document.querySelector('[data-testid=word]');
    const sides = [row.children[0], row.children[2]];
    return Math.max(...sides.map((side) => side.scrollWidth - side.clientWidth));
  })()`);
}

test('short words are drawn at the chosen size', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await startPaused(page, SHORT);
  expect(await drawnSize(page)).toBe(32);
});

test('a group too wide for the row is drawn smaller, and then fits', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await startPaused(page, LONG);
  expect(await drawnSize(page)).toBe(32);
  await page.getByLabel('Group', { exact: true }).check();
  await expect.poll(() => drawnSize(page)).toBeLessThan(32);
  expect(await drawnSize(page)).toBeGreaterThanOrEqual(19);
  expect(await cutOff(page)).toBeLessThanOrEqual(1);
  // The saved size is not touched.
  await expect(page.getByLabel('Word size')).toHaveText('32px');
});

test('a narrower window is fitted again, a wider one gets the size back', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 700 });
  await startPaused(page, LONG);
  await page.getByLabel('Group', { exact: true }).check();
  const wide = await drawnSize(page);
  await page.setViewportSize({ width: 800, height: 700 });
  await expect.poll(() => drawnSize(page)).toBeLessThan(wide);
  await page.setViewportSize({ width: 1400, height: 700 });
  await expect.poll(() => drawnSize(page)).toBe(wide);
});
