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

// What the app puts on the clipboard for a copy in the bold view. A copy
// event is sent with a clipboard of its own, so every browser can be asked,
// not only those that let a test read the real clipboard.
const COPY = `(() => {
  const clipboard = new DataTransfer();
  const event = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboard });
  document.activeElement.dispatchEvent(event);
  return {
    handled: event.defaultPrevented,
    plain: clipboard.getData('text/plain'),
    html: clipboard.getData('text/html'),
  };
})()`;

test('Ctrl+A selects the text, and a copy carries the bold', async ({ page }) => {
  await openNotes(page, 'hello world\nnext line');
  await page.getByRole('button', { name: 'Bold word starts' }).click();
  const view = page.getByRole('textbox', { name: 'Transcript text' });
  await view.focus();
  await page.keyboard.press('ControlOrMeta+a');
  // Only the text of the view, not the whole page. Firefox on Windows gives
  // the selected text with Windows line breaks (\r\n), and the other browsers
  // with \n, so the line breaks are made the same before comparing. What
  // lands on the clipboard is checked below, without this.
  const selected = await page.evaluate<string>('document.getSelection().toString()');
  expect(selected.replaceAll('\r\n', '\n')).toBe('hello world\nnext line');
  const copied = await page.evaluate<{ handled: boolean; plain: string; html: string }>(COPY);
  expect(copied).toEqual({
    handled: true,
    plain: 'hello world\nnext line',
    html:
      '<p style="margin:0"><b>hel</b>lo <b>wor</b>ld</p>' +
      '<p style="margin:0"><b>ne</b>xt <b>li</b>ne</p>',
  });
});

test('a real Ctrl+C puts the bold on the clipboard', async ({ page, context, browserName }) => {
  // Only Chromium lets a test read the clipboard back.
  test.skip(browserName !== 'chromium', 'reading the clipboard is Chromium only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openNotes(page, 'hello world');
  await page.getByRole('button', { name: 'Bold word starts' }).click();
  await page.getByRole('textbox', { name: 'Transcript text' }).focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+c');
  const found = await page.evaluate<{ plain: string; html: string }>(`(async () => {
    const [item] = await navigator.clipboard.read();
    return {
      plain: await (await item.getType('text/plain')).text(),
      html: await (await item.getType('text/html')).text(),
    };
  })()`);
  expect(found.plain).toBe('hello world');
  expect(found.html).toContain('<b>hel</b>lo <b>wor</b>ld');
});
