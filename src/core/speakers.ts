// Port of core/speakers.py.
//
// Works out who is speaking in a labelled transcript, for Speaker cues.
//
// A transcript like this one has speakers:
//
//     Interviewer: So how did it start?
//     Speaker 2: In a garage, believe it or not.
//
// A label is a short name at the very start of a line, followed by a colon
// and then a space or the end of the line. "Interviewer:", "Speaker 2:",
// "Q:" and "Dr. Smith:" all count. A colon with no space after it does not,
// which keeps "http://..." and "Note:hello" out, and a time such as "10:30"
// starts with a digit, so it cannot be a label either.
//
// A label cannot start with a small letter. Without that rule, any short
// start of a sentence before a colon would count ("and Bob: hi"). Scripts
// that have no capitals, such as Chinese or Arabic, are not affected.
//
// YouTube captions mark a change of speaker with ">>" at the start of a line
// and give no name. That counts as a change with no name attached, unless a
// label follows it (">> JOHN: hi"), in which case the label is used and the
// ">>" is remembered as a fallback.
//
// The reader never sees line breaks: ReaderSession squeezes all whitespace
// into single spaces before it splits the words. So this module reads the
// raw text line by line, and counts words exactly the way the reader does,
// so a label's position here is the same word number the reader uses.
// scanSpeakers() also returns how many words it counted, so the caller can
// check the two agree before trusting the positions.
//
// The label word itself stays in the text. "Interviewer:" is still flashed
// as a word, so word numbers, saved positions and bookmarks are the same
// with Speaker cues on or off.

import { stripTimestamps } from './parser';
import {
  PY_SPACE,
  PY_WORD,
  PY_WORD_NOT_DIGIT,
  characters,
  isPyLower,
  pyCasefold,
  pyLength,
  pyLstrip,
  pyRstrip,
  pySplit,
  pySqueeze,
} from './pythonText';

// The speaker given to a turn that starts with ">>" and has no label in use.
// Real label keys always start with a letter, so this cannot clash with one.
export const UNNAMED_SPEAKER = '>>';

// A label this long or longer is more likely the start of a sentence than a
// name.
export const MAX_LABEL_CHARS = 30;
export const MAX_LABEL_WORDS = 4;

// In Auto, a label has to appear at least this many times to count as a
// speaker. Real speakers almost always speak more than once.
export const AUTO_MIN_APPEARANCES = 2;

// A label: a letter first, then letters, digits, spaces, dots, apostrophes
// (straight or curly) and hyphens, then a colon with a space or the end of
// the line after it. Commas, question marks and the like are not allowed,
// so "Wait, Bob:" does not count. A space before the colon is fine
// ("Speaker 2 :"): it is part of the match and gets squeezed out of the name.
const LABEL = new RegExp(
  `^([${PY_WORD_NOT_DIGIT}][${PY_WORD} .'\\u2019-]*):(?=[${PY_SPACE}]|$)`,
  'u',
);

// ">>" at the start of a line, but not ">>>" (that is more likely quoted
// text from an email than a caption).
const CHANGE_MARK = new RegExp(`^>>(?!>)[${PY_SPACE}]*`, 'u');

// Only these end a line for the purpose of finding labels. Every one of
// them is also whitespace to the tokenizer, so splitting here never changes
// which words the reader sees.
const LINE_BREAK = /\r\n|\r|\n/u;

/**
 * A speaker list: label key to the name shown for that speaker. Two keys
 * with the same name are one speaker.
 */
export type SpeakerList = ReadonlyMap<string, string>;

/** One line that starts with a label or a ">>". */
export interface LabelHit {
  /** The reader's word number of the line's first word. */
  readonly wordIndex: number;
  /** The label as labelKey() makes it, or null for a ">>" with no label. */
  readonly key: string | null;
  /** The label as written, with spaces squeezed. Empty when there is none. */
  readonly name: string;
  /** Whether the line started with ">>". */
  readonly marked: boolean;
}

/** What scanSpeakers() found: every hit in reading order, and the word count. */
export interface SpeakerScan {
  readonly wordCount: number;
  readonly hits: readonly LabelHit[];
}

/** A speaker found in the text: its key, its name as first written, and how many lines it starts. */
export interface SpeakerCandidate {
  readonly key: string;
  readonly name: string;
  readonly appearances: number;
}

/**
 * Who is speaking where. starts[i] is the word number a turn begins at, and
 * speakers[i] is who speaks in it (UNNAMED_SPEAKER for a ">>" turn). starts
 * is sorted and has no repeats. Words before the first turn belong to no one.
 */
export class SpeakerTurns {
  readonly starts: readonly number[];
  readonly speakers: readonly string[];

  constructor(starts: readonly number[] = [], speakers: readonly string[] = []) {
    this.starts = starts;
    this.speakers = speakers;
  }

  /** Who is speaking at this word, or null before the first turn. */
  speakerAt(wordIndex: number): string | null {
    // The last turn that starts at or before this word.
    let turn = -1;
    for (let i = 0; i < this.starts.length; i += 1) {
      if ((this.starts[i] ?? Infinity) > wordIndex) break;
      turn = i;
    }
    return turn >= 0 ? (this.speakers[turn] ?? null) : null;
  }

  /** Whether a new turn begins at this word. */
  isTurnStart(wordIndex: number): boolean {
    return this.starts.includes(wordIndex);
  }
}

/**
 * The form used to match labels, so "INTERVIEWER", "Interviewer" and
 * "Interviewer " are one speaker.
 */
export function labelKey(name: string): string {
  return pyCasefold(pySqueeze(name));
}

/**
 * A transcript's own speaker list made safe to use, for when it comes from
 * a save file, an import or the settings.
 *
 * null means Auto and stays null. So does anything that is not a list of
 * names at all, so a damaged value falls back to Auto and not to "no
 * speakers". Inside a list, an entry is kept only when its key is a label
 * key the way labelKey() makes it, and its name, with spaces squeezed, is 1
 * to MAX_LABEL_CHARS characters long. Anything else is dropped on its own,
 * so one bad entry does not cost the rest. An empty list stays empty: Custom
 * with every speaker switched off is a real choice. The answer is always a
 * new list, never the one passed in.
 *
 * Takes a plain object, which is what saved JSON gives, or a Map.
 */
export function cleanCustomSpeakers(value: unknown): Map<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const entries: Iterable<[unknown, unknown]> =
    value instanceof Map ? value.entries() : Object.entries(value);
  const cleaned = new Map<string, string>();
  for (const [key, name] of entries) {
    if (typeof key !== 'string' || key === '' || key !== labelKey(key)) continue;
    if (typeof name !== 'string') continue;
    const squeezed = pySqueeze(name);
    const length = pyLength(squeezed);
    if (length > 0 && length <= MAX_LABEL_CHARS) {
      cleaned.set(key, squeezed);
    }
  }
  return cleaned;
}

/** The label at the start of text, as written with spaces squeezed, or null. */
function readLabel(text: string): string | null {
  const match = LABEL.exec(text);
  if (match === null) return null;
  const name = pySqueeze(match[1] ?? '');
  if (isPyLower(characters(name)[0] ?? '')) return null;
  if (pyLength(name) > MAX_LABEL_CHARS || pySplit(name).length > MAX_LABEL_WORDS) return null;
  return name;
}

/**
 * Find every line that starts with a label or a ">>", with the word number
 * (as the reader counts) of that line's first word.
 */
export function scanSpeakers(rawText: string): SpeakerScan {
  // Timestamps go first, over the whole text, exactly as cleanTranscript()
  // does, so both see the same words.
  const text = stripTimestamps(rawText);
  const hits: LabelHit[] = [];
  let wordCount = 0;
  for (const line of text.split(LINE_BREAK)) {
    const wordsInLine = pySplit(line).length;
    let rest = pyLstrip(line);
    const change = CHANGE_MARK.exec(rest);
    if (change !== null) {
      rest = rest.slice(change[0].length);
    }
    const name = readLabel(rest);
    if (name !== null) {
      hits.push({ wordIndex: wordCount, key: labelKey(name), name, marked: change !== null });
    } else if (change !== null) {
      hits.push({ wordIndex: wordCount, key: null, name: '', marked: true });
    }
    wordCount += wordsInLine;
  }
  return { wordCount, hits };
}

/**
 * Every label found, in order of first appearance, with how many lines it
 * starts and its name as first written.
 */
export function speakerCandidates(scan: SpeakerScan): SpeakerCandidate[] {
  const names = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const hit of scan.hits) {
    if (hit.key === null) continue;
    if (!names.has(hit.key)) names.set(hit.key, hit.name);
    counts.set(hit.key, (counts.get(hit.key) ?? 0) + 1);
  }
  return Array.from(names, ([key, name]) => ({ key, name, appearances: counts.get(key) ?? 0 }));
}

/**
 * What Auto switches on: every label that appears at least
 * AUTO_MIN_APPEARANCES times, each its own speaker, named the way it was
 * first written. The same shape a Custom list has, so either one goes
 * straight into buildTurns().
 */
export function autoSpeakers(candidates: readonly SpeakerCandidate[]): Map<string, string> {
  const chosen = new Map<string, string>();
  for (const candidate of candidates) {
    if (candidate.appearances >= AUTO_MIN_APPEARANCES) {
      chosen.set(candidate.key, candidate.name);
    }
  }
  return chosen;
}

/**
 * One line of the speaker list in the speaker cues settings: a label found
 * in the transcript, how many lines it starts, whether it is ticked
 * (switched on) and the name it is shown with.
 */
export interface SpeakerRow {
  readonly key: string;
  readonly label: string;
  readonly appearances: number;
  readonly ticked: boolean;
  readonly name: string;
}

/**
 * The rows to show for a transcript: every label found in rawText, the ones
 * seen only once included, in order of first appearance. A row is ticked and
 * named the way the transcript's own list has it, or the way Auto would when
 * it has no list of its own (null). A row that is not in the list shows its
 * label as its name, ready to be ticked.
 */
export function speakerRows(rawText: string, custom: SpeakerList | null = null): SpeakerRow[] {
  const candidates = speakerCandidates(scanSpeakers(rawText));
  const chosen = custom !== null ? custom : autoSpeakers(candidates);
  return candidates.map((candidate) => ({
    key: candidate.key,
    label: candidate.name,
    appearances: candidate.appearances,
    ticked: chosen.has(candidate.key),
    name: chosen.get(candidate.key) ?? candidate.name,
  }));
}

/**
 * The name a row is saved with: what was typed, with its spaces squeezed and
 * cut to MAX_LABEL_CHARS, or the label itself when the box was left empty.
 * Two rows saved with the same name are one speaker.
 */
export function speakerRowName(row: SpeakerRow): string {
  const cut = characters(pySqueeze(row.name)).slice(0, MAX_LABEL_CHARS).join('');
  const name = pyRstrip(cut);
  return name !== '' ? name : row.label;
}

function sameList(a: SpeakerList, b: SpeakerList): boolean {
  if (a.size !== b.size) return false;
  for (const [key, name] of a) {
    if (!b.has(key) || b.get(key) !== name) return false;
  }
  return true;
}

/**
 * What gets saved as the transcript's speaker list: every ticked row, by its
 * key, with speakerRowName() as the name.
 *
 * When that is exactly what Auto picks anyway, the answer is null
 * (Automatic) and not a Custom list that happens to match. So ticking a box
 * and unticking it again leaves the transcript on Automatic, and it keeps
 * following the text if the text changes later.
 */
export function speakersToSave(rows: Iterable<SpeakerRow>): Map<string, string> | null {
  const chosen = new Map<string, string>();
  const auto = new Map<string, string>();
  for (const row of rows) {
    if (row.ticked) chosen.set(row.key, speakerRowName(row));
    if (row.appearances >= AUTO_MIN_APPEARANCES) auto.set(row.key, row.label);
  }
  return sameList(chosen, auto) ? null : chosen;
}

/**
 * The speaker list a whole transcript is read with: its own Custom list when
 * it has one (even an empty one), otherwise what Auto finds in rawText.
 *
 * A selection played on its own is read with this list, worked out from the
 * whole transcript, and not with one worked out from the selection alone. A
 * short selection often holds each label only once, so Auto would switch
 * none of them on. Always a new list.
 */
export function transcriptSpeakers(
  rawText: string,
  custom: SpeakerList | null = null,
): Map<string, string> {
  if (custom !== null) return new Map(custom);
  return autoSpeakers(speakerCandidates(scanSpeakers(rawText)));
}

/**
 * Turn the hits into turns.
 *
 * speakerOf maps each label key that is switched on to the speaker it
 * belongs to. A label that is not in it is ignored, as if it were ordinary
 * text, except that a ">>" in front of it still marks an unnamed change. A
 * turn by the same named speaker as the one before it is not a change, so it
 * is folded into that one. Two ">>" in a row stay two changes, since there
 * is no telling whether it is the same person.
 */
export function buildTurns(scan: SpeakerScan, speakerOf: SpeakerList): SpeakerTurns {
  const starts: number[] = [];
  const speakers: string[] = [];
  for (const hit of scan.hits) {
    let speaker = hit.key !== null ? (speakerOf.get(hit.key) ?? null) : null;
    if (speaker === null) {
      if (!hit.marked) continue;
      speaker = UNNAMED_SPEAKER;
    }
    if (speaker === speakers[speakers.length - 1] && speaker !== UNNAMED_SPEAKER) continue;
    starts.push(hit.wordIndex);
    speakers.push(speaker);
  }
  return new SpeakerTurns(starts, speakers);
}
