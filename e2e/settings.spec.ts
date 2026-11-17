import { expect, test } from '@playwright/test';

// The Settings window in a real browser: a wrong number keeps it open and
// puts the cursor in the box, and Apply saves for the next visit.

test('a wrong number is named and the cursor goes to it, a right one is kept', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings' }).click();
  const box = page.getByRole('textbox', { name: /Thickness of the vertical guide marks/ });
  await box.fill('12');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'The guide mark thickness must be between 2 and 6.',
  );
  await expect(box).toBeFocused();
  // The text is selected, so typing replaces it.
  await page.keyboard.type('5');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(
    page.getByRole('textbox', { name: /Thickness of the vertical guide marks/ }),
  ).toHaveValue('5');
});

test('the search narrows the list as you type', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('crosshair grey');
  await expect(page.getByTestId(/^setting-/)).toHaveCount(1);
  await expect(page.getByLabel('Show horizontal guide lines')).toBeVisible();
});
