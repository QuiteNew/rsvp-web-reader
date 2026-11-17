import { expect, test, type Page } from '@playwright/test';

// Bookmarks in a real browser. The first test uses the keyboard only once
// reading is paused, because the phase is done when bookmarks work that way.
// The second checks what unit tests cannot: that a tick sits where the
// browser puts the slider's thumb for that word.

const TEXT = Array.from({ length: 21 }, (_, index) => `w${index}`).join(' ');

async function startPaused(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByLabel('Transcript title').fill('Marked');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(TEXT);
  await page.getByRole('button', { name: 'Start reading' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
}

async function goToWord(page: Page, index: number): Promise<void> {
  await page.getByRole('slider', { name: 'Position' }).focus();
  await page.keyboard.press('Home');
  for (let step = 0; step < index; step += 1) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('word')).toHaveText(`w${index}`);
}

test('add a bookmark, go away, and come back to it, with the keyboard only', async ({ page }) => {
  await startPaused(page);
  await goToWord(page, 5);

  // The Bookmarks button is the next stop after the slider.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Bookmarks' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Add bookmark here' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove bookmark here' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('bookmark-tick')).toHaveCount(1);

  await goToWord(page, 12);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Add bookmark here' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^Go to .*word 6 of 21$/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('word')).toHaveText('w5');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('a bookmark is still there after a reload', async ({ page }) => {
  await startPaused(page);
  await goToWord(page, 5);
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page.getByRole('button', { name: 'Add bookmark here' }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('bookmark-tick')).toHaveCount(1);
});

test('a tick sits where the thumb rests for that word', async ({ page }) => {
  await startPaused(page);
  // Near the start, where a tick that ignored the thumb's width would be
  // most of a word off.
  await goToWord(page, 1);
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page.getByRole('button', { name: 'Add bookmark here' }).click();
  await page.keyboard.press('Escape');
  await goToWord(page, 20);

  // A click on the slider straight above the tick has to land on its word.
  const tick = await page.getByTestId('bookmark-tick').boundingBox();
  const slider = await page.getByRole('slider', { name: 'Position' }).boundingBox();
  if (!tick || !slider) throw new Error('something is not on the page');
  await page.mouse.click(tick.x + tick.width / 2, slider.y + slider.height / 2);
  await expect(page.getByTestId('word')).toHaveText('w1');
});
