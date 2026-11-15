// Port of core/parser.py.
//
// The regular expressions are the desktop ones, with three changes that
// keep their meaning the same in JavaScript:
//
// - \d and \s are written out with Python's own lists (see pythonText.ts).
// - Python's multi-line ^ and $ only look at "\n". JavaScript's also stop at
//   "\r" and two rare separators, so they are written as look-arounds on
//   "\n" here and the m flag is not used.
// - Every expression has the u flag, so a digit outside the basic plane is
//   one character, as it is in Python.

import { PY_DIGIT as D, PY_SPACE, PY_SPACE_NOT_NEWLINE, pyStrip } from './pythonText';

const S = `[${PY_SPACE}]`;
const FRACTION = `(?:[.,]${D}{1,3})?`;
const HMS = `${D}{1,2}:${D}{2}:${D}{2}${FRACTION}`;

// Timestamps, in the order they are checked: subtitle timing lines (so a
// whole "00:00:01,000 --> 00:00:04,000" goes, not just its two ends),
// anything in square brackets or parentheses ("[00:01:23]", "(1:23)"), and
// full hour:minute:second ones anywhere ("00:02:45"). A bare two-part time
// only counts when it is alone on its line, the way YouTube transcripts copy
// ("0:05" above each caption), so "we met at 10:30" keeps its time.
const TIMESTAMP_SOURCE =
  `${HMS}${S}*-->${S}*${HMS}` +
  `|[\\[(]${D}{1,2}:${D}{2}(?::${D}{2})?${FRACTION}[\\])]` +
  `|(?<![${D}:])${HMS}(?![${D}:])` +
  `|(?<=^|\\n)[ \\t]*${D}{1,2}:${D}{2}[ \\t\\r]*(?=\\n|$)`;

const HAS_TIMESTAMP = new RegExp(TIMESTAMP_SOURCE, 'u');
const EVERY_TIMESTAMP = new RegExp(TIMESTAMP_SOURCE, 'gu');

const SPACE_RUN = new RegExp(`${S}+`, 'gu');
// Any whitespace except a line break: spaces, tabs, and the odd form feed
// or no-break space that PDFs and Word files leave behind.
const SPACE_RUN_WITHIN_LINE = new RegExp(`[${PY_SPACE_NOT_NEWLINE}]+`, 'gu');
const BLANK_LINE_RUN = /\n{3,}/gu;

// Removing a timestamp from the middle of a line strands the punctuation
// that framed it: the commas in "(9:00, 9:15, done)", the space in
// "later , we", an empty "()". These tidy that up. They run only on text
// where a timestamp was found, so an ordinary ":)" is never touched. Only
// spaces and tabs, never a line break, so they cannot pull two lines
// together.
const REPEATED_SEPARATOR = /([,;])(?:[ \t]*[,;])+/gu;
const SEPARATOR_AFTER_OPEN = /([([])[ \t]*[,;:][ \t]*/gu;
const SEPARATOR_BEFORE_CLOSE = /[ \t]*[,;:][ \t]*([)\]])/gu;
const EMPTY_BRACKETS = /[ \t]*\([ \t]*\)|[ \t]*\[[ \t]*\]/gu;
const SPACE_BEFORE_PUNCT = /[ \t]+([,.;:!?)\]])/gu;

// Single characters that PDFs use to draw two or three letters as one
// shape. They look right on screen but break search and make words count
// as shorter than they are, so they are swapped for plain letters. A fixed
// list, not a general Unicode cleanup, which would also turn "½" into "1/2".
export const LIGATURES: Readonly<Record<string, string>> = {
  ﬀ: 'ff',
  ﬁ: 'fi',
  ﬂ: 'fl',
  ﬃ: 'ffi',
  ﬄ: 'ffl',
  ﬅ: 'st',
  ﬆ: 'st',
};
const ANY_LIGATURE = /[ﬀ-ﬆ]/gu;

/**
 * Remove timestamps and tidy the punctuation and spaces they leave behind.
 * Text with no timestamp is returned untouched.
 */
export function stripTimestamps(text: string): string {
  if (!HAS_TIMESTAMP.test(text)) {
    return text;
  }
  return text
    .replace(EVERY_TIMESTAMP, '')
    .replace(REPEATED_SEPARATOR, '$1')
    .replace(SEPARATOR_AFTER_OPEN, '$1')
    .replace(SEPARATOR_BEFORE_CLOSE, '$1')
    .replace(EMPTY_BRACKETS, '')
    .replace(SPACE_BEFORE_PUNCT, '$1');
}

/** Strip timestamps from raw transcript text and squeeze all whitespace. */
export function cleanTranscript(rawText: string): string {
  return pyStrip(stripTimestamps(rawText).replace(SPACE_RUN, ' '));
}

/** Replace combined letters such as "ﬁ" with the plain letters they stand for. */
export function expandLigatures(text: string): string {
  return text.replace(ANY_LIGATURE, (ligature) => LIGATURES[ligature] ?? ligature);
}

/**
 * Like cleanTranscript(), but keeps line breaks. Meant for imported text, so
 * it lands in the edit view with its lines intact. Spaces inside each line
 * are squeezed, each line is trimmed, runs of blank lines are cut down to
 * one, combined letters are expanded, and a line that held only a timestamp
 * is dropped rather than left behind as a blank line.
 */
export function cleanTranscriptKeepLines(rawText: string): string {
  const text = expandLigatures(rawText.replaceAll('\r\n', '\n').replaceAll('\r', '\n'));
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    const withoutTimestamps = stripTimestamps(line);
    if (pyStrip(line) !== '' && pyStrip(withoutTimestamps) === '') {
      // Nothing but a timestamp: drop the line, so it does not turn into a
      // blank line that splits a paragraph.
      continue;
    }
    lines.push(pyStrip(withoutTimestamps.replace(SPACE_RUN_WITHIN_LINE, ' ')));
  }
  return pyStrip(lines.join('\n').replace(BLANK_LINE_RUN, '\n\n'));
}
