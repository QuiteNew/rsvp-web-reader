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

// A button of the Profiles tab. Only there, since the page has other
// buttons whose names start the same, such as "Delete Spacing".
const tabButton = (page: Page, name: string) =>
  page.getByRole('tabpanel', { name: 'Profiles' }).getByRole('button', { name, exact: true });

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

test('update, rename and delete, the whole way round', async ({ page }) => {
  await startPaused(page);
  await chooseLevel(page, 'Small');
  await openProfiles(page);
  await saveProfile(page, 'Spaced');
  await page.keyboard.press('Escape');

  // Update it to Large, then put the reader back to Off.
  await chooseLevel(page, 'Large');
  await openProfiles(page);
  await savedProfile(page, 'Spaced').click();
  await tabButton(page, 'Update').click();
  const update = page.getByRole('dialog', { name: 'Update Profile' });
  await update.getByRole('button', { name: 'Update' }).click();
  await expect(update).toHaveCount(0);

  await tabButton(page, 'Rename').click();
  const rename = page.getByRole('dialog', { name: 'Rename Profile' });
  // The name is selected, so typing replaces it.
  await page.keyboard.type('Wide');
  await rename.getByRole('button', { name: 'Rename' }).click();
  await expect(rename).toHaveCount(0);
  await expect(savedProfile(page, 'Wide')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');

  await chooseLevel(page, 'Off');
  await openProfiles(page);
  await savedProfile(page, 'Wide').click();
  await page
    .getByRole('tabpanel', { name: 'Profiles' })
    .getByRole('button', { name: 'Apply' })
    .click();
  expect(await letterGap(page)).toBe('0.3em');

  await openProfiles(page);
  await savedProfile(page, 'Wide').click();
  await tabButton(page, 'Delete').click();
  await page
    .getByRole('dialog', { name: 'Delete Profile' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.getByText(/No profiles yet/)).toBeVisible();
});

test('Enter in the Delete dialog does not delete', async ({ page }) => {
  await page.goto('./');
  await openProfiles(page);
  await saveProfile(page, 'Mine');
  await tabButton(page, 'Delete').click();
  await expect(page.getByRole('dialog', { name: 'Delete Profile' })).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Delete Profile' })).toHaveCount(0);
  await expect(savedProfile(page, 'Mine')).toHaveCount(1);
});
