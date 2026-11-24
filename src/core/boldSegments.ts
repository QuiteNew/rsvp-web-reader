// The text cut into pieces, each one plain or bold, for drawing it with bold
// word starts. boldStarts.ts says which characters are bold, counted the way
// Python counts them. A JavaScript string counts an emoji as two units, so
// this is where those positions are turned into pieces of text.
//
// Nothing here is in the desktop app. There the bold is a Tk text tag laid
// over the text. On a web page it is a piece of text in its own element.

import { boldRanges } from './boldStarts';
import { characters } from './pythonText';

export interface BoldSegment {
  readonly text: string;
  readonly bold: boolean;
}

/**
 * The text as pieces that follow each other and, put back together, give the
 * text exactly. A plain piece and a bold piece alternate, and there is no
 * empty piece: text with no bold start in it is one plain piece, and empty
 * text is none.
 */
export function boldSegments(text: string): BoldSegment[] {
  const chars = characters(text);
  const segments: BoldSegment[] = [];
  let last = 0;
  for (const [start, end] of boldRanges(text)) {
    if (start > last) segments.push({ text: chars.slice(last, start).join(''), bold: false });
    segments.push({ text: chars.slice(start, end).join(''), bold: true });
    last = end;
  }
  if (last < chars.length) segments.push({ text: chars.slice(last).join(''), bold: false });
  return segments;
}
