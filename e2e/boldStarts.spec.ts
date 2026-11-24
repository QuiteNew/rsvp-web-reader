import { expect, test, type Page } from '@playwright/test';

// Bold word starts in a real browser: the bold is drawn in a bold face, the
// text keeps the text box's font, size and lines, and the look is saved.

async function openNotes(page: Page, text: string): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByRole('button', { name: 'Blank transcript' }).click();
  await page.getByLabel('Transcript title').fill('Notes');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(text);
}

// Runs in the page, so it is text. How an element is drawn.
function looksOf(selector: string): string {
  return `(() => {
    const style = getComputedStyle(document.querySelector(${JSON.stringify(selector)}));
    return {
      family: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
      lineHeight: style.lineHeight,
      padding: style.padding,
    };
  })()`;
}

const BOLD_PIECES = `Array.from(
  document.querySelectorAll('[aria-label="Transcript text"] b'),
  (piece) => piece.textContent,
)`;

test('the start of every word is drawn bold, in the text box font and size', async ({ page }) => {
  await openNotes(page, 'The well-known reader\nsecond line');
  const box = await page.evaluate<Record<string, string>>(looksOf('textarea'));
  await page.getByRole('button', { name: 'Bold word starts' }).click();
  const view = page.getByRole('textbox', { name: 'Transcript text' });
  await expect(view).toHaveAttribute('aria-readonly', 'true');
  expect(await page.evaluate<string[]>(BOLD_PIECES)).toEqual([
    'Th',
    'we',
    'kno',
    'rea',
    'sec',
    'li',
  ]);
  // The view is in the text box's place and looks like it, apart from the bold.
  const shown = await page.evaluate<Record<string, string>>(
    looksOf('[aria-label="Transcript text"]'),
  );
  expect(shown).toEqual(box);
  const bold = await page.evaluate<Record<string, string>>(
    looksOf('[aria-label="Transcript text"] b'),
  );
  expect(bold.weight).toBe('700');
  // The line break is kept as a line.
  await expect(view).toHaveText('The well-known reader\nsecond line', { useInnerText: true });
});

test('an emoji does not move the bold', async ({ page }) => {
  await openNotes(page, 'hello \u{1F600} world');
  await page.getByRole('button', { name: 'Bold word starts' }).click();
  expect(await page.evaluate<string[]>(BOLD_PIECES)).toEqual(['hel', 'wor']);
});

test('with OpenDyslexic on, the bold uses its bold file', async ({ page }) => {
  await openNotes(page, 'Reading information carefully');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Appearance' }).click();
  await page.getByLabel('Use the OpenDyslexic font').check();
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('button', { name: 'Bold word starts' }).click();
  const bold = await page.evaluate<Record<string, string>>(
    looksOf('[aria-label="Transcript text"] b'),
  );
  expect(bold.family.split(',')[0]?.replaceAll('"', '')).toBe('OpenDyslexic');
  expect(bold.weight).toBe('700');
  await expect
    .poll(() => page.evaluate('document.fonts.check("700 16px OpenDyslexic")'))
    .toBe(true);
});

test('the look is kept after a reload, and off gives the text box back', async ({ page }) => {
  await openNotes(page, 'hello world');
  await page.getByRole('button', { name: 'Bold word starts' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bold word starts' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate<string[]>(BOLD_PIECES)).toEqual(['hel', 'wor']);
  await page.getByRole('button', { name: 'Bold word starts' }).click();
  await expect(page.getByLabel('Transcript text')).toHaveValue('hello world');
});
