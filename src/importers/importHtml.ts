// Port of import_html() in the desktop's core/importers.py: the readable
// text of an HTML page (.html or .htm).
//
// The desktop parses the page with lxml. Here the browser's own HTML parser
// does it (DOMParser), so no library is needed. The steps are the same:
// drop <script>, <style>, <noscript>, <head> and <template>, start a new line
// at <br> and at the edges of block elements such as <p>, <li> and <div>,
// and squeeze the spaces inside each line, the source file's own indents
// and line wrapping included.
//
// Two written differences from the desktop, both about turning the file's
// bytes into text (see decodeHtml below). The parsers themselves can build
// a different tree for badly nested markup. The cases tried came out the
// same, and phase-5-progress.md lists them.

import { pySqueeze } from '../core/pythonText';
import { decodeText } from './decodeText';

// What is not reading content: code, styling and the page's metadata.
const DROPPED = 'script, style, noscript, head, template';

// Block elements, which each start on a line of their own. Inline ones
// (<b>, <a>, <span> and so on) are not here, so they do not split a sentence.
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'p',
  'div',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'nav',
  'figure',
  'figcaption',
  'hr',
  'table',
  'tr',
  'td',
  'th',
  'thead',
  'tbody',
  'tfoot',
  'dl',
  'dt',
  'dd',
]);

// A private-use character that marks where a line ends, so a block's edge
// and the file's own whitespace are never confused when the text is joined.
const LINE_MARK = '\ue000';

// A character set named in a <meta> tag: <meta charset="utf-8">, or
// <meta http-equiv="Content-Type" content="text/html; charset=utf-8">.
const META_CHARSET = /<meta\b[^>]*?\bcharset\s*=\s*["']?\s*([\w.:+-]+)/i;

/** The decoder for an encoding a page names, or null if the browser does not know it. */
function decoderFor(label: string): TextDecoder | null {
  try {
    const decoder = new TextDecoder(label);
    // As browsers do: a page cannot really be UTF-16 if its <meta> tag could
    // be read as ASCII, so a UTF-16 label there means UTF-8.
    return decoder.encoding.startsWith('utf-16') ? new TextDecoder('utf-8') : decoder;
  } catch {
    return null;
  }
}

/**
 * The page's bytes as text. A byte order mark comes first, then the
 * encoding the page names in a <meta> tag, as on the desktop.
 *
 * The differences, chosen by the owner on 2026-11-18: a page that names no
 * encoding, or one the browser does not know, is read like a text file:
 * UTF-8 if the bytes are valid UTF-8, Windows-1252 if not. The desktop reads
 * it as Latin-1, so a UTF-8 page without a <meta charset> loses its accents
 * there ("Café" comes out as "CafÃ©"). An encoding named in an XML
 * declaration (<?xml encoding="..."?>) is not looked at, as in a browser.
 */
export function decodeHtml(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  // Each byte as one character, which is enough to find an ASCII <meta> tag.
  const asBytes = new TextDecoder('latin1').decode(bytes);
  const label = META_CHARSET.exec(asBytes)?.[1];
  const named = label === undefined ? null : decoderFor(label);
  return named === null ? decodeText(bytes) : named.decode(bytes);
}

/**
 * Remove an element the way lxml does. To lxml, the text right after an
 * element (up to the next tag or comment) belongs to that element, so it
 * goes too: "<p>a<script>x</script>b</p>" keeps only "a". That loses text,
 * and it is reported to the owner, but it is the desktop's behaviour, so
 * the port copies it until the desktop changes.
 */
function removeLikeLxml(element: Element): void {
  while (element.nextSibling?.nodeType === Node.TEXT_NODE) element.nextSibling.remove();
  element.remove();
}

export function importHtml(bytes: Uint8Array): string {
  const page = new DOMParser().parseFromString(decodeHtml(bytes), 'text/html');
  for (const element of page.querySelectorAll(DROPPED)) removeLikeLxml(element);

  const root = page.documentElement;
  for (const element of root.querySelectorAll('*')) {
    const tag = element.localName;
    if (tag === 'br') {
      element.after(LINE_MARK);
    } else if (BLOCK_TAGS.has(tag)) {
      element.prepend(LINE_MARK);
      element.after(LINE_MARK);
    }
  }

  const lines: string[] = [];
  for (const piece of (root.textContent ?? '').split(LINE_MARK)) {
    const squeezed = pySqueeze(piece);
    if (squeezed !== '') lines.push(squeezed);
  }
  return lines.join('\n');
}
