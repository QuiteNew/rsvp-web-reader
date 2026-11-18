import { describe, expect, test } from 'vitest';
import { fileStem } from '../core/importers';
import { decodeText } from './decodeText';
import { importFile } from './importFile';
import { asWindows1252, bytesOf, fixture, isUtf8 } from '../testing/importerFixtures';

type Answer = { text: string } | { error: string };

// File types whose importer comes with a later step of phase 5. Their
// recorded cases are left out until then, and listed so it is plain which.
const LATER = new Set(['.docx', '.pdf']);

function suffixOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** The desktop's answer, as the web app should give it. */
function expected(answer: Answer, byteString: string, name: string) {
  if ('error' in answer) return { kind: 'error', message: answer.error };
  // Where the desktop fell back to Latin-1, the web app reads Windows-1252.
  const text = isUtf8(bytesOf(byteString)) ? answer.text : asWindows1252(answer.text);
  return { kind: 'text', title: fileStem(name), text };
}

function fileFrom(name: string, byteString: string): File {
  return new File([bytesOf(byteString)], name);
}

describe('against import_file() on the desktop', () => {
  const cases = (
    fixture.functions['import_file'] as unknown as [[string, string], Answer][]
  ).filter(([[name]]) => !LATER.has(suffixOf(name)));

  test('the cases are there', () => {
    expect(cases.length).toBeGreaterThan(20);
  });

  test.each(cases.map(([[name, bytes], answer]) => [name, bytes, answer] as const))(
    '%s',
    async (name, bytes, answer) => {
      expect(await importFile(fileFrom(name, bytes))).toEqual(expected(answer, bytes, name));
    },
  );
});

// The desktop's own tests, as recorded by the fixture script: every call a
// test made to import_txt() or import_file(), with the file it wrote.
type RecordedCall = [name: string, fileName: string, bytes: string, answer: Answer];

const recorded = (fixture.functions['desktop_tests'] ?? []) as unknown as [
  [testName: string],
  RecordedCall[],
][];

const desktopTests = recorded
  .map(
    ([[testName], calls]) =>
      [
        testName,
        calls.filter(
          ([name, fileName]) =>
            (name === 'import_txt' || name === 'import_file') && !LATER.has(suffixOf(fileName)),
        ),
      ] as const,
  )
  .filter(([, calls]) => calls.length > 0);

describe('the desktop tests', () => {
  test('were recorded', () => {
    expect(desktopTests.length).toBeGreaterThanOrEqual(10);
  });

  test.each(desktopTests)('%s', async (_testName, calls) => {
    for (const [name, fileName, bytes, answer] of calls) {
      const result = await importFile(fileFrom(fileName, bytes));
      if (name === 'import_file') {
        expect(result).toEqual(expected(answer, bytes, fileName));
      } else if ('text' in answer) {
        // import_txt() only decodes: the text before import_file() tidies it.
        const text = isUtf8(bytesOf(bytes)) ? answer.text : asWindows1252(answer.text);
        expect(decodeText(bytesOf(bytes))).toBe(text);
      } else {
        throw new Error(`import_txt() is not expected to fail, but did in ${fileName}`);
      }
    }
  });
});

describe('the web app on its own', () => {
  test('a file that cannot be read gets a plain message', async () => {
    const file = new File(['x'], 'gone.txt');
    file.arrayBuffer = () => Promise.reject(new Error('NotReadableError'));
    expect(await importFile(file)).toEqual({ kind: 'error', message: "Couldn't read gone.txt." });
  });

  test('the title is the file name without its extension', async () => {
    const result = await importFile(new File(['Some words.'], 'My talk.notes.txt'));
    expect(result).toEqual({ kind: 'text', title: 'My talk.notes', text: 'Some words.' });
  });

  test('the extension is picked before the file is read', async () => {
    const file = new File(['x'], 'photo.jpg');
    file.arrayBuffer = () => Promise.reject(new Error('must not be read'));
    expect(await importFile(file)).toEqual({
      kind: 'error',
      message: 'Unsupported file type: .jpg',
    });
  });
});
