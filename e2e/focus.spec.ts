import { expect, test } from '@playwright/test';

// After a click in the footer, Space still pauses and plays, as on the
// desktop, without a click in the reader first.

test('Space works straight after a click on the footer', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByLabel('Transcript title').fill('Keys');
  await page.getByLabel('Transcript title').press('Enter');
  await page
    .getByLabel('Transcript text')
    .fill(Array.from({ length: 300 }, (_, index) => `w${index}`).join(' '));
  await page.getByRole('button', { name: 'Start reading' }).click();

  await page.getByRole('button', { name: 'More words per group' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

  await page.getByRole('switch', { name: 'Group' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

  await page.getByRole('slider', { name: 'Speed' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});
