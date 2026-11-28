import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Adding a transcript from a file, in a real browser. The unit tests prove
// the importers against the desktop app's own answers. These prove the
// parts only a browser has: its file picker, DOMParser, DecompressionStream
// for Word, the text decoders, and pdf.js reading in its own worker.
//
// Each import goes the way a person goes: +, Add from file..., the file
// picker, then Create. The expected text comes from the desktop app, as
// recorded in fixtures/core/importers.json, wherever the web app reads the
// same.

const FILES = 'fixtures/files';

interface Fixture {
  readonly functions: Record<string, [unknown[], Record<string, unknown>][]>;
}
const fixture = JSON.parse(readFileSync('fixtures/core/importers.json', 'utf8')) as Fixture;

/** What the desktop's import_file() gave for a file in fixtures/files. */
function desktopAnswer(name: string): Record<string, unknown> {
  for (const kind of ['import_docx_files', 'import_pdf_files']) {
    const found = fixture.functions[kind]?.find(([[file]]) => file === name);
    if (found !== undefined) return found[1];
  }
  throw new Error(`no desktop answer for ${name}`);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Picks a file through +, Add from file... and the browser's file picker. */
async function pick(page: Page, file: string | { name: string; buffer: Buffer }): Promise<void> {
  await page.getByRole('button', { name: 'Add transcript' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add from file…' }).click();
  const files =
    typeof file === 'string'
      ? `${FILES}/${file}`
      : { name: file.name, mimeType: 'application/octet-stream', buffer: file.buffer };
  await (await chooser).setFiles(files);
}

/** Picks a file, adds it with the title offered, and gives back its text. */
async function add(page: Page, file: Parameters<typeof pick>[1]): Promise<string> {
  await pick(page, file);
  const dialog = page.getByRole('dialog', { name: 'Add Transcript from File' });
  // A long PDF takes a while in a slow browser.
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await dialog.getByRole('button', { name: 'Create' }).click();
  const text = page.getByLabel('Transcript text');
  await expect(text).not.toHaveValue('');
  return text.inputValue();
}

/** Picks a file that cannot be added, and gives back the message shown. */
async function refused(page: Page, file: Parameters<typeof pick>[1]): Promise<string> {
  await pick(page, file);
  const dialog = page.getByRole('dialog', { name: "Couldn't add that file" });
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  const message = (await dialog.locator('p').innerText()).trim();
  await dialog.getByRole('button', { name: 'OK' }).click();
  return message;
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('the title offered is the file name, and the transcript opens as text', async ({ page }) => {
  await pick(page, { name: 'Monday lecture.txt', buffer: Buffer.from('Some words to read.') });
  const dialog = page.getByRole('dialog', { name: 'Add Transcript from File' });
  await expect(dialog.getByLabel('Transcript title')).toHaveValue('Monday lecture');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('button', { name: 'Monday lecture', exact: true })).toBeVisible();
  await expect(page.getByLabel('Transcript text')).toHaveValue('Some words to read.');
  await expect(page.getByRole('button', { name: 'Start reading' })).toBeVisible();
});

test('text, subtitles and Markdown, with an old Windows text file', async ({ page }) => {
  expect(
    await add(page, {
      name: 'a.srt',
      buffer: Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n<i>Hello</i> there.\n'),
    }),
  ).toBe('Hello there.');
  expect(
    await add(page, {
      name: 'b.vtt',
      buffer: Buffer.from('WEBVTT\n\nNOTE x\n\n00:01.000 --> 00:02.000\n<v Ann>Hi all.\n'),
    }),
  ).toBe('Hi all.');
  expect(
    await add(page, { name: 'c.md', buffer: Buffer.from('# Title\n\n- **one** [link](x)') }),
  ).toBe('Title\n\none link');
  // Windows-1252 bytes: curly quotes and a dash, which are not UTF-8.
  expect(
    await add(page, {
      name: 'd.txt',
      buffer: Buffer.from([0x93, 0x51, 0x94, 0x20, 0x96, 0x20, 0x45]),
    }),
  ).toBe('“Q” – E');
});

test('a web page, with and without a named encoding', async ({ page }) => {
  const page1 = Buffer.from(
    '<meta charset="windows-1252"><p>Caf\xe9 \x93q\x94</p><script>x</script><p>Two<br>lines</p>',
    'latin1',
  );
  expect(await add(page, { name: 'one.html', buffer: page1 })).toBe('Café “q”\nTwo\nlines');
  // No encoding named: read as UTF-8, where the desktop reads Latin-1.
  const page2 = Buffer.from('<p>Café “q”</p>', 'utf8');
  expect(await add(page, { name: 'two.htm', buffer: page2 })).toBe('Café “q”');
});

test('a web page keeps the text right after a dropped script or style', async ({ page }) => {
  // The desktop loses that text with the script. The web keeps it, the
  // owner's choice, and the browser's own parser has to agree.
  const loose = Buffer.from(
    '<body><script>x</script>Loose text<p>a<style>s</style> and <b>b</b></p></body>',
    'utf8',
  );
  expect(await add(page, { name: 'loose.html', buffer: loose })).toBe('Loose text\na and b');
});

test('Word: the desktop text, with the table, the text box and the footnote', async ({ page }) => {
  const text = await add(page, 'rich.docx');
  const desktop = (desktopAnswer('rich.docx').text as string).split('\n');
  const lines = text.split('\n');
  // All of the desktop's lines, in the same order, and the three things it drops.
  expect(lines.filter((line) => desktop.includes(line))).toEqual(desktop);
  for (const more of [
    'TABLE CELL Ada',
    'TEXT BOX Read this aside.',
    'FOOTNOTE TEXT The boxes held books.',
  ]) {
    expect(lines).toContain(more);
  }
  expect(lines.length).toBe(desktop.length + 6);
});

test('PDF: the same text as the desktop, the locked ones included', async ({ page }) => {
  for (const name of [
    'rich.pdf',
    'locked-rc4-128.pdf',
    'locked-aes-128.pdf',
    'locked-aes-256.pdf',
  ]) {
    expect(await add(page, name)).toBe(desktopAnswer(name).text);
  }
});

test('PDF: a password and a scan are refused with the desktop messages', async ({ page }) => {
  expect(await refused(page, 'password-aes-256.pdf')).toBe(
    desktopAnswer('password-aes-256.pdf').error,
  );
  expect(await refused(page, 'scanned.pdf')).toBe(desktopAnswer('scanned.pdf').error);
});

test('a file of another type is refused', async ({ page }) => {
  expect(await refused(page, { name: 'photo.jpg', buffer: Buffer.from([0xff, 0xd8]) })).toBe(
    'Unsupported file type: .jpg',
  );
});

test('a long Word file and a long PDF: a heads-up, then the desktop text', async ({ page }) => {
  test.setTimeout(150_000);
  for (const name of ['long.docx', 'long.pdf']) {
    await pick(page, name);
    const dialog = page.getByRole('dialog', { name: 'Add Transcript from File' });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog).toContainText(/Heads up: this file is about [\d,]+ words long/);
    await dialog.getByRole('button', { name: 'Create' }).click();
    const box = page.getByLabel('Transcript text');
    await expect(box).not.toHaveValue('');
    const desktop = desktopAnswer(name) as { sha256: string; characters: number };
    const text = await box.inputValue();
    expect(Array.from(text).length).toBe(desktop.characters);
    expect(sha256(text)).toBe(desktop.sha256);
  }
});

test('pdf.js is fetched only when a PDF is picked, and nothing from elsewhere', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? '').origin;
  const asked: string[] = [];
  page.on('request', (request) => asked.push(request.url()));
  const pdfJs = () => asked.filter((url) => /\/assets\/pdf[.-]/.test(url));

  await page.reload();
  await expect(page.getByRole('button', { name: 'Add transcript' })).toBeVisible();
  expect(pdfJs()).toEqual([]);

  await add(page, { name: 'notes.txt', buffer: Buffer.from('Plain words.') });
  expect(pdfJs()).toEqual([]);

  await add(page, 'rich.pdf');
  // The library and its worker.
  expect(pdfJs().length).toBeGreaterThanOrEqual(2);

  expect(asked.filter((url) => !url.startsWith(origin) && !url.startsWith('data:'))).toEqual([]);
});
