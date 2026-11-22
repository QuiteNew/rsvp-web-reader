import { expect, test, type Page } from '@playwright/test';

// The guide marks, in a real browser: where they are drawn, which the unit
// tests cannot tell. They have to sit above and below the focus letter, in
// its middle, and go when reading is paused.

const TEXT = Array.from({ length: 300 }, (_, index) => `word${index}`).join(' ');

async function startReading(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByRole('button', { name: 'Blank transcript' }).click();
  await page.getByLabel('Transcript title').fill('Marks');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(TEXT);
  await page.getByRole('button', { name: 'Start reading' }).click();
}

test('the marks sit above and below the focus letter, in its middle', async ({ page }) => {
  await startReading(page);
  const marks = page.getByTestId('guide-marks');
  await expect(marks).toBeVisible();
  const letter = page.getByTestId('word').locator('span').nth(1);
  const above = marks.locator('span').nth(0);
  const below = marks.locator('span').nth(1);
  const [l, a, b] = await Promise.all([
    letter.boundingBox(),
    above.boundingBox(),
    below.boundingBox(),
  ]);
  if (!l || !a || !b) throw new Error('something is not on the page');
  expect(a.y + a.height).toBeLessThan(l.y);
  expect(b.y).toBeGreaterThan(l.y + l.height);
  expect(Math.abs(a.x + a.width / 2 - (l.x + l.width / 2))).toBeLessThan(1.5);
  expect(Math.abs(b.x + b.width / 2 - (l.x + l.width / 2))).toBeLessThan(1.5);
});

test('the marks go when reading is paused', async ({ page }) => {
  await startReading(page);
  await expect(page.getByTestId('guide-marks')).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByTestId('guide-marks')).toHaveCount(0);
});

test('the horizontal lines are wide, and cross the ends of the marks', async ({ page }) => {
  await startReading(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Show horizontal guide lines').check();
  await page.getByRole('button', { name: 'Apply' }).click();
  const marks = page.getByTestId('guide-marks').locator('span');
  await expect(marks).toHaveCount(4);
  const [above, tick] = await Promise.all([marks.nth(0).boundingBox(), marks.nth(2).boundingBox()]);
  if (!above || !tick) throw new Error('something is not on the page');
  expect(tick.width).toBeGreaterThan(100);
  // The tick is centred on the top end of the upper mark.
  expect(Math.abs(tick.y + tick.height / 2 - above.y)).toBeLessThan(1.5);
});

test('the surrounding words sit under the marks, with the middle word under the letter', async ({
  page,
}) => {
  await startReading(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Show surrounding words').check();
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  const line = page.getByTestId('context');
  await expect(line).toBeVisible();
  const parts = line.locator('span');
  const middle = await parts.nth(1).boundingBox();
  const left = await parts.nth(0).boundingBox();
  const right = await parts.nth(2).boundingBox();
  const letter = await page.getByTestId('word').locator('span').nth(1).boundingBox();
  if (!middle || !letter || !left || !right) throw new Error('something is not on the page');
  // Below the word, and centred under its focus letter.
  expect(middle.y).toBeGreaterThan(letter.y + letter.height);
  expect(Math.abs(middle.x + middle.width / 2 - (letter.x + letter.width / 2))).toBeLessThan(1.5);
  // The other words run away from it, on either side.
  // (With a tolerance: Firefox rounds positions at the fifth decimal.)
  expect(left.x + left.width).toBeLessThanOrEqual(middle.x + 0.5);
  expect(right.x).toBeGreaterThanOrEqual(middle.x + middle.width - 0.5);
});
