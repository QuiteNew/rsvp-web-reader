import { expect, test, type Page } from '@playwright/test';

import { installClock, startReadingPaused } from './helpers.js';

// Reading profiles in a real browser: saved on the Profiles tab of Settings,
// applied to the reader, and kept over a reload. What a profile holds and
// how applying one works is tested in src/core and src/ui. Here it is the
// whole way round, with letter spacing as the setting, since the reader
// shows it.

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

async function chooseLevel(page: Page, level: string): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await page.getByLabel('Letter spacing').selectOption({ label: level });
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function openProfiles(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Profiles' }).click();
}

async function saveProfile(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Save current settings as…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save Profile' });
  await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
}

// The gap the reader puts between the letters of the word, as the page
// hands it to the style sheet.
async function letterGap(page: Page): Promise<string> {
  return page
    .getByTestId('word')
    .evaluate((word) => word.parentElement?.style.getPropertyValue('--letter-gap') ?? '');
}

const savedProfile = (page: Page, name: string) =>
  page.getByRole('list', { name: 'Saved profiles' }).getByRole('button', { name });

test('a profile brings its letter spacing back to the reader, and Settings closes', async ({
  page,
}) => {
  await startPaused(page);
  await chooseLevel(page, 'Medium');
  await openProfiles(page);
  await saveProfile(page, 'Spaced');
  await expect(savedProfile(page, 'Spaced')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await chooseLevel(page, 'Off');
  expect(await letterGap(page)).toBe('0em');

  await openProfiles(page);
  await savedProfile(page, 'Spaced').click();
  await page
    .getByRole('tabpanel', { name: 'Profiles' })
    .getByRole('button', { name: 'Apply' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await letterGap(page)).toBe('0.18em');
});

test('Escape closes the name dialog first, and then Settings', async ({ page }) => {
  await page.goto('./');
  await openProfiles(page);
  await page.getByRole('button', { name: 'Save current settings as…' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Save Profile' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('profiles are kept after a reload', async ({ page }) => {
  await page.goto('./');
  await openProfiles(page);
  await saveProfile(page, 'Mine');
  await page.reload();
  await openProfiles(page);
  await expect(savedProfile(page, 'Mine')).toHaveAttribute('aria-pressed', 'false');
});
