import { expect, test, type Page } from '@playwright/test';

import { installClock, startReadingPaused } from './helpers.js';

// A flash still too wide at the smallest fitted size: the scrollbar appears,
// slides the flash to show what is cut off, and the centre button and the C
// key bring it back. A flash that fits has no scrollbar.

// Words of 13 letters, so two of them make a group (a fixed group stops
// before it passes 30 characters), read at the largest word size.
const LONG = Array.from({ length: 30 }, (_, index) => `abcdefghijk${index + 10}`).join(' ');

async function startPaused(page: Page, text: string): Promise<void> {
  await page.setViewportSize({ width: 900, height: 700 });
  // New transcripts start at the largest word size.
  await page.addInitScript(() => {
    localStorage.setItem('rsvp-web-reader.settings', JSON.stringify({ default_font_size: 96 }));
  });
  await installClock(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByRole('button', { name: 'Blank transcript' }).click();
  await page.getByLabel('Transcript title').fill('Wide');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(text);
  await startReadingPaused(page);
}

// How far the end of the flash is past the right side of the reading row, in
// px. The script is text because it runs in the page.
async function spillRight(page: Page): Promise<number> {
  return page.evaluate<number>(`(() => {
    const row = document.querySelector('[data-testid=word]');
    const after = row.children[2].getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(row.children[2]);
    const text = range.getBoundingClientRect();
    return text.right - row.parentElement.getBoundingClientRect().right;
  })()`);
}

const scrollbar = (page: Page) => page.getByRole('scrollbar', { name: 'Slide the flash sideways' });

test('a flash that fits has no scrollbar', async ({ page }) => {
  await startPaused(page, 'one two three four five six');
  await expect(page.getByTestId('word')).toBeVisible();
  await expect(scrollbar(page)).toHaveCount(0);
});

test('a group too wide even when fitted can be slid into view and centred again', async ({
  page,
}) => {
  await startPaused(page, LONG);
  await expect(scrollbar(page)).toHaveCount(0);
  await page.getByRole('switch', { name: 'Group' }).check();
  await expect(scrollbar(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Centre the flash' })).toBeVisible();
  expect(await spillRight(page)).toBeGreaterThan(20);

  // The end of the flash comes into view.
  await scrollbar(page).focus();
  await page.keyboard.press('End');
  await expect.poll(() => spillRight(page)).toBeLessThanOrEqual(1);

  // C puts it back in the middle. It works while the scrollbar has the
  // keyboard. (A Tab away first would not do: Safari's Tab skips buttons
  // and sliders, and lands in the search box, where c is typed.)
  await page.keyboard.press('c');
  await expect.poll(() => spillRight(page)).toBeGreaterThan(20);

  // So does the centre button.
  await scrollbar(page).focus();
  await page.keyboard.press('End');
  await expect.poll(() => spillRight(page)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Centre the flash' }).click();
  await expect.poll(() => spillRight(page)).toBeGreaterThan(20);

  // Back to one word at a time: everything fits and the scrollbar goes.
  await page.getByRole('switch', { name: 'Group' }).uncheck();
  await expect(scrollbar(page)).toHaveCount(0);
});

test('dragging the thumb slides the flash', async ({ page }) => {
  await startPaused(page, LONG);
  await page.getByRole('switch', { name: 'Group' }).check();
  const thumb = await page.getByTestId('scroll-thumb').boundingBox();
  const track = await scrollbar(page).boundingBox();
  if (!thumb || !track) throw new Error('no scrollbar on the page');
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width + 50, thumb.y + thumb.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => spillRight(page)).toBeLessThanOrEqual(1);
});
