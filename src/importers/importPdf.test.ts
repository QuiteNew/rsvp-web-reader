// @vitest-environment node
//
// These tests run pdf.js in Node, not in jsdom: pdf.js knows Node and
// reads the PDF there with its worker code in the same thread, while in
// jsdom it would look for a Worker that jsdom does not have. Node needs
// pdf.js's "legacy" build. The site uses the normal build in a real
// worker, which the browser tests check.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import { fixture } from '../testing/importerFixtures';
import { ImportFailure } from './importFailure';
import { importFile } from './importFile';
import { importPdf } from './importPdf';

vi.mock('./pdfjsLoader', () => ({
  loadPdfjs: () => import('pdfjs-dist/legacy/build/pdf.mjs'),
}));

type Answer = { text: string } | { error: string };

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

async function asAnswer(file: File): Promise<Answer> {
  const result = await importFile(file);
  return result.kind === 'text' ? { text: result.text } : { error: result.message };
}

// The desktop says why a file could not be opened in pypdf's words, which
// the web app cannot copy. Only the first line has to match.
function firstLine(answer: Answer): Answer {
  return 'error' in answer ? { error: answer.error.split('\n')[0] ?? '' } : answer;
}

// The PDFs in fixtures/files, made with LibreOffice from invented text (see
// its README), and what the desktop's import_file() gave for each.
const files = fixture.functions['import_pdf_files'] as unknown as [
  [string],
  Answer | { sha256: string; characters: number },
][];

function fixtureFile(name: string): File {
  // Read from the repository's root, where the tests run.
  return new File([new Uint8Array(readFileSync(`fixtures/files/${name}`))], name);
}

describe('the PDFs in fixtures/files, against import_file() on the desktop', () => {
  test('all of them are there', () => {
    expect(files.map(([[name]]) => name)).toEqual([
      'locked-aes-128.pdf',
      'locked-aes-256.pdf',
      'locked-rc4-128.pdf',
      'long.pdf',
      'password-aes-256.pdf',
      'rich.pdf',
      'scanned.pdf',
    ]);
  });

  test.each(files.map(([[name], desktop]) => [name, desktop] as const))(
    '%s',
    async (name, desktop) => {
      const web = await asAnswer(fixtureFile(name));
      if ('sha256' in desktop) {
        if (!('text' in web)) throw new Error(web.error);
        expect(Array.from(web.text).length).toBe(desktop.characters);
        expect(createHash('sha256').update(web.text, 'utf8').digest('hex')).toBe(desktop.sha256);
      } else {
        expect(web).toEqual(desktop);
      }
    },
    60_000,
  );
});

// The desktop's own tests, as recorded by the fixture script, with the PDFs
// they made. The ones that make an encrypted PDF are not recorded (pypdf
// encrypts with random keys); the locked PDFs above stand in for them.
type RecordedCall = [name: string, fileName: string, base64: string, answer: Answer];

const desktopTests = fixture.functions['desktop_tests_pdf'] as unknown as [
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
        let web: Answer;
        if (name === 'import_pdf') {
          try {
            web = { text: await importPdf(fromBase64(base64), fileName) };
          } catch (error) {
            if (!(error instanceof ImportFailure)) throw error;
            web = { error: error.message };
          }
          // The raw text, before tidying: pdf.js and pypdf may differ in
          // spaces at the ends of lines, so it is compared tidied.
          if ('text' in web && 'text' in desktop) {
            expect(web.text.trim()).toBe(desktop.text.trim());
            continue;
          }
        } else {
          web = await asAnswer(new File([fromBase64(base64)], fileName));
        }
        expect(firstLine(web)).toEqual(firstLine(desktop));
      }
    },
  );
});

describe('in short', () => {
  test('a file that is not a PDF gets the desktop first line and a plain reason', async () => {
    expect(await asAnswer(new File(['%PDF-1.4 not really'], 'bad.pdf'))).toEqual({
      error: "Couldn't open bad.pdf as a PDF:\n\nIt is not a PDF, or it is damaged.",
    });
  });
});
