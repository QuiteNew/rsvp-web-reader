// Python's rules for text, rebuilt for JavaScript.
//
// The desktop app is written in Python, and its results depend on what
// Python calls a space, a letter or a digit, on how it counts characters and
// on how it rounds. JavaScript disagrees on each of those in small ways. The
// port goes through these helpers wherever the Python code uses the matching
// Python feature, so both give the same answer. fixtures/core/charsets.json
// holds Python's own lists, and pythonText.test.ts checks these helpers
// against them character by character.

import { CASEFOLD_EXCEPTIONS } from './pythonCasefoldTable';

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

// Python's \w: a letter or a number in any script, or an underscore. Written
// to go inside [...]. Needs the u flag.
export const PY_WORD = '\\p{L}\\p{N}_';

// Python's [^\W\d_]: a word character that is neither a decimal digit nor an
// underscore. That leaves letters and the numbers that are not digits, such
// as a fraction or a Roman numeral. Written to go inside [...].
export const PY_WORD_NOT_DIGIT = '\\p{L}\\p{Nl}\\p{No}';

const SPACE_RUN = new RegExp(`[${PY_SPACE}]+`, 'u');
const LEADING_SPACE = new RegExp(`^[${PY_SPACE}]+`, 'u');
const TRAILING_SPACE = new RegExp(`[${PY_SPACE}]+$`, 'u');
const ONE_SPACE = new RegExp(`^[${PY_SPACE}]$`, 'u');
const ONE_LETTER_OR_NUMBER = /^[\p{L}\p{N}]$/u;
const ONE_LOWERCASE = /^\p{Lowercase}$/u;
const CASEFOLD = new Map(Object.entries(CASEFOLD_EXCEPTIONS));

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

/**
 * Python's str.islower() for one character. U+0295 is named because Python
 * 3.13 calls it lowercase and newer Unicode versions, which browsers follow,
 * do not.
 */
export function isPyLower(character: string): boolean {
  return character === '\u0295' || ONE_LOWERCASE.test(character);
}

/**
 * Python's str.casefold(): lower case made for comparing, not for showing.
 * It is close to lower-casing each character on its own, and
 * pythonCasefoldTable.ts lists where it is not: "ß" becomes "ss", a final
 * sigma becomes an ordinary one, and so on. toLowerCase() on the whole text
 * would be wrong too, because it treats a sigma at the end of a word
 * differently.
 */
export function pyCasefold(text: string): string {
  let folded = '';
  for (const character of text) {
    folded += CASEFOLD.get(character) ?? character.toLowerCase();
  }
  return folded;
}

/** Python's str.split() with no arguments: split on runs of whitespace. */
export function pySplit(text: string): string[] {
  return text.split(SPACE_RUN).filter((piece) => piece !== '');
}

/** Python's str.strip() with no arguments. */
export function pyStrip(text: string): string {
  return text.replace(LEADING_SPACE, '').replace(TRAILING_SPACE, '');
}

/** Python's str.lstrip() with no arguments. */
export function pyLstrip(text: string): string {
  return text.replace(LEADING_SPACE, '');
}

/** Python's str.rstrip() with no arguments. */
export function pyRstrip(text: string): string {
  return text.replace(TRAILING_SPACE, '');
}

/** Python's " ".join(text.split()): every run of whitespace becomes one space. */
export function pySqueeze(text: string): string {
  return pySplit(text).join(' ');
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
