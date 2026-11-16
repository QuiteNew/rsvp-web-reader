// Tidies up a transcript's layout on request, for the Normalize button of
// the edit view. Ported from core/normalizer.py of the desktop app.
//
// It removes list markers (numbering and bullets) and puts each list item
// in its own paragraph, keeps headings such as "Chapter 3" on their own
// line, drops lines that are only a number (usually PDF page numbers), and
// rejoins lines that were broken in the middle of a sentence.
//
// It removes timestamps with the parser's own pattern, so it agrees with
// reading. A line that held nothing but a timestamp is dropped, not left
// behind as a blank line that would split a paragraph.
//
// It also repairs two kinds of damage that text pulled out of a PDF often
// has. Combined letters such as "ﬁ" become plain letters, and a "�"
// (what a PDF reader writes when it cannot tell what a letter was) right
// before an "i" or "l" becomes an "f", since it is almost always the lost
// first half of "fi", "fl" or "ffi". That second one is a guess, which is
// why it only happens here, where the button can revert it.
//
// It mostly works with the line breaks that are already there. It only
// splits a line in two where a list clearly continues inside it: at bullet
// symbols and checkboxes, which do not appear in ordinary prose, and at
// numbering that counts up in order within the line ("1. ... 2. ... 3.").
// Otherwise it stays out of guessing where a sentence ends inside a line,
// where "Dr.", "e.g." and "3.14" make mistakes likely.
//
// Line breaks do not change what gets read, since the parser flattens all
// whitespace first. What does change is that list markers stop being
// flashed as words of their own.
//
// Running this on text it already produced returns that text unchanged.
//
// How the port stays the same as the Python:
// - \s, \d and strip() use Python's own lists (see pythonText.ts).
// - The patterns Python matches without regard to case are written out
//   letter by letter (anyCase below), because Python pairs a few letters
//   that JavaScript does not.
// - Lengths are counted the way Python counts them, one per character and
//   not two for an emoji.
// - Python's $ also matches before a line feed at the very end. No line
//   that reaches these patterns has a line feed in it, so $ is safe here.
import { expandLigatures, stripTimestamps } from './parser';
import {
  PY_DIGIT as D,
  PY_SPACE,
  PY_WORD_NOT_DIGIT,
  isPyDigit,
  isPyLower,
  pyInt,
  pyLength,
  pyStrip,
} from './pythonText';

export const BULLET_SYMBOLS = '•●○◦▪▫■□‣►▶➢➤✓✔⁃';

export const HEADING_WORDS = [
  'part',
  'chapter',
  'section',
  'book',
  'unit',
  'lesson',
  'module',
  'appendix',
  'step',
] as const;

const S = `[${PY_SPACE}]`;
const NOT_S = `[^${PY_SPACE}]`;
const BULLET_CLASS = `[${BULLET_SYMBOLS}]`;

// The letters Python treats as the same when it ignores case, beyond the
// plain capital: a long s, the Kelvin sign, and the dotted capital and
// dotless small i.
const SAME_LETTERS: Readonly<Record<string, string>> = {
  s: '\u017f',
  k: '\u212a',
  i: '\u0130\u0131',
};

/** A pattern for the word in any case, the way Python's re.IGNORECASE reads it. */
function anyCase(word: string): string {
  return Array.from(
    word,
    (letter) => `[${letter}${letter.toUpperCase()}${SAME_LETTERS[letter] ?? ''}]`,
  ).join('');
}

// A bullet symbol anywhere in the text starts a new line, so
// "Fruits: • Apples • Pears" ends up as one line per item.
const INLINE_BULLET = new RegExp(`[ \\t]*(${BULLET_CLASS})[ \\t]*`, 'gu');

// A checkbox, "[X]", "[x]" or "[ ]". Like a bullet symbol it starts a new
// line wherever it appears, but only when text follows it. One with nothing
// after it but closing punctuation ("...the end [X].") is simply removed,
// since it would otherwise become an empty item.
const CHECKBOX = '\\[[ xX]\\]';
const INLINE_CHECKBOX = new RegExp(`[ \\t]*(${CHECKBOX})[ \\t]+(?=${NOT_S})`, 'gu');
// (?![^\n]) is the end of a line: the end of the text, or a line feed next.
// JavaScript's own $ with the m flag would also stop at U+2028 and U+2029.
const TRAILING_CHECKBOX = new RegExp(`[ \\t]*${CHECKBOX}(?=[.!?,;:]*[ \\t]*(?![^\\n]))`, 'gu');

// A number used as a list marker inside a line: "2." or "2)", standing on
// its own between spaces. The lookarounds keep "3.14", "v2." and "(2)" out.
const INLINE_NUMBER = new RegExp(`(?<!${NOT_S})(${D}{1,3})([.)])(?=${S}|$)`, 'gu');

// A number right after one of these is a reference ("p. 12.", "Fig. 3.",
// "Vol. 2."), not a list marker, so it is never split off or removed.
const REFERENCE_ABBREVIATIONS = new RegExp(
  `(?:^|${S})(?:${['p', 'pp', 'no', 'nos', 'vol', 'ch', 'chap', 'fig', 'figs', 'sec', 'eq', 'art', 'para', 'pt'].map(anyCase).join('|')})\\.${S}*$`,
  'u',
);

// How many times normalizeTranscript() may repeat its pass. Splitting a
// numbered run happens before broken lines are joined back up, so the
// joining can occasionally line up a new run that only a second pass would
// split. Repeating until nothing changes means one click always does
// everything a second click would. The cap only guards against looping
// forever.
const MAX_PASSES = 5;

const SPACE_RUN = /[ \t]+/gu;

// A paragraph is only broken up when it is at least this long. Splitting
// closes the current paragraph once it passes this length and starts the
// next sentence in a new one, so paragraphs come out roughly this size.
const LONG_PARAGRAPH_CHARS = 400;

// Words that end in a period without ending a sentence, so a split must not
// happen after them. Without the trailing dot, in lower case.
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'cf',
  'al',
  'inc',
  'ltd',
  'co',
  'corp',
  'vol',
  'no',
  'pp',
  'p',
  'fig',
  'eq',
  'ch',
  'a.m',
  'p.m',
  'u.s',
  'u.k',
  'ph.d',
]);

// A candidate sentence end: one or more of . ! ?, then any closing quotes or
// brackets, then a space, then the next sentence's first character (an
// opening quote or a capital). The group is the run of end marks, checked
// below so an ellipsis "..." is not treated as an end.
const SENTENCE_END_CANDIDATE = new RegExp(`([.!?]+)["'”’)\\]]*${S}+(?=["'“‘(\\[]*[A-Z])`, 'gu');
// The word sitting right before the end mark, used to spot an abbreviation
// or a single initial ("J.").
const WORD_BEFORE_END = /([A-Za-z][A-Za-z.]*)$/u;
const ONLY_DOTS = /^\.{2,}$/u;

const LOST_F = /�(?=[il])/gu;

// Markers that count wherever they start a line. A marker may also sit
// alone on its line, with the item's text on the next one, which is common
// in text copied out of a PDF. Numbers are capped at three digits so a
// wrapped year like "1990." is not mistaken for one.
const CLEAR_MARKER = new RegExp(
  `^(?:${BULLET_CLASS}|${CHECKBOX}|[-*–]` +
    `|${D}{1,3}(?:\\.${D}{1,3})*[.):]` +
    `|\\(${D}{1,3}\\)|\\[${D}{1,3}\\])(?:${S}+|$)`,
  'u',
);

// These two kinds are only trusted when at least two lines use the same
// kind, since a single one is easy to confuse with real text:
// "A. Smith said", "I. M. Pei", "3.14 is roughly pi".
const LETTER_MARKER = new RegExp(
  '^(?:[A-Za-z][.)]|\\([A-Za-z]\\)' +
    `|[ivxlcdm]+[.)]|[IVXLCDM]+[.)]|\\((?:[ivxlcdm]+|[IVXLCDM]+)\\))${S}+(?=${NOT_S})`,
  'u',
);
// A section number ("1.1 Scope") is followed by a word. Requiring a letter
// after it keeps rows of numbers, such as chart axis labels ("0.50 0.25
// 0.00") copied out of a PDF, from being read as markers.
const DECIMAL_MARKER = new RegExp(
  `^${D}{1,3}(?:\\.${D}{1,3})+${S}+(?=[${PY_WORD_NOT_DIGIT}])`,
  'u',
);

// The heading word can be in any case. The number after it can be digits
// ("2.1"), an uppercase roman numeral ("IV") or a single capital letter
// ("Appendix A").
const HEADING = new RegExp(
  `^(?:${HEADING_WORDS.map(anyCase).join('|')})${S}+` +
    `(?:${D}+(?:\\.${D}+)*|[IVXLCDM]+|[A-Z])(?=$|[${PY_SPACE}:.)\\-])`,
  'u',
);

const NUMBER_ONLY = new RegExp(`^${D}+$`, 'u');

// A line ending in one of these (optionally followed by closing quotes or
// brackets) is treated as a finished sentence and never joined to the next
// line.
const SENTENCE_END = /[.!?…:]["'”’)\]]*$/u;
const CLAUSE_END = /[,;]$/u;
const HYPHEN_BREAK = /[A-Za-z]-$/u;
const OPENING_MARKS = /^["'“‘([]+/u;

/**
 * A normalized copy of text. See the top of this file for what changes and
 * what is deliberately left alone. When splitLongParagraphs is on, a wall
 * of prose is also broken into paragraphs at sentence ends, purely so the
 * edit box is readable. It never changes what gets read.
 */
export function normalizeTranscript(text: string, splitLongParagraphs = false): string {
  let result = normalizeOnce(text, splitLongParagraphs);
  for (let pass = 1; pass < MAX_PASSES; pass += 1) {
    const again = normalizeOnce(result, splitLongParagraphs);
    if (again === result) break;
    result = again;
  }
  return result;
}

function normalizeOnce(text: string, splitLongParagraphs: boolean): string {
  const lines = prepareLines(text);
  const letterMarkersTrusted = countMatches(LETTER_MARKER, lines) >= 2;
  const decimalMarkersTrusted = countMatches(DECIMAL_MARKER, lines) >= 2;

  let paragraphs: string[][] = [];
  let current: string[] = [];
  let waitingForItemText = false;

  const finishParagraph = (): void => {
    if (current.length > 0) {
      paragraphs.push(current);
      current = [];
    }
  };

  for (const line of lines) {
    if (line === '') {
      // A blank line ends the paragraph, unless a marker sat alone on an
      // earlier line and its text has not arrived yet.
      if (!waitingForItemText) finishParagraph();
      continue;
    }

    if (NUMBER_ONLY.test(line)) continue;

    if (HEADING.test(line)) {
      finishParagraph();
      paragraphs.push([line]);
      waitingForItemText = false;
      continue;
    }

    const end = markerEnd(line, letterMarkersTrusted, decimalMarkersTrusted);
    if (end > 0) {
      finishParagraph();
      const itemText = pyStrip(line.slice(end));
      if (itemText !== '') {
        current.push(itemText);
        waitingForItemText = false;
      } else {
        waitingForItemText = true;
      }
      continue;
    }

    waitingForItemText = false;
    const previous = current.at(-1);
    if (previous !== undefined && shouldJoin(previous, line)) {
      current[current.length - 1] = join(previous, line);
    } else {
      current.push(line);
    }
  }

  finishParagraph();
  if (splitLongParagraphs) paragraphs = breakUpLongParagraphs(paragraphs);
  return paragraphs.map((paragraph) => paragraph.join('\n')).join('\n\n');
}

function prepareLines(text: string): string[] {
  let prepared = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  prepared = expandLigatures(prepared);
  prepared = prepared.replace(LOST_F, 'f');
  prepared = prepared.replace(INLINE_BULLET, '\n$1 ');
  prepared = prepared.replace(TRAILING_CHECKBOX, '');
  prepared = prepared.replace(INLINE_CHECKBOX, '\n$1 ');

  const lines: string[] = [];
  for (const line of prepared.split('\n')) {
    const withoutTimestamps = stripTimestamps(line);
    if (pyStrip(line) !== '' && pyStrip(withoutTimestamps) === '') {
      // Nothing but a timestamp: drop the line entirely, so it does not
      // turn into a blank line that splits a paragraph.
      continue;
    }
    lines.push(...splitNumberedRun(withoutTimestamps).split('\n'));
  }
  return lines.map((line) => pyStrip(line.replace(SPACE_RUN, ' ')));
}

/**
 * Put a line break before each marker of a numbered list that runs inside
 * the line: "Steps: 1. Mix 2. Bake" becomes "Steps:", "1. Mix" and
 * "2. Bake". A run has to start at 1 and count up by one with the same
 * closing mark, and has to reach at least 2, so a lone number with a period
 * in ordinary prose never splits anything. "1. 2. 3." and "1) 2) 3)" are
 * separate runs, and a new run can start again at 1 later in the same line.
 */
export function splitNumberedRun(line: string): string {
  const splitPoints: number[] = [];
  for (const mark of '.)') {
    let run: number[] = [];
    let expected = 1;
    for (const match of line.matchAll(INLINE_NUMBER)) {
      if (match[2] !== mark) continue;
      if (REFERENCE_ABBREVIATIONS.test(line.slice(0, match.index))) continue;
      const number = pyInt(match[1] ?? '');
      if (number === expected) {
        run.push(match.index);
        expected += 1;
      } else {
        if (run.length >= 2) splitPoints.push(...run);
        [run, expected] = number === 1 ? [[match.index], 2] : [[], 1];
      }
    }
    if (run.length >= 2) splitPoints.push(...run);
  }

  let result = line;
  for (const position of splitPoints.sort((a, b) => b - a)) {
    result = `${result.slice(0, position)}\n${result.slice(position)}`;
  }
  return result;
}

/**
 * Break each long paragraph into several at sentence ends. A paragraph's
 * lines are joined into one string first, so a wall pasted as many lines
 * is handled too. The new paragraphs replace the original only when the
 * joined text is at least LONG_PARAGRAPH_CHARS long and really splits into
 * more than one. Anything else is passed through with its own lines intact.
 */
function breakUpLongParagraphs(paragraphs: readonly string[][]): string[][] {
  const result: string[][] = [];
  for (const paragraph of paragraphs) {
    const joined = paragraph.join(' ');
    if (pyLength(joined) >= LONG_PARAGRAPH_CHARS) {
      const chunks = splitIntoParagraphs(joined);
      if (chunks.length > 1) {
        result.push(...chunks.map((chunk) => [chunk]));
        continue;
      }
    }
    result.push(paragraph);
  }
  return result;
}

/**
 * Group the sentences of one long line into paragraphs, starting a new one
 * each time the current paragraph passes LONG_PARAGRAPH_CHARS. A line of
 * two sentences or fewer is returned unchanged.
 */
function splitIntoParagraphs(line: string): string[] {
  const sentences = splitSentences(line);
  if (sentences.length < 3) return [line];
  const paragraphs: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    current = current === '' ? sentence : `${current} ${sentence}`;
    if (pyLength(current) >= LONG_PARAGRAPH_CHARS) {
      paragraphs.push(current);
      current = '';
    }
  }
  if (current !== '') paragraphs.push(current);
  return paragraphs;
}

/**
 * Split a line into sentences at real sentence ends. A candidate end is
 * skipped when it is an ellipsis, or when the word before it is an
 * abbreviation ("Dr.", "e.g.") or a single initial ("J."), so the split
 * errs toward leaving text together.
 */
export function splitSentences(line: string): string[] {
  const starts: number[] = [];
  for (const match of line.matchAll(SENTENCE_END_CANDIDATE)) {
    if (ONLY_DOTS.test(match[1] ?? '')) continue; // an ellipsis, not a sentence end
    const word = WORD_BEFORE_END.exec(line.slice(0, match.index));
    if (word !== null) {
      const token = (word[1] ?? '').toLowerCase().replace(/\.+$/u, '');
      if (token.length === 1 || ABBREVIATIONS.has(token)) continue;
    }
    starts.push(match.index + match[0].length);
  }

  if (starts.length === 0) return [line];
  const sentences: string[] = [];
  let cut = 0;
  for (const start of starts) {
    sentences.push(pyStrip(line.slice(cut, start)));
    cut = start;
  }
  sentences.push(pyStrip(line.slice(cut)));
  return sentences;
}

function countMatches(pattern: RegExp, lines: readonly string[]): number {
  return lines.filter((line) => pattern.test(line)).length;
}

/** Where the list marker at the start of line ends, or 0 if it does not start with one. */
function markerEnd(
  line: string,
  letterMarkersTrusted: boolean,
  decimalMarkersTrusted: boolean,
): number {
  const candidates: readonly (readonly [RegExp, boolean])[] = [
    [CLEAR_MARKER, true],
    [LETTER_MARKER, letterMarkersTrusted],
    [DECIMAL_MARKER, decimalMarkersTrusted],
  ];
  for (const [pattern, trusted] of candidates) {
    if (!trusted) continue;
    const match = pattern.exec(line);
    if (match !== null) return match[0].length;
  }
  return 0;
}

function startsLowercaseOrDigit(line: string): boolean {
  const [first] = line.replace(OPENING_MARKS, '');
  return first !== undefined && (isPyLower(first) || isPyDigit(first));
}

/**
 * Whether line continues the sentence previous left unfinished. A comma or
 * semicolon at the end of previous always means it does. Otherwise it has
 * to start with a lowercase letter or a digit, so a title line like
 * "Introduction" is not glued onto the text below it.
 */
function shouldJoin(previous: string, line: string): boolean {
  if (SENTENCE_END.test(previous)) return false;
  if (CLAUSE_END.test(previous)) return true;
  return startsLowercaseOrDigit(line);
}

function join(previous: string, line: string): string {
  // A word split across lines with a hyphen ("infor-" + "mation") is joined
  // without a space. The hyphen stays, since there is no way to tell that
  // apart from a real compound like "well-" + "known".
  if (HYPHEN_BREAK.test(previous) && startsLowercaseOrDigit(line)) return previous + line;
  return `${previous} ${line}`;
}

/**
 * The result of one click of the Normalize button: the text to show in the
 * edit box, and the undo information to save with the transcript.
 */
export interface NormalizationToggle {
  readonly text: string;
  readonly preNormalizeText: string;
  readonly normalizedText: string;
}

/**
 * Whether the button should offer to revert: an original is saved and the
 * edit box still holds exactly what normalizing produced. Any edit since
 * then breaks the match. Whitespace at either end is ignored.
 */
export function canRevert(
  currentText: string,
  preNormalizeText: string,
  normalizedText: string,
): boolean {
  return preNormalizeText !== '' && pyStrip(currentText) === normalizedText;
}

/**
 * What one click of the Normalize button does.
 *
 * If canRevert() says so, it brings back the saved original and clears the
 * undo information. Otherwise it normalizes currentText and remembers the
 * original so the next click can undo it. If normalizing would not change
 * anything, the text is returned as it was and nothing is remembered, so
 * the button stays on Normalize.
 */
export function toggleNormalization(
  currentText: string,
  preNormalizeText: string,
  normalizedText: string,
  splitLongParagraphs = false,
): NormalizationToggle {
  if (canRevert(currentText, preNormalizeText, normalizedText)) {
    return { text: preNormalizeText, preNormalizeText: '', normalizedText: '' };
  }
  const original = pyStrip(currentText);
  const normalized = normalizeTranscript(currentText, splitLongParagraphs);
  if (normalized === original) return { text: original, preNormalizeText: '', normalizedText: '' };
  return { text: normalized, preNormalizeText: original, normalizedText: normalized };
}
