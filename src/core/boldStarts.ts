// Bold word starts: which letters at the front of each word to draw in bold,
// like [we]ll-[kno]wn. Ported from core/bold_starts.py of the desktop app.
//
// This module only answers "which characters". Drawing them is the screen's
// job, and the text itself is never changed. The answer counts characters
// the way Python does, so an emoji is one position and not two. A screen that
// slices a JavaScript string with these numbers has to convert them first
// (see characters() in pythonText.ts).
//
// What counts as a word:
//
// - A run of letters from the alphabets that put spaces between words: Latin,
//   Cyrillic and Greek. Letters of other scripts are left alone.
// - An apostrophe between two letters stays inside the word (don't, O'Brien,
//   a curly one too, and the modifier apostrophe Ukrainian writes in m'yaso).
//   One at the start or the end (dogs') is just punctuation.
// - A soft hyphen or a joiner inside a word is invisible, so it stays inside
//   the word without being counted. A zero-width space ends the word.
// - A combining mark stays with its letter, and a bold stretch never ends
//   between a letter and its mark.
// - Everything else ends a word: spaces, digits, punctuation, every kind of
//   hyphen and dash, slashes and underscores.
// - A word with a digit right against it (3rd, H2O, mp3, 1990's) is left
//   alone. So are web addresses and email addresses.
//
// A line break ends a word like any other character, so the whole text can be
// handed over at once or one line at a time, and the answer is the same.
//
// Not ported: core/bold_spans.py, which turns these ranges into the "line.
// column" places of a Tk text box, and the limit on very long lines that goes
// with it. Both are about Tk.
//
// One thing differs on purpose. Python 3.13 knows Unicode 15.1 and a browser
// may know a newer version. A letter or mark added since then is treated as
// what the browser says it is. boldStarts.test.ts leaves such characters out
// of its comparison, as pythonText.test.ts does.

import { PY_SPACE, PY_WORD, characters, pyLower } from './pythonText';

// The most letters fixationLength() makes bold. The nudge below can move a
// cut by up to MAX_NUDGE letters, so a very long word can end up with a bit
// more or less than this.
export const MAX_BOLD_LETTERS = 6;

// Words with fewer letters than this keep the cut fixationLength() gives
// them. Short words are bold by half, and a nudge there would only make them
// lighter.
const NUDGE_MIN_LETTERS = 7;
export const MAX_NUDGE = 2;

// The apostrophes that can sit inside a word: the straight one, the curly one
// and the modifier letter apostrophe.
const APOSTROPHES = "'\u2019\u02bc";

// Characters that are invisible and sit inside a word without breaking it:
// the soft hyphen, the two joiners and the word joiner.
const INVISIBLE_GLUE = '\u00ad\u200c\u200d\u2060';

// Letters of the scripts that get bold, as [first, last] character numbers. A
// letter outside these ends the word. The ranges include a few characters that
// are not letters (the Greek question mark, say), which charKind() weeds out
// by category.
const SCRIPT_RANGES: readonly (readonly [number, number])[] = [
  // Latin, with the Latin-1 and extended blocks and the f-ligatures.
  [0x0041, 0x005a],
  [0x0061, 0x007a],
  [0x00c0, 0x024f],
  [0x1e00, 0x1eff],
  [0x2c60, 0x2c7f],
  [0xa720, 0xa7ff],
  [0xfb00, 0xfb06],
  // Greek, with the polytonic block.
  [0x0370, 0x03ff],
  [0x1f00, 0x1fff],
  // Cyrillic, with the extended blocks.
  [0x0400, 0x052f],
  [0x1c80, 0x1c8f],
  [0xa640, 0xa69f],
];
const CYRILLIC_FIRST = 0x0400;
const CYRILLIC_LAST = 0x052f;

// The Cyrillic soft and hard sign. They belong to the letter in front of
// them, so a cut is never made right before one.
const SIGNS = '\u044c\u044a';

// The vowels, lower case and without accents. The Latin and Greek ones are
// matched after taking an accent off (see isVowel). A Cyrillic letter is
// matched as it is, because taking an accent off the short i would turn a
// consonant into the vowel i.
const VOWELS: ReadonlySet<string> = new Set(
  characters(
    'aeiouy\u00e6\u0153\u00f8\u0131\u0259' +
      '\u0430\u0435\u0451\u0438\u043e\u0443\u044b\u044d\u044e\u044f\u0456\u0457\u0454\u045d' +
      '\u03b1\u03b5\u03b7\u03b9\u03bf\u03c5\u03c9',
  ),
);

// Web and email addresses are skipped whole. A bare domain with no http://,
// no www. and no @ (example.com) is not recognised: it is rare in a
// transcript, and it would take a list of every ending to tell it from
// "end.Then". PY_SPACE and PY_WORD are Python's own \s and \w.
const LEAVE_ALONE = new RegExp(
  `https?://[^${PY_SPACE}]+|www\\.[^${PY_SPACE}]+` +
    `|[${PY_WORD}.+-]+@[${PY_WORD}-]+(?:\\.[${PY_WORD}-]+)+`,
  'gu',
);

// Characters that Python's str.isnumeric() accepts and the Unicode number
// categories do not: ideographs that are also numbers, such as the one for
// three. JavaScript cannot be asked, so the list comes from Python. The other
// numeric characters are the ones of the Unicode category N.
const NUMERIC_IDEOGRAPHS: readonly (number | readonly [number, number])[] = [
  0x3405,
  0x3483,
  0x382a,
  0x3b4d,
  0x4e00,
  0x4e03,
  0x4e07,
  0x4e09,
  0x4e24,
  0x4e5d,
  0x4e8c,
  0x4e94,
  0x4e96,
  0x4eac,
  [0x4ebf, 0x4ec0],
  0x4edf,
  0x4ee8,
  0x4f0d,
  0x4f70,
  0x4fe9,
  0x5006,
  0x5104,
  0x5146,
  0x5169,
  0x516b,
  0x516d,
  0x5341,
  [0x5343, 0x5345],
  0x534c,
  [0x53c1, 0x53c4],
  0x56db,
  0x58f1,
  0x58f9,
  0x5e7a,
  [0x5efe, 0x5eff],
  [0x5f0c, 0x5f0e],
  0x5f10,
  0x62d0,
  0x62fe,
  0x634c,
  0x67d2,
  0x6d1e,
  0x6f06,
  0x7396,
  0x767e,
  0x7695,
  0x79ed,
  0x8086,
  0x842c,
  0x8cae,
  0x8cb3,
  0x8d30,
  0x920e,
  0x94a9,
  0x9621,
  0x9646,
  0x964c,
  0x9678,
  0x96f6,
  0xf96b,
  0xf973,
  0xf978,
  0xf9b2,
  0xf9d1,
  0xf9d3,
  0xf9fd,
  0x20001,
  0x20064,
  0x200e2,
  0x20121,
  0x2092a,
  0x20983,
  0x2098c,
  0x2099c,
  0x20aea,
  0x20afd,
  0x20b19,
  0x22390,
  0x22998,
  0x23b1b,
  0x2626d,
  0x2f890,
];

/**
 * How many letters at the start of a word with this many letters are bold.
 *
 * Half of a short word, rounded up, then slowly less: one letter for one or
 * two, two for three or four, three for five or six, four for seven to ten,
 * five for eleven to fourteen and six from fifteen on. A word of two letters
 * or more is never bold all the way through.
 *
 * The curve is meant to be tuned by eye. Change it here and nothing else
 * needs to know.
 */
export function fixationLength(letterCount: number): number {
  // Math.floor, not a plain division, because Python's // rounds down for
  // negative numbers too.
  if (letterCount <= 6) return Math.floor((letterCount + 1) / 2);
  return Math.min(MAX_BOLD_LETTERS, 3 + Math.floor((letterCount - 3) / 4));
}

/**
 * The [start, end) pairs of the stretches of `text` to draw in bold, counted
 * in characters the way Python counts them, sorted and never overlapping.
 * See the top of this file for what counts as a word and how long the stretch
 * is.
 */
export function boldRanges(text: string): [number, number][] {
  const chars = characters(text);
  const size = chars.length;
  const skips = addressSpans(text, size);
  const ranges: [number, number][] = [];
  let i = 0;
  let nextSkip = 0;
  while (i < size) {
    // Step over a web or email address whole.
    while (nextSkip < skips.length && skips[nextSkip]![1] <= i) nextSkip += 1;
    const skip = skips[nextSkip];
    if (skip !== undefined && skip[0] <= i) {
      i = skip[1];
      continue;
    }
    if (charKind(chars[i]!) !== 'L') {
      i += 1;
      continue;
    }

    // A word starts here. Take its letters, each with the combining marks
    // that follow it, and let apostrophes and invisible glue ride along. One
    // that ends up on the end of the word (dogs') is harmless, because the
    // bold stretch is cut from the letters alone.
    const start = i;
    const letters: string[] = [];
    const ends: number[] = [];
    while (i < size) {
      const kind = charKind(chars[i]!);
      if (kind === 'L') {
        letters.push(chars[i]!);
        i += 1;
        while (i < size && charKind(chars[i]!) === 'M') i += 1;
        ends.push(i);
      } else if (kind === 'A' || kind === 'I') {
        i += 1;
      } else {
        break;
      }
    }

    if (touchesDigit(chars, start, i)) continue;
    ranges.push([start, ends[cutAfter(letters) - 1]!]);
  }
  return ranges;
}

/**
 * What a character is to the word finder: "L" a letter that gets bold, "M" a
 * combining mark, "A" an apostrophe, "I" invisible glue inside a word, and
 * "O" for everything else, which ends a word.
 */
export type CharKind = 'L' | 'M' | 'A' | 'I' | 'O';

const MARK = /^\p{M}$/u;
const LETTER = /^\p{L}$/u;
const NUMBER = /^\p{N}$/u;

// Text is mostly the same few non-ASCII characters over and over, so the
// answer for each is kept. Python keeps the last 4096 as well.
const KIND_CACHE_SIZE = 4096;
const kindCache = new Map<string, CharKind>();

/** One character, as the word finder sees it. See CharKind. */
export function charKind(char: string): CharKind {
  const code = char.charCodeAt(0);
  // The plain letters are the common case, so they do not go through the
  // regular expressions.
  if (char.length === 1 && code < 0x80) {
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return 'L';
    return char === "'" ? 'A' : 'O';
  }
  const known = kindCache.get(char);
  if (known !== undefined) return known;
  const kind = classify(char);
  if (kindCache.size >= KIND_CACHE_SIZE) kindCache.clear();
  kindCache.set(char, kind);
  return kind;
}

function classify(char: string): CharKind {
  if (APOSTROPHES.includes(char)) return 'A';
  if (INVISIBLE_GLUE.includes(char)) return 'I';
  if (MARK.test(char)) return 'M';
  if (LETTER.test(char)) {
    const code = char.codePointAt(0) ?? 0;
    if (SCRIPT_RANGES.some(([first, last]) => code >= first && code <= last)) return 'L';
  }
  return 'O';
}

/** Python's str.isnumeric() for one character. */
export function isNumericChar(char: string): boolean {
  if (char === '') return false;
  if (NUMBER.test(char)) return true;
  const code = char.codePointAt(0) ?? 0;
  return NUMERIC_IDEOGRAPHS.some((entry) =>
    typeof entry === 'number' ? entry === code : code >= entry[0] && code <= entry[1],
  );
}

/**
 * Where the web and email addresses are, as [start, end) character
 * positions. The regular expression works in UTF-16 units, so for a text with
 * an emoji in it the units are turned into characters.
 */
function addressSpans(text: string, size: number): [number, number][] {
  const found: [number, number][] = [];
  const matches = [...text.matchAll(LEAVE_ALONE)];
  if (matches.length === 0) return found;
  const unitToCharacter = text.length === size ? null : unitsToCharacters(text);
  for (const match of matches) {
    const first = match.index;
    const last = first + match[0].length;
    found.push(
      unitToCharacter === null ? [first, last] : [unitToCharacter[first]!, unitToCharacter[last]!],
    );
  }
  return found;
}

/** For each UTF-16 position of the text, the character position it is in. */
function unitsToCharacters(text: string): Int32Array {
  const table = new Int32Array(text.length + 1);
  let unit = 0;
  let position = 0;
  for (const char of text) {
    for (let step = 0; step < char.length; step += 1) table[unit + step] = position;
    unit += char.length;
    position += 1;
  }
  table[text.length] = position;
  return table;
}

/**
 * Whether the word at chars[start..end) has a digit right against it. An
 * apostrophe in front is looked through, so the s of 1990's counts too.
 */
function touchesDigit(chars: readonly string[], start: number, end: number): boolean {
  let before = start > 0 ? chars[start - 1]! : '';
  if (start > 1 && before !== '' && APOSTROPHES.includes(before)) before = chars[start - 2]!;
  const after = end < chars.length ? chars[end]! : '';
  return isNumericChar(before) || isNumericChar(after);
}

/**
 * How many of a word's letters are bold. The length from fixationLength(),
 * moved a little in a long word to a better place to cut. `maxNudge` is a
 * parameter only so that a test can try a wide nudge.
 */
export function cutAfter(letters: readonly string[], maxNudge: number = MAX_NUDGE): number {
  const count = letters.length;
  const keep = fixationLength(count);
  if (count < NUDGE_MIN_LETTERS) return keep;
  for (let distance = 0; distance <= maxNudge; distance += 1) {
    // The shorter cut goes first, so a tie keeps the bold part lighter.
    for (const cut of [keep - distance, keep + distance]) {
      if (cut >= 1 && cut < count && cleanCut(letters[cut - 1]!, letters[cut]!)) return cut;
    }
  }
  return keep;
}

/**
 * Whether cutting between these two letters sits between a vowel and a
 * consonant, and not right in front of a Cyrillic sign.
 */
function cleanCut(before: string, after: string): boolean {
  if (SIGNS.includes(pyLower(after))) return false;
  return isVowel(before) !== isVowel(after);
}

function isVowel(letter: string): boolean {
  let first = characters(pyLower(letter))[0]!;
  const code = first.codePointAt(0) ?? 0;
  if (!VOWELS.has(first) && !(code >= CYRILLIC_FIRST && code <= CYRILLIC_LAST)) {
    // An accented Latin or Greek letter counts as the plain one.
    first = characters(first.normalize('NFD'))[0]!;
  }
  return VOWELS.has(first);
}
