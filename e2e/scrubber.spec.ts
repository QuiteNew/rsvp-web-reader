import { expect, test, type Page } from '@playwright/test';

// The position slider, in a real browser, with the keyboard only: the
// thing the unit tests cannot show is that real arrow keys move it, and
// that reading stays where it was put.

const TEXT = Array.from({ length: 300 }, (_, index) => `w${index}`).join(' ');

async function startReading(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByLabel('Transcript title').fill('Scrub');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(TEXT);
  await page.getByRole('button', { name: 'Start reading' }).click();
}

test('arrow keys move the slider a word at a time and reading stays put', async ({ page }) => {
  await startReading(page);
  // Paused first, so a slow browser cannot be several words on before the
  // keys arrive. The playing case has its own test below.
  await page.getByRole('button', { name: 'Pause' }).click();
  const slider = page.getByRole('slider', { name: 'Position' });
  await slider.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('word')).toHaveText('w3');
  await expect(slider).toHaveValue('3');
  await expect(page.getByText('word 4 of 300')).toBeVisible();
  // Held back after the keys: a second later it is still on the same word.
  await page.waitForTimeout(700);
  await expect(page.getByTestId('word')).toHaveText('w3');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('End goes to the last word', async ({ page }) => {
  await startReading(page);
  const slider = page.getByRole('slider', { name: 'Position' });
  await slider.focus();
  await page.keyboard.press('End');
  await expect(page.getByTestId('word')).toHaveText('w299');
  await expect(page.getByText('word 300 of 300')).toBeVisible();
});

test('Home, pressed while reading is going, goes to the first word and holds', async ({ page }) => {
  await startReading(page);
  const slider = page.getByRole('slider', { name: 'Position' });
  // Home does nothing on the first word, so wait until reading has left it.
  await expect(page.getByTestId('word')).not.toHaveText('w0');
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
  await expect(page.getByTestId('word')).toHaveText('w0');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByTestId('word')).toHaveText('w0');
});
