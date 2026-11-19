// Reading a PDF: the port of import_pdf() in the desktop's
// core/importers.py, on pdf.js instead of pypdf. The owner chose pdf.js on
// 2026-11-18 (docs/handoff/phase-5-progress.md).
//
// As on the desktop:
// - A PDF locked only against printing or editing opens and is read. Those
//   have an empty password to open, which pdf.js tries on its own, as the
//   desktop tries decrypt("").
// - A PDF that needs a real password is refused, with the desktop's message.
// - A page that cannot be read is skipped, and the rest are kept.
// - A scanned PDF has no text to read (that would take OCR), so it ends as
//   "didn't contain any readable text" in finishImport().
//
// pdf.js used to have an isEvalSupported option, to stop it building
// JavaScript from a PDF's fonts. Version 6 has no such option and no such
// code left (checked in its source: no eval and no new Function), so there
// is nothing to switch off.
//
// pdf.js and pypdf put spaces and line ends in slightly different places.
// After the text is tidied, as every import is, the test PDFs come out the
// same as on the desktop (importPdf.test.ts).

import { ImportFailure } from './importFailure';
import { loadPdfjs, type Pdfjs } from './pdfjsLoader';

type Document = Awaited<ReturnType<Pdfjs['getDocument']>['promise']>;

/** The text of one page: each piece of text, with a line end where pdf.js sees one. */
async function pageText(document: Document, number: number): Promise<string> {
  const page = await document.getPage(number);
  try {
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items) {
      if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '');
    }
    return text;
  } finally {
    page.cleanup();
  }
}

export async function importPdf(
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  load: () => Promise<Pdfjs> = loadPdfjs,
): Promise<string> {
  const pdfjs = await load();
  const task = pdfjs.getDocument({
    data: bytes,
    // Only real errors in the console, not pdf.js's notes about fonts.
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  try {
    let document: Document;
    try {
      document = await task.promise;
    } catch (error) {
      if (error instanceof Error && error.name === 'PasswordException') {
        throw new ImportFailure(`${name} is password-protected, so it can't be imported.`);
      }
      throw new ImportFailure(
        `Couldn't open ${name} as a PDF:\n\nIt is not a PDF, or it is damaged.`,
      );
    }
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      try {
        pages.push(await pageText(document, number));
      } catch {
        // One unreadable page should not sink a readable document.
        continue;
      }
    }
    return pages.join('\n');
  } finally {
    await task.destroy();
  }
}
