import { expect, test, type Page } from '@playwright/test';

// The reading shortcuts with real key presses. The unit tests cover the
// rule. These show what only a browser can: that a real Space on a focused
// button does one thing, that typing is left alone, and that the browser's
// own keys still work.

const TEXT = Array.from({ length: 300 }, (_, index) => `w${index}`).join(' ');

async function startReading(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByLabel('Transcript title').fill('Keys');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(TEXT);
  await page.getByRole('button', { name: 'Start reading' }).click();
  // Start reading is gone now, so nothing has the keyboard's attention.
  await expect(page.getByTestId('word')).toBeVisible();
}

test('read with the keyboard only: pause, skip, bookmark, restart, stop', async ({ page }) => {
  await startReading(page);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  // R starts again from the first word and reads on.
  await page.keyboard.press('r');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.getByRole('slider', { name: 'Position' }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('word')).toHaveText('w0');
  await page.keyboard.press('Tab');
  // Focus is on the Bookmarks button now. Letters still work from there.
  await page.keyboard.press('b');
  await expect(page.getByTestId('bookmark-tick')).toHaveCount(1);
  await page.keyboard.press('b');
  await expect(page.getByTestId('bookmark-tick')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('word')).toHaveText('w10');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('word')).toHaveText('w0');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Transcript text')).toBeVisible();
});

test('Space on a focused button presses the button and nothing more', async ({ page }) => {
  await startReading(page);
  await page.getByRole('button', { name: 'Pause' }).focus();
  await page.keyboard.press('Space');
  // Once, not twice: twice would be playing again.
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('typing in the text box is left alone', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByLabel('Transcript title').fill('Typed');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').click();
  await page.keyboard.type('r b r b');
  await expect(page.getByLabel('Transcript text')).toHaveValue('r b r b');
});

test('Escape with a dialog open closes the dialog and reading goes on', async ({ page }) => {
  await startReading(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('word')).toBeVisible();
});
