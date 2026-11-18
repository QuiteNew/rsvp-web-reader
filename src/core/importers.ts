// Port of the parts of core/importers.py that need no browser: the list of
// file types, the file name rules, the step every import ends with, and the
// text formats, subtitles (.srt and .vtt) and Markdown (.md and .markdown).
//
// The desktop functions take a file's path and read it themselves. These
// take the text after the file was read and decoded, because reading a file
// is the browser's work and src/core has no browser. That part, and plain
// text, HTML, Word and PDF, live in src/importers/.
//
// The regular expressions are the desktop ones, with the changes parser.ts
// also makes so they mean the same in JavaScript:
//
// - \s, \d and \w are written out with Python's own lists (pythonText.ts).
// - Python's . matches anything except "\n". JavaScript's also stops at
//   "\r" and two rare separators, so it is written as [^\n] here.
// - Every expression has the u flag, so an emoji is one character, as it is
//   in Python.
//
// Lines are split with pySplitlines(), Python's str.splitlines(), which
// breaks on more characters than "\n".

import { cleanTranscriptKeepLines } from './parser';
import {
  PY_DIGIT,
  PY_SPACE,
  PY_WORD,
  characters,
  isPyDigit,
  pyLower,
  pyRstrip,
  pySplitlines,
  pyStrip,
} from './pythonText';

/** Every file type the desktop app imports. The web app reads the same ones. */
export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.txt',
  '.srt',
  '.vtt',
  '.md',
  '.markdown',
  '.html',
  '.htm',
  '.docx',
  '.pdf',
]);

/**
 * Python's Path(name).suffix for a file name with no folders: from the last
 * dot to the end. A name that starts with its only dot, such as ".txt", or
 * ends with a dot, has none, so ".txt" is not a text file to the desktop.
 */
export function fileSuffix(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot) : '';
}

/**
 * Python's Path(name).stem: the name without its suffix. The desktop
 * offers it as the title of an imported transcript.
 */
export function fileStem(name: string): string {
  const suffix = fileSuffix(name);
  return suffix === '' ? name : name.slice(0, name.length - suffix.length);
}

/** The suffix that picks the importer: lower case, as import_file() takes it. */
export function importSuffix(name: string): string {
  return pyLower(fileSuffix(name));
}

/** The desktop's message for a file type it does not import. */
export function unsupportedTypeMessage(name: string): string {
  return `Unsupported file type: ${importSuffix(name) || name}`;
}

/** What an import gives: the text, or a message to show as it is. */
export type ImportResult =
  | { readonly kind: 'text'; readonly title: string; readonly text: string }
  | { readonly kind: 'error'; readonly message: string };

/**
 * The step every import ends with, as in import_file(): the text is tidied
 * by cleanTranscriptKeepLines(), and text that ends up empty (an empty file,
 * a scanned PDF with no text layer) is an error, not a blank transcript.
 * The title is the file name without its extension, as the desktop offers.
 */
export function finishImport(name: string, rawText: string): ImportResult {
  const text = cleanTranscriptKeepLines(rawText);
  if (text === '') {
    return { kind: 'error', message: `${name} didn't contain any readable text.` };
  }
  return { kind: 'text', title: fileStem(name), text };
}

const S = `[${PY_SPACE}]`;
const W = `[${PY_WORD}]`;

// Simple markup such as <i> or <font color="red">, in subtitles and as
// stray HTML in Markdown.
const TAG = /<[^>]+>/gu;

/** Python's str.isdigit() for a whole string: not empty, and every character a digit. */
function isAllDigits(text: string): boolean {
  const all = characters(text);
  return all.length > 0 && all.every(isPyDigit);
}

/**
 * The text of a .srt subtitle file. Subtitle blocks look like:
 *
 *     1
 *     00:00:01,000 --> 00:00:04,000
 *     Hello world.
 *
 * Line by line rather than block by block: a line is dropped if it is blank,
 * only digits (the index) or has "-->" (the timing), and everything else is
 * kept as subtitle text, without simple <...> tags. More forgiving of a
 * badly made file than asking for a strict block shape. Each subtitle line
 * stays on its own line, and the Normalize button can join sentences that
 * run over several.
 */
export function importSrt(text: string): string {
  const keptLines: string[] = [];
  for (const line of pySplitlines(text)) {
    let stripped = pyStrip(line);
    if (stripped === '') continue;
    if (isAllDigits(stripped)) continue;
    if (stripped.includes('-->')) continue;
    stripped = pyStrip(stripped.replace(TAG, ''));
    if (stripped !== '') keptLines.push(stripped);
  }
  return keptLines.join('\n');
}

// Cues in a .vtt file are kept apart by a blank line, which may hold
// spaces or tabs.
const VTT_BLOCK_BREAK = /\r?\n[ \t]*\r?\n/u;

/**
 * The text of a WebVTT (.vtt) subtitle file, the format that mostly took
 * over from .srt. A file looks like:
 *
 *     WEBVTT
 *
 *     intro
 *     00:00:01.000 --> 00:00:04.000 align:middle
 *     Hello world.
 *
 * Block by block, since cues are kept apart by blank lines. A block is
 * dropped if it is the WEBVTT header or a NOTE, STYLE or REGION block
 * (comments and styling, not words). In a cue, the optional name line and
 * the timing line (the one with "-->", settings and all) are dropped, and
 * the lines after it are kept without inline tags such as <i>, <c.yellow>
 * and <v Speaker>. Each kept line stays on its own line, as in importSrt().
 * A block with no timing line is malformed, so it is skipped rather than
 * kept as junk.
 */
export function importVtt(text: string): string {
  const keptLines: string[] = [];
  for (const block of text.split(VTT_BLOCK_BREAK)) {
    const lines = pySplitlines(pyStrip(block));
    const firstLine = lines[0];
    if (firstLine === undefined) continue;
    const first = pyStrip(firstLine);
    if (
      first.startsWith('WEBVTT') ||
      first.startsWith('NOTE') ||
      first === 'STYLE' ||
      first === 'REGION'
    ) {
      continue;
    }
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) continue;
    for (const payload of lines.slice(timingIndex + 1)) {
      const cleaned = pyStrip(payload.replace(TAG, ''));
      if (cleaned !== '') keptLines.push(cleaned);
    }
  }
  return keptLines.join('\n');
}

// Inline Markdown, in the order stripInlineMd() removes it.
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/gu;
const LINK = /\[([^\]]*)\]\([^)]*\)/gu;
const REFERENCE_LINK = /\[([^\]]*)\]\[[^\]]*\]/gu;
const INLINE_CODE = /`+([^\n]+?)`+/gu;
const STRONG_STARS = new RegExp(`\\*\\*(?!${S})([^\\n]+?)(?<!${S})\\*\\*`, 'gu');
const EM_STAR = new RegExp(`\\*(?!${S})([^\\n]+?)(?<!${S})\\*`, 'gu');
const STRIKE = new RegExp(`~~(?!${S})([^\\n]+?)(?<!${S})~~`, 'gu');
const STRONG_UNDERSCORES = new RegExp(`(?<!${W})__(?!${S})([^\\n]+?)(?<!${S})__(?!${W})`, 'gu');
const EM_UNDERSCORE = new RegExp(`(?<!${W})_(?!${S})([^\\n]+?)(?<!${S})_(?!${W})`, 'gu');
const BACKSLASH_ESCAPE = /\\([\\`*_{}[\]()#+.!>~-])/gu;

/**
 * One line without its inline Markdown, keeping the text. A practical pass,
 * not a full CommonMark parser (that would need a library): images and
 * links keep their text, inline code loses its backticks, and *, **, _, __
 * and ~~ emphasis go, as do stray inline HTML tags and backslash escapes.
 * Emphasis only goes when it hugs its text (no space just inside the
 * markers) and, for underscores, not inside a word, so snake_case names
 * come through.
 */
export function stripInlineMd(text: string): string {
  // Images first (![alt](url) to alt), then links ([text](url) and
  // [text][ref] to text), so an image's "!" is not left behind by a link.
  let result = text.replace(IMAGE, '$1');
  result = result.replace(LINK, '$1');
  result = result.replace(REFERENCE_LINK, '$1');
  // Inline code: `code` (or ``co`de``) to the code, without backticks.
  result = result.replace(INLINE_CODE, '$1');
  // Emphasis: ** before *, so the * rule does not eat half of a **.
  result = result.replace(STRONG_STARS, '$1');
  result = result.replace(EM_STAR, '$1');
  result = result.replace(STRIKE, '$1');
  result = result.replace(STRONG_UNDERSCORES, '$1');
  result = result.replace(EM_UNDERSCORE, '$1');
  // Any inline HTML tags left, as in the subtitle importers.
  result = result.replace(TAG, '');
  // Backslash escapes: \* to *, \_ to _, and so on.
  return result.replace(BACKSLASH_ESCAPE, '$1');
}

// Markdown line markers, in the order importMd() removes them.
const FENCE = new RegExp(`^${S}*(\`\`\`+|~~~+)`, 'u');
const ALL_SPACE = new RegExp(S, 'gu');
const BLOCKQUOTE_MARKERS = new RegExp(`^${S}*(>${S}?)+`, 'u');
const BULLET = new RegExp(`^${S}*[-*+]${S}+`, 'u');
const NUMBERED = new RegExp(`^${S}*${PY_DIGIT}+[.)]${S}+`, 'u');
const HEADING_OPENER = new RegExp(`^#{1,6}${S}+`, 'u');
const HEADING_CLOSER = new RegExp(`${S}+#+${S}*$`, 'u');

/** True when every character of `text` is one of `allowed`. */
function onlyMadeOf(text: string, allowed: string): boolean {
  return characters(text).every((character) => allowed.includes(character));
}

/**
 * The text of a Markdown (.md or .markdown) file, without its markup, so a
 * note or an article reads as plain prose. Not a full CommonMark parser
 * (that would need a library). A line by line pass that:
 *
 * - drops the ``` and ~~~ lines of a code block, but keeps the code inside
 *   as plain text, so nothing is lost,
 * - drops thematic breaks (---, ***, ___) and the === and --- lines under a
 *   heading,
 * - drops the # of a heading, the > of a quote and the marker of a list
 *   item, and keeps the text after them,
 * - drops the inline markup, with stripInlineMd().
 *
 * Blank lines are kept as paragraph breaks, and cleanTranscriptKeepLines()
 * tidies the rest. Each line stays on its own line, so Normalize can join
 * sentences.
 */
export function importMd(text: string): string {
  const keptLines: string[] = [];
  let inFence = false;
  let fenceMarker: string | null = null;
  for (const line of pySplitlines(text)) {
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = (fence[1] ?? '').charAt(0); // ` or ~
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
        continue;
      }
      if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = null;
        continue;
      }
      // The other fence character inside a code block is just code.
    }
    if (inFence) {
      keptLines.push(pyRstrip(line));
      continue;
    }

    let stripped = pyStrip(line);
    if (stripped === '') {
      keptLines.push(''); // a paragraph break, tidied later
      continue;
    }

    const compact = stripped.replace(ALL_SPACE, '');
    // The line under a heading (===).
    if (onlyMadeOf(compact, '=')) continue;
    // The line under a heading (---), or a thematic break (--- and so on).
    if (onlyMadeOf(compact, '-') && compact.length >= 2) continue;
    // A thematic break made of * or _.
    if (onlyMadeOf(compact, '*_') && compact.length >= 3) continue;

    stripped = stripped.replace(BLOCKQUOTE_MARKERS, '');
    stripped = stripped.replace(BULLET, '');
    stripped = stripped.replace(NUMBERED, '');
    stripped = stripped.replace(HEADING_OPENER, '');
    stripped = stripped.replace(HEADING_CLOSER, '');
    stripped = stripInlineMd(stripped);

    keptLines.push(pyStrip(stripped));
  }
  return keptLines.join('\n');
}
