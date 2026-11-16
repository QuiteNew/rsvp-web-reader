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
import { DECIMAL_ZEROS, DIGIT_RANGES } from './pythonDigitTable';
import { LOWER } from './pythonLowerTable';

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
const LOWERED = new Map(Object.entries(LOWER));

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
 * sigma becomes an ordinary one, and so on. Lower-casing goes through
 * pythonLowerTable.ts, see pyLower() for why.
 */
export function pyCasefold(text: string): string {
  let folded = '';
  for (const character of text) {
    folded += CASEFOLD.get(character) ?? LOWERED.get(character) ?? character;
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

// A capital sigma is lower-cased to the final form when it ends a word:
// a cased letter before it and none after it, looking past characters such
// as apostrophes and accents. Python's rule, in handle_capital_sigma().
const CASED_BEFORE = /\p{Cased}\p{Case_Ignorable}*$/u;
const CASED_AFTER = /^\p{Case_Ignorable}*\p{Cased}/u;

/**
 * Python's str.lower(). Each character is looked up in pythonLowerTable.ts,
 * not handed to toLowerCase(): the browser's Unicode can be newer or older
 * than Python's, and then it lower-cases a different set of characters.
 * Which characters count as cased, for the sigma rule, still comes from the
 * browser.
 */
export function pyLower(text: string): string {
  let lowered = '';
  let position = 0;
  for (const character of text) {
    const end = position + character.length;
    if (character === '\u03a3') {
      const final =
        CASED_BEFORE.test(text.slice(0, position)) && !CASED_AFTER.test(text.slice(end));
      lowered += final ? '\u03c2' : '\u03c3';
    } else {
      lowered += LOWERED.get(character) ?? character;
    }
    position = end;
  }
  return lowered;
}

/**
 * Compare two strings the way Python's < does: character by character, by
 * code point. JavaScript's < compares UTF-16 units, which puts an emoji
 * before a character near the end of the first 65,536, the wrong way round.
 * Returns a negative number, zero or a positive number, as a sort wants.
 */
export function pyCompareText(a: string, b: string): number {
  const left = characters(a);
  const right = characters(b);
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i += 1) {
    const difference = (left[i]?.codePointAt(0) ?? 0) - (right[i]?.codePointAt(0) ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

/**
 * Python's str.isdigit() for one character. More than 0 to 9 in every
 * script: a superscript two and a circled one count as well. JavaScript
 * cannot be asked this, so the list comes from Python.
 */
export function isPyDigit(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined) return false;
  return DIGIT_RANGES.some(([first, last]) => code >= first && code <= last);
}

/**
 * Python's int() for text made only of decimal digits, in any script, such
 * as what \d+ matched. Each digit is worth its distance from the zero of
 * its own script.
 */
export function pyInt(digits: string): number {
  let value = 0;
  for (const digit of digits) {
    const code = digit.codePointAt(0) ?? 0;
    let zero = -1;
    for (const candidate of DECIMAL_ZEROS) {
      if (candidate > code) break;
      zero = candidate;
    }
    if (zero < 0 || code - zero > 9) throw new RangeError(`"${digits}" is not a whole number`);
    value = value * 10 + (code - zero);
  }
  return value;
}
