// Python's rules for text, rebuilt for JavaScript.
//
// The desktop app is written in Python, and its results depend on what
// Python calls a space, a letter or a digit, on how it counts characters and
// on how it rounds. JavaScript disagrees on each of those in small ways. The
// port goes through these helpers wherever the Python code uses the matching
// Python feature, so both give the same answer. fixtures/core/charsets.json
// holds Python's own lists, and pythonText.test.ts checks these helpers
// against them character by character.

// Every character Python treats as whitespace: str.isspace(), str.split(),
// str.strip() and \s in a regular expression all use this one list. Written
// to go inside [...] in a regular expression.
//
// JavaScript's \s is not the same list. It includes the byte order mark
// (U+FEFF), which Python does not, and it leaves out U+001C to U+001F and
// U+0085, which Python includes.
export const PY_SPACE =
  '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';

// The same list without the line feed, for Python's [^\S\n].
export const PY_SPACE_NOT_NEWLINE = PY_SPACE.replace('\\n', '');

// Python's \d: any decimal digit in any script, not only 0 to 9. Written to
// go inside or outside [...]. Needs the regular expression's u flag.
export const PY_DIGIT = '\\p{Nd}';

const SPACE_RUN = new RegExp(`[${PY_SPACE}]+`, 'u');
const LEADING_SPACE = new RegExp(`^[${PY_SPACE}]+`, 'u');
const TRAILING_SPACE = new RegExp(`[${PY_SPACE}]+$`, 'u');
const ONE_SPACE = new RegExp(`^[${PY_SPACE}]$`, 'u');
const ONE_LETTER_OR_NUMBER = /^[\p{L}\p{N}]$/u;

/** Python's str.isspace() for one character. */
export function isPySpace(character: string): boolean {
  return ONE_SPACE.test(character);
}

/**
 * Python's str.isalnum() for one character: a letter or a number in any
 * script. The answer for a character newer than the browser's or Python's
 * Unicode tables can differ, which no real text is likely to hit.
 */
export function isPyAlnum(character: string): boolean {
  return ONE_LETTER_OR_NUMBER.test(character);
}

/** Python's str.split() with no arguments: split on runs of whitespace. */
export function pySplit(text: string): string[] {
  return text.split(SPACE_RUN).filter((piece) => piece !== '');
}

/** Python's str.strip() with no arguments. */
export function pyStrip(text: string): string {
  return text.replace(LEADING_SPACE, '').replace(TRAILING_SPACE, '');
}

/**
 * The text as a list of characters the way Python counts them. A JavaScript
 * string counts an emoji as two units, so text.length, text[i] and
 * text.slice() are all wrong for it. Count, index and slice this list
 * instead, and join it back with join('').
 */
export function characters(text: string): string[] {
  return Array.from(text);
}

/** Python's len() for a string. */
export function pyLength(text: string): number {
  return characters(text).length;
}

/**
 * Python's round() for a number: a value exactly halfway between two whole
 * numbers goes to the even one, so 312.5 becomes 312 and 313.5 becomes 314.
 * Math.round sends every half upward, which is off by one for half of them.
 */
export function pyRound(value: number): number {
  const below = Math.floor(value);
  const gap = value - below;
  if (gap < 0.5) return below;
  if (gap > 0.5) return below + 1;
  return below % 2 === 0 ? below : below + 1;
}
