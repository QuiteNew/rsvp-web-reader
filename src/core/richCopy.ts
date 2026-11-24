// Text with bold stretches, as HTML for the clipboard, so that a program that
// can show bold (Word, an email) keeps the bold word starts when they are
// pasted there. Ported from core/rich_copy.py of the desktop app.
//
// The desktop builds Windows' clipboard format itself: an HTML fragment with a
// header of byte counts in front. A browser writes that header on its own
// when a page puts HTML on the clipboard, so only the fragment is ported here.
//
// The input is a list of pieces, each some text and whether it is bold, in
// reading order. A piece may hold several lines. Only "\n" ends a line. Each
// line becomes one paragraph, the way pasting plain text into Word makes one
// paragraph per line.
//
// HTML squeezes white space, so spaces that would be lost (at the edge of a
// line, or next to another space) are written as non-breaking spaces, a tab
// as four of them, and an empty line keeps one so it still takes up a row.
// Control characters are left out of the HTML, though not out of the plain
// text, since they have no place in HTML.

import { characters } from './pythonText';

export interface Piece {
  readonly text: string;
  readonly bold: boolean;
}

const NBSP = '&nbsp;';

// Paragraphs sit tight against each other, like the lines of the text do.
// Word would otherwise add its own space between them.
const PARAGRAPH = '<p style="margin:0">';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '\t': NBSP.repeat(4),
};

// Python's category Cc: U+0000 to U+001F and U+007F to U+009F.
const CONTROL = /\p{Cc}/u;

/**
 * The plain text of the pieces, which goes on the clipboard next to the HTML
 * so that everything that only knows plain text still gets it.
 */
export function piecesText(pieces: readonly Piece[]): string {
  return pieces.map((piece) => piece.text).join('');
}

/** The pieces as an HTML fragment: one paragraph per line. */
export function htmlFragment(pieces: readonly Piece[]): string {
  return lines(pieces).map(paragraph).join('');
}

/**
 * The pieces cut into lines, each a list of pieces with no line break in
 * them. Always at least one line, so an empty text is one empty paragraph.
 */
function lines(pieces: readonly Piece[]): Piece[][] {
  const found: Piece[][] = [[]];
  for (const { text, bold } of pieces) {
    withoutControls(text)
      .split('\n')
      .forEach((part, number) => {
        if (number > 0) found.push([]);
        if (part !== '') found[found.length - 1]!.push({ text: part, bold });
      });
  }
  return found;
}

/**
 * The text without control characters, except the line break and the tab.
 * That takes out the carriage return of a Windows line ending as well.
 */
function withoutControls(text: string): string {
  return characters(text)
    .filter((char) => char === '\n' || char === '\t' || !CONTROL.test(char))
    .join('');
}

/** One line as a paragraph, with a <b> around each bold stretch. */
function paragraph(pieces: readonly Piece[]): string {
  const chars: string[] = [];
  const boldFlags: boolean[] = [];
  for (const { text, bold } of pieces) {
    for (const char of characters(text)) {
      chars.push(char);
      boldFlags.push(bold);
    }
  }
  if (chars.length === 0) return `${PARAGRAPH}${NBSP}</p>`;
  const written = chars.map((char) => ESCAPES[char] ?? char);
  protectSpaces(chars, written);
  let html = '';
  let index = 0;
  while (index < written.length) {
    const bold = boldFlags[index]!;
    let run = '';
    while (index < written.length && boldFlags[index] === bold) {
      run += written[index]!;
      index += 1;
    }
    html += bold ? `<b>${run}</b>` : run;
  }
  return `${PARAGRAPH}${html}</p>`;
}

/**
 * Turns the spaces HTML would drop into non-breaking ones, in `written`, which
 * holds what to write for each character of the line. A lone space between
 * two other characters is the only one that is safe as it is.
 */
function protectSpaces(chars: readonly string[], written: string[]): void {
  const last = chars.length - 1;
  chars.forEach((char, index) => {
    if (char !== ' ') return;
    const alone =
      index > 0 &&
      index < last &&
      !' \t'.includes(chars[index - 1]!) &&
      !' \t'.includes(chars[index + 1]!);
    if (!alone) written[index] = NBSP;
  });
}
