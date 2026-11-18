import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fixture } from '../testing/importerFixtures';
import { importDocx } from './importDocx';
import { ImportFailure } from './importFailure';
import { importFile } from './importFile';

type Answer = { text: string } | { error: string };

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/** The web app's raw text for a Word file, or the message it fails with. */
async function webAnswer(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<Answer> {
  try {
    return { text: await importDocx(bytes, name) };
  } catch (error) {
    if (error instanceof ImportFailure) return { error: error.message };
    throw error;
  }
}

// The desktop says why a file could not be opened in python-docx's words,
// which the web app cannot copy. Only the first line has to match.
function firstLine(answer: Answer): Answer {
  return 'error' in answer ? { error: answer.error.split('\n')[0] ?? '' } : answer;
}

// What the web app reads that the desktop drops, chosen by the owner: the
// fixture's case name, and the web app's text.
const MORE_THAN_THE_DESKTOP = new Map<string, string>([
  ['table', 'Before the table.\nTABLE cell one\nTABLE cell two\nAfter the table.'],
  ['text box', 'Anchor paragraph.\nTEXT BOX inside.\nNext paragraph.'],
  ['content control', 'CONTROL paragraph.\nBody paragraph.'],
  ['footnotes', 'Body with a note.\nMore body.\nFOOTNOTE one.\nFOOTNOTE two,\nsecond paragraph.'],
]);

const cases = fixture.functions['import_docx'] as unknown as [[string, string], Answer][];

describe('against import_docx() on the desktop', () => {
  test.each(cases.map(([[name, base64], answer]) => [name, base64, answer] as const))(
    '%s',
    async (name, base64, desktop) => {
      const web = await webAnswer(fromBase64(base64), `${name}.docx`);
      const more = MORE_THAN_THE_DESKTOP.get(name);
      if (more === undefined) {
        expect(firstLine(web)).toEqual(firstLine(desktop));
      } else {
        // The desktop's text is still all there, in the same order.
        expect('text' in desktop).toBe(true);
        expect(web).toEqual({ text: more });
      }
    },
  );

  test('every listed difference is a case in the fixture', () => {
    const names = new Set(cases.map(([[name]]) => name));
    for (const name of MORE_THAN_THE_DESKTOP.keys()) expect(names.has(name)).toBe(true);
  });

  test('the reasons the web app gives, in plain words', async () => {
    const reason = async (bytes: Uint8Array<ArrayBuffer>) =>
      (await webAnswer(bytes, 'x.docx')) as { error: string };
    expect((await reason(new Uint8Array([1, 2, 3]))).error).toBe(
      "Couldn't open x.docx as a Word document:\n\nIt is not a Word document (.docx), or it is damaged.",
    );
    const oldWord = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect((await reason(oldWord)).error).toMatch(/password-protected, or it is an older Word/);
  });
});

// The Word files in fixtures/files, made with LibreOffice from invented
// text: rich.docx has a heading, a table, a text box, a list, a footnote,
// a header and a footer. long.docx is about 150,000 words.
function fixtureFile(name: string): File {
  // Read from the repository's root, where the tests run.
  const bytes = readFileSync(`fixtures/files/${name}`);
  return new File([new Uint8Array(bytes)], name);
}

const files = new Map(
  (fixture.functions['import_docx_files'] as unknown as [[string], Record<string, unknown>][]).map(
    ([[name], answer]) => [name, answer],
  ),
);

describe('the Word files in fixtures/files, against import_file() on the desktop', () => {
  test('rich.docx: the desktop text, with the table, the text box and the footnote', async () => {
    const desktop = (files.get('rich.docx') as { text: string }).text.split('\n');
    const quote = desktop.findIndex((line) => line.startsWith('“Read it once'));
    const flash = desktop.findIndex((line) => line.startsWith('A flash of one word'));
    expect(quote).toBeGreaterThan(0);
    expect(flash).toBe(quote + 1);
    const expected = [
      ...desktop.slice(0, quote + 1),
      'TABLE CELL Name',
      'TABLE CELL Words per minute',
      'TABLE CELL Ada',
      'TABLE CELL 350',
      desktop[flash],
      'TEXT BOX Read this aside.',
      ...desktop.slice(flash + 1),
      'FOOTNOTE TEXT The boxes held books.',
    ].join('\n');
    expect(await importFile(fixtureFile('rich.docx'))).toEqual({
      kind: 'text',
      title: 'rich',
      text: expected,
    });
  });

  test('rich.docx: no header or footer text', async () => {
    const result = await importFile(fixtureFile('rich.docx'));
    expect(result.kind === 'text' && /HEADER|FOOTER/.test(result.text)).toBe(false);
  });

  test('long.docx: exactly the desktop text', async () => {
    const desktop = files.get('long.docx') as { sha256: string; characters: number };
    const result = await importFile(fixtureFile('long.docx'));
    if (result.kind !== 'text') throw new Error(result.message);
    expect(Array.from(result.text).length).toBe(desktop.characters);
    expect(createHash('sha256').update(result.text, 'utf8').digest('hex')).toBe(desktop.sha256);
  });
});

// The desktop's own tests, as recorded by the fixture script, with the Word
// files they made.
type RecordedCall = [name: string, fileName: string, base64: string, answer: Answer];

const desktopTests = fixture.functions['desktop_tests_docx'] as unknown as [
  [testName: string],
  RecordedCall[],
][];

describe('the desktop tests', () => {
  test('were recorded', () => {
    expect(desktopTests.length).toBeGreaterThanOrEqual(4);
  });

  test.each(desktopTests.map(([[testName], calls]) => [testName, calls] as const))(
    '%s',
    async (_testName, calls) => {
      for (const [name, fileName, base64, desktop] of calls) {
        if (name === 'import_docx') {
          expect(firstLine(await webAnswer(fromBase64(base64), fileName))).toEqual(
            firstLine(desktop),
          );
        } else {
          const result = await importFile(new File([fromBase64(base64)], fileName));
          const web: Answer =
            result.kind === 'text' ? { text: result.text } : { error: result.message };
          expect(firstLine(web)).toEqual(firstLine(desktop));
        }
      }
    },
  );
});
