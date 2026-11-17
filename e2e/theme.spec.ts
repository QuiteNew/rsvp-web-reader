import { expect, test, type Page } from '@playwright/test';

// The theme, in a real browser: it must be there when the page is drawn and
// after a reload, and System must follow the browser. Every test starts with
// a browser that has nothing saved.

async function pickAppearance(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await page.getByLabel('Colour theme').selectOption({ label });
  await page.getByRole('button', { name: 'Apply' }).click();
}

test('the page starts light', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('Dark is kept after a reload', async ({ page }) => {
  await page.goto('./');
  await pickAppearance(page, 'Dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(29, 23, 18)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(29, 23, 18)');
});

test('System follows the browser, also while the page is open', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  await pickAppearance(page, 'System');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('a transcript read in Dark shows the dark reading colours', async ({ page }) => {
  await page.goto('./');
  await pickAppearance(page, 'Dark');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByLabel('Transcript title').fill('Night');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill('one two three');
  await page.getByRole('button', { name: 'Start reading' }).click();
  await expect(page.getByTestId('word').locator('xpath=../..')).toHaveCSS(
    'background-color',
    'rgb(36, 29, 23)',
  );
});
