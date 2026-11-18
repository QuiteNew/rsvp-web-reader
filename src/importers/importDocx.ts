// Reading a Word file (.docx): the port of import_docx() in the desktop's
// core/importers.py, with no library. A .docx is a zip of XML files. The
// zip is opened with unzip.ts and the XML is read with the browser's own
// DOMParser.
//
// Each paragraph's text is worked out as python-docx does it, so a body
// paragraph reads exactly as on the desktop: the text of its runs and
// hyperlinks, a tab as "\t", a line break as "\n", a page or column break
// as nothing. Blank paragraphs are left out.
//
// The written difference, chosen by the owner on 2026-11-18: the desktop
// reads only the paragraphs at the top level of the body, and drops the
// text of tables, text boxes, content controls and footnotes without a
// word. This reads every paragraph of the body in order (a table's cells
// and a text box come where they stand), then the footnotes at the end.
// Headers and footers are still not read.

import { pyStrip } from '../core/pythonText';
import { ImportFailure } from './importFailure';
import { ZipArchive, ZipError } from './unzip';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MARKUP_COMPATIBILITY = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

// The start of every file in the format Word used before .docx, which is
// also how Word saves a .docx that has a password to open.
const OLD_WORD_FILE = [0xd0, 0xcf, 0x11, 0xe0];

class NotAWordFile extends Error {}

function isW(node: Element, name: string): boolean {
  return node.namespaceURI === W && node.localName === name;
}

/** python-docx's text for one run (w:r). */
function runText(run: Element): string {
  let text = '';
  for (const child of run.children) {
    if (child.namespaceURI !== W) continue;
    switch (child.localName) {
      case 't':
        text += child.textContent;
        break;
      case 'tab':
      case 'ptab':
        text += '\t';
        break;
      case 'cr':
        text += '\n';
        break;
      case 'br': {
        // A line break. A page or column break has no text.
        const type = child.getAttributeNS(W, 'type') ?? 'textWrapping';
        if (type === 'textWrapping') text += '\n';
        break;
      }
      case 'noBreakHyphen':
        text += '-';
        break;
    }
  }
  return text;
}

/**
 * python-docx's text for one paragraph (w:p): its runs and the runs of its
 * hyperlinks. Text in other wrappers, such as a tracked insertion or a
 * field, is not read, as on the desktop.
 */
function paragraphText(paragraph: Element): string {
  let text = '';
  for (const child of paragraph.children) {
    if (isW(child, 'r')) {
      text += runText(child);
    } else if (isW(child, 'hyperlink')) {
      for (const run of child.children) if (isW(run, 'r')) text += runText(run);
    }
  }
  return text;
}

/**
 * Every paragraph under `root`, in document order, a paragraph before the
 * paragraphs of a text box it holds. A text box is written twice in the
 * file, once for new Word and once as a fallback for old Word, so the
 * fallback is skipped.
 */
function paragraphsIn(root: Element): Element[] {
  const found: Element[] = [];
  const walk = (node: Element): void => {
    for (const child of node.children) {
      if (child.namespaceURI === MARKUP_COMPATIBILITY && child.localName === 'Fallback') continue;
      if (isW(child, 'p')) found.push(child);
      walk(child);
    }
  };
  walk(root);
  return found;
}

function parseXml(text: string): Document {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new NotAWordFile('Its text is damaged, so it cannot be read.');
  }
  return document;
}

/** A relationship's target as the name of a part in the zip. */
function partName(target: string, folder: string): string {
  const parts = target.startsWith('/') ? [] : folder.split('/').filter(Boolean);
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop();
    else if (piece !== '' && piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

/** The part a relationship of this type points to, from a .rels part. */
async function related(
  zip: ZipArchive,
  relsName: string,
  type: string,
  folder: string,
): Promise<string | null> {
  const rels = await zip.readText(relsName);
  if (rels === null) return null;
  for (const relationship of parseXml(rels).getElementsByTagName('Relationship')) {
    const target = relationship.getAttribute('Target');
    if (relationship.getAttribute('Type')?.endsWith(`/${type}`) && target) {
      return partName(target, folder);
    }
  }
  return null;
}

async function readDocx(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (OLD_WORD_FILE.every((byte, index) => bytes[index] === byte)) {
    throw new NotAWordFile(
      'It is password-protected, or it is an older Word file (.doc), and neither can be read here.',
    );
  }
  let zip: ZipArchive;
  try {
    zip = new ZipArchive(bytes);
  } catch {
    throw new NotAWordFile('It is not a Word document (.docx), or it is damaged.');
  }

  const main = await related(zip, '_rels/.rels', 'officeDocument', '');
  const xml = main === null ? null : await zip.readText(main);
  if (main === null || xml === null) throw new NotAWordFile('It has no Word document inside.');
  const body = parseXml(xml).getElementsByTagNameNS(W, 'body')[0];
  if (body === undefined) throw new NotAWordFile('It has no Word document inside.');
  const paragraphs = paragraphsIn(body);

  const folder = main.split('/').slice(0, -1).join('/');
  const fileName = main.split('/').pop() ?? '';
  const notesName = await related(zip, `${folder}/_rels/${fileName}.rels`, 'footnotes', folder);
  const notesXml = notesName === null ? null : await zip.readText(notesName);
  if (notesXml !== null) {
    for (const note of parseXml(notesXml).getElementsByTagNameNS(W, 'footnote')) {
      // The lines Word draws above the notes, which have no text.
      const type = note.getAttributeNS(W, 'type');
      if (type === 'separator' || type === 'continuationSeparator') continue;
      paragraphs.push(...paragraphsIn(note));
    }
  }

  return paragraphs
    .map(paragraphText)
    .filter((text) => pyStrip(text) !== '')
    .join('\n');
}

export async function importDocx(bytes: Uint8Array<ArrayBuffer>, name: string): Promise<string> {
  try {
    return await readDocx(bytes);
  } catch (error) {
    if (error instanceof NotAWordFile || error instanceof ZipError) {
      const reason =
        error instanceof ZipError
          ? 'It is packed in a way that cannot be read here.'
          : error.message;
      throw new ImportFailure(`Couldn't open ${name} as a Word document:\n\n${reason}`);
    }
    throw error;
  }
}
