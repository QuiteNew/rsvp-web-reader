// Port of core/reader.py.

import { getOrpIndexForLength, splitAtOrp, type OrpWord } from './orp';
import { cleanTranscript } from './parser';
import { PACE_SENTENCE, classifyPacing, splitPunctuation } from './punctuation';
import { pyLength, pyRound } from './pythonText';
import {
  SpeakerTurns,
  autoSpeakers,
  buildTurns,
  cleanCustomSpeakers,
  scanSpeakers,
  speakerCandidates,
} from './speakers';
import {
  SPEAKER_PAUSE_MULTIPLIER,
  applyLengthMultiplier,
  applyWarmUp,
  effectivePacingLength,
  lengthMultiplier,
  pacingMultiplier,
  wpmToDelayMs,
} from './timing';
import { tokenize } from './tokenizer';

// Soft upper bound on the characters (words plus the single spaces between
// them) a chunk may hold in fixed chunking mode. A chunk stops before a word
// that would push it past this, so a run of long words does not overflow the
// reading area. It never gives an empty chunk: a lone word longer than the
// cap still forms a one-word chunk. In adaptive mode the transcript's own
// chunkCharTarget plays this role instead.
export const CHUNK_CHAR_CAP = 30;

// Chunk sizing modes. "fixed" groups up to chunkSize words. "adaptive" fills
// each chunk up to chunkCharTarget characters, capped at ADAPTIVE_MAX_WORDS
// words.
export const CHUNK_MODE_FIXED = 'fixed';
export const CHUNK_MODE_ADAPTIVE = 'adaptive';

// Hard ceiling on how many words one adaptive chunk may hold, whatever the
// character target, so a run of very short words ("a is of to it") cannot
// pile an absurd number into a single flash.
export const ADAPTIVE_MAX_WORDS = 6;

/**
 * The words around the current one, for the surrounding-words line: `before`
 * in reading order, the `current` word (null when the session is finished or
 * empty), and `after` in reading order.
 */
export interface PeripheralContext {
  readonly before: string[];
  readonly current: string | null;
  readonly after: string[];
}

/** A chunk's on-screen text, split the way the reader draws it. */
export interface ChunkText {
  readonly before: string;
  readonly focus: string;
  readonly after: string;
}

/** A chunk as a range of word numbers. `end` is one past its last word. */
export type ChunkRange = readonly [start: number, end: number];

/** What a ReaderSession can be made with. Everything is optional. */
export interface ReaderOptions {
  readonly wpm?: number;
  readonly startIndex?: number;
  readonly lengthPacingEnabled?: boolean;
  readonly warmUpEnabled?: boolean;
  readonly chunkEnabled?: boolean;
  readonly chunkSize?: number;
  readonly chunkMode?: string;
  readonly chunkCharTarget?: number;
  readonly speakerCuesEnabled?: boolean;
  /**
   * The transcript's own speaker list, as saved (a plain object or a Map),
   * or null for the automatic one. It is cleaned before use, so a damaged
   * value is safe to pass.
   */
  readonly speakerCustom?: unknown;
}

/**
 * Put a chunk's text together as before, focus and after, the exact split
 * the reader draws: only the chunk's first word keeps its own before, focus
 * and after, and every later word trails inside the after part behind a
 * single space. With one frame this is just that frame's own split. Three
 * empty strings for an empty list, which a real chunk never is. It lives
 * next to how chunks are built so that drawing a flash and measuring how
 * wide it is share one definition of a chunk's text.
 */
export function assembleChunkText(frames: readonly OrpWord[]): ChunkText {
  const first = frames[0];
  if (first === undefined) {
    return { before: '', focus: '', after: '' };
  }
  let after = first.after;
  if (frames.length > 1) {
    const trailing = frames
      .slice(1)
      .map((frame) => frame.before + frame.focus + frame.after)
      .join(' ');
    after = `${first.after} ${trailing}`;
  }
  return { before: first.before, focus: first.focus, after };
}

/**
 * Holds a tokenized, ORP-split transcript and tracks the playback position.
 *
 * When chunking is on, the words are grouped into chunks and the reader
 * advances a whole chunk at a time. "fixed" mode groups up to chunkSize
 * words, "adaptive" fills each chunk up to chunkCharTarget characters,
 * capped at ADAPTIVE_MAX_WORDS words. Either way the word index stays the
 * real position: advancing, skipping and seeking all land on a chunk's first
 * word, so a saved position or bookmark (a word index) stays valid, and
 * turning chunking off just reads the same words one at a time. With
 * chunking off every chunk is a single word.
 *
 * When Speaker cues is on, the session also knows who is speaking where in a
 * labelled transcript (see speakers.ts): the transcript's own speaker list
 * when it has one, otherwise the automatic one. The last word of each
 * speaker's turn gets a longer pause, so the beat falls before the next
 * speaker, and a chunk never runs on into a new speaker's turn. The words
 * themselves never change, so positions and bookmarks mean the same with
 * cues on or off. With cues off none of this happens.
 *
 * The session owns no timer. It says how long a word stays on screen, and
 * the engine layer does the waiting.
 */
export class ReaderSession {
  /** Every word, split around its ORP letter. Fixed once built. */
  readonly frames: readonly OrpWord[];
  /** The current word number. Equal to totalWords once finished. */
  index: number;
  wpm: number;
  lengthPacingEnabled: boolean;
  warmUpEnabled: boolean;
  chunkingEnabled: boolean;
  chunkSize: number;
  chunkMode: string;
  chunkCharTarget: number;
  speakerCuesEnabled: boolean;
  speakerCustom: Map<string, string> | null;

  // Built together with frames, in one loop, so the three stay in step.
  private readonly paces: readonly string[];
  private readonly lengthBands: readonly number[];
  // Kept for Speaker cues, which reads the labels line by line from the raw
  // text (the words have lost their line breaks).
  private readonly rawText: string;

  private turns: SpeakerTurns = new SpeakerTurns();
  private turnEnds: ReadonlySet<number> = new Set();
  private pauseMults: number[] = [];
  private suffixPunctMult: number[] = [0];
  private suffixPacedMult: number[] = [0];
  private chunks: ChunkRange[] = [];
  private chunkBoundsOfWord: ChunkRange[] = [];
  // How many words have been shown since this session began, used to place
  // the warm-up ramp. It counts words advanced past, not the word index, so
  // starting in the middle still eases in and skipping does not restart the
  // ramp. reset() sets it back to zero.
  private wordsShown = 0;

  constructor(rawText: string, options: ReaderOptions = {}) {
    const words = tokenize(cleanTranscript(rawText));

    const frames: OrpWord[] = [];
    const paces: string[] = [];
    const lengthBands: number[] = [];
    for (const word of words) {
      const { leading, core, trailing } = splitPunctuation(word);
      // A token that is all punctuation, such as a lone "--", has no core
      // to find an ORP letter in or to measure. The whole token stands in
      // for both, so this never fails on an empty word.
      const orpSubject = core !== '' ? core : word;
      let frame = splitAtOrp(orpSubject);
      if (core !== '') {
        frame = {
          before: leading + frame.before,
          focus: frame.focus,
          after: frame.after + trailing,
        };
      }
      frames.push(frame);
      paces.push(classifyPacing(leading + trailing));
      lengthBands.push(getOrpIndexForLength(effectivePacingLength(orpSubject)));
    }
    this.frames = frames;
    this.paces = paces;
    this.lengthBands = lengthBands;
    this.rawText = rawText;

    this.wpm = options.wpm ?? 300;
    this.lengthPacingEnabled = options.lengthPacingEnabled ?? false;
    this.warmUpEnabled = options.warmUpEnabled ?? false;
    this.chunkingEnabled = options.chunkEnabled ?? false;
    this.chunkSize = options.chunkSize ?? 2;
    this.chunkMode = options.chunkMode ?? CHUNK_MODE_FIXED;
    this.chunkCharTarget = options.chunkCharTarget ?? 30;
    this.speakerCuesEnabled = options.speakerCuesEnabled ?? false;
    this.speakerCustom = cleanCustomSpeakers(options.speakerCustom);

    // The speakers come first, because a chunk never crosses into a new
    // speaker's turn.
    this.rebuildSpeakers();
    this.rebuildChunks();

    // Clamp the start position, then snap it to the start of the chunk that
    // holds it, so a session always begins on a chunk boundary.
    const total = this.frames.length;
    let start = Math.max(0, Math.min(options.startIndex ?? 0, total));
    if (start < total) {
      start = this.boundsOf(start)[0];
    }
    this.index = start;
  }

  /**
   * The most words and the most characters one chunk may reach, from the
   * current chunking settings. One place for the fixed and adaptive rules.
   */
  private chunkLimits(): [maxWords: number, charLimit: number] {
    if (!this.chunkingEnabled) return [1, CHUNK_CHAR_CAP];
    if (this.chunkMode === CHUNK_MODE_ADAPTIVE) return [ADAPTIVE_MAX_WORDS, this.chunkCharTarget];
    return [this.chunkSize, CHUNK_CHAR_CAP];
  }

  /**
   * Who speaks where, or no turns at all while Speaker cues is off.
   *
   * The speaker scan counts words the same way this session does, so the
   * two always agree. If they ever did not, the scan's positions could not
   * be trusted, and no turns at all is better than cues on the wrong words.
   */
  private findSpeakerTurns(): SpeakerTurns {
    if (!this.speakerCuesEnabled) return new SpeakerTurns();
    const scan = scanSpeakers(this.rawText);
    if (scan.wordCount !== this.frames.length) return new SpeakerTurns();
    const speakerOf = this.speakerCustom ?? autoSpeakers(speakerCandidates(scan));
    return buildTurns(scan, speakerOf);
  }

  /**
   * Work out the speaker turns, then each word's pause and the
   * remaining-time tables built from those pauses.
   *
   * A word's pause is its punctuation pause, except for the last word of a
   * speaker's turn, which gets SPEAKER_PAUSE_MULTIPLIER when that is longer.
   *
   * The tables hold each word's delay multiplier, summed from each position
   * to the end, so remainingMs() is one lookup and does not depend on the
   * speed. Two tables: the pause alone, and the pause combined with length
   * pacing (the larger of the two per word). Warm-up is left out on
   * purpose: it is a short ramp at the start, and leaving it out keeps the
   * estimate steady. Chunking does not change these, since a chunk's time
   * is the sum of its words' delays.
   */
  private rebuildSpeakers(): void {
    this.turns = this.findSpeakerTurns();
    this.turnEnds = new Set(
      this.turns.starts.filter((start) => start > 0).map((start) => start - 1),
    );
    const total = this.frames.length;
    this.pauseMults = this.paces.map((pace) => pacingMultiplier(pace));
    for (const end of this.turnEnds) {
      this.pauseMults[end] = Math.max(this.pauseMults[end] ?? 1, SPEAKER_PAUSE_MULTIPLIER);
    }
    this.suffixPunctMult = new Array<number>(total + 1).fill(0);
    this.suffixPacedMult = new Array<number>(total + 1).fill(0);
    for (let i = total - 1; i >= 0; i -= 1) {
      const pause = this.pauseMults[i] ?? 1;
      const paced = Math.max(pause, lengthMultiplier(this.lengthBands[i] ?? 0));
      this.suffixPunctMult[i] = (this.suffixPunctMult[i + 1] ?? 0) + pause;
      this.suffixPacedMult[i] = (this.suffixPacedMult[i + 1] ?? 0) + paced;
    }
  }

  /**
   * Group the words into chunks, left to right. The current chunk closes
   * when it has reached maxWords words, when the word just added ends a
   * sentence, when the word just added is the last of a speaker's turn, or
   * when the next word would push it past charLimit characters (words plus
   * the single spaces between them). The first word of a chunk is always
   * taken, so one word longer than the limit still forms a chunk.
   */
  private buildChunks(maxWords: number, charLimit: number): ChunkRange[] {
    const total = this.frames.length;
    const chunks: ChunkRange[] = [];
    let start = 0;
    while (start < total) {
      let i = start;
      let charCount = 0;
      while (i < total) {
        const frame = this.frames[i];
        if (frame === undefined) break;
        const wordLength = pyLength(frame.before) + pyLength(frame.focus) + pyLength(frame.after);
        const projected = charCount + (i === start ? 0 : 1) + wordLength;
        if (i > start && projected > charLimit) break;
        charCount = projected;
        i += 1;
        if (i - start >= maxWords) break;
        if (this.paces[i - 1] === PACE_SENTENCE) break;
        if (this.turnEnds.has(i - 1)) break;
      }
      chunks.push([start, i]);
      start = i;
    }
    return chunks;
  }

  /** Work the chunks out again from the current chunking settings. */
  private rebuildChunks(): void {
    const [maxWords, charLimit] = this.chunkLimits();
    this.chunks = this.buildChunks(maxWords, charLimit);
    this.chunkBoundsOfWord = [];
    for (const chunk of this.chunks) {
      for (let word = chunk[0]; word < chunk[1]; word += 1) {
        this.chunkBoundsOfWord[word] = chunk;
      }
    }
  }

  private boundsOf(wordIndex: number): ChunkRange {
    return this.chunkBoundsOfWord[wordIndex] ?? [0, 0];
  }

  get totalWords(): number {
    return this.frames.length;
  }

  get isFinished(): boolean {
    return this.index >= this.totalWords;
  }

  /** The word ranges of every chunk, in order. One range per word with chunking off. */
  chunkRanges(): ChunkRange[] {
    return [...this.chunks];
  }

  /**
   * The text of every chunk, in order, split the way the reader draws it.
   * It covers the whole transcript, not just the chunk on screen, so the
   * display can measure the widest chunk once and fit the font to it.
   */
  chunkTexts(): ChunkText[] {
    return this.chunks.map(([start, end]) => assembleChunkText(this.frames.slice(start, end)));
  }

  /** Who speaks where. Empty while Speaker cues is off, or when the text has no speakers. */
  get speakerTurns(): SpeakerTurns {
    return this.turns;
  }

  /**
   * Who is speaking at the current word: the name shown for that speaker,
   * UNNAMED_SPEAKER for a ">>" change, or null before the first turn, while
   * Speaker cues is off, or once finished.
   */
  get currentSpeaker(): string | null {
    if (this.isFinished) return null;
    return this.turns.speakerAt(this.index);
  }

  currentFrame(): OrpWord | null {
    if (this.isFinished) return null;
    return this.frames[this.index] ?? null;
  }

  /**
   * The frames of the chunk now on screen, in reading order, or null when
   * finished. The first frame is the one whose ORP letter the reader pins
   * and highlights, the rest trail to its right.
   */
  currentChunk(): OrpWord[] | null {
    if (this.isFinished) return null;
    const [start, end] = this.boundsOf(this.index);
    return this.frames.slice(start, end);
  }

  /** The word range of the chunk now on screen, or null when finished. */
  currentChunkBounds(): ChunkRange | null {
    if (this.isFinished) return null;
    return this.boundsOf(this.index);
  }

  /** The plain text of a word, punctuation included, as the reader shows it. */
  private wordAt(wordIndex: number): string {
    const frame = this.frames[wordIndex];
    return frame === undefined ? '' : frame.before + frame.focus + frame.after;
  }

  private wordsBetween(start: number, end: number): string[] {
    const words: string[] = [];
    for (let word = start; word < end; word += 1) {
      words.push(this.wordAt(word));
    }
    return words;
  }

  /**
   * The words right around the current one: up to `before` words in front
   * of it, the current word, and up to `after` words behind it. Near the
   * start or end there are simply fewer. It never moves the position.
   */
  peripheralContext(before: number, after: number): PeripheralContext {
    const wantBefore = Math.max(0, before);
    const wantAfter = Math.max(0, after);
    if (this.isFinished || this.totalWords === 0) {
      return { before: [], current: null, after: [] };
    }
    const start = Math.max(0, this.index - wantBefore);
    const end = Math.min(this.totalWords, this.index + 1 + wantAfter);
    return {
      before: this.wordsBetween(start, this.index),
      current: this.wordAt(this.index),
      after: this.wordsBetween(this.index + 1, end),
    };
  }

  /**
   * The same for a chunk: `before` words in front of the chunk's first
   * word and `after` words behind its last, so the line shows what is
   * around the whole chunk and not words already on screen. `current` is
   * the chunk's first word.
   */
  chunkPeripheralContext(before: number, after: number): PeripheralContext {
    const wantBefore = Math.max(0, before);
    const wantAfter = Math.max(0, after);
    if (this.isFinished || this.totalWords === 0) {
      return { before: [], current: null, after: [] };
    }
    const [start, end] = this.boundsOf(this.index);
    return {
      before: this.wordsBetween(Math.max(0, start - wantBefore), start),
      current: this.wordAt(start),
      after: this.wordsBetween(end, Math.min(this.totalWords, end + wantAfter)),
    };
  }

  /**
   * One word's delay from the speed and the pacing, before the warm-up
   * ramp. With length pacing off it is the base delay with the word's
   * pause. With it on, the larger of that and the long-word delay, since
   * the two do not stack.
   */
  private pacedDelayAt(wordIndex: number): number {
    const base = wpmToDelayMs(this.wpm);
    const punctuationDelay = pyRound(base * (this.pauseMults[wordIndex] ?? 1));
    if (!this.lengthPacingEnabled) return punctuationDelay;
    const lengthDelay = applyLengthMultiplier(base, this.lengthBands[wordIndex] ?? 0);
    return Math.max(punctuationDelay, lengthDelay);
  }

  /**
   * One word's delay on screen: pacing plus the warm-up ramp. wordsShown is
   * passed in so a chunk can age each of its words in turn, which keeps
   * the chunk's total time equal to the same words read one at a time.
   */
  private delayAt(wordIndex: number, wordsShown: number): number {
    const paced = this.pacedDelayAt(wordIndex);
    return this.warmUpEnabled ? applyWarmUp(paced, wordsShown) : paced;
  }

  currentDelayMs(): number {
    const base = wpmToDelayMs(this.wpm);
    if (this.isFinished) return base;
    return this.delayAt(this.index, this.wordsShown);
  }

  /**
   * How long the current chunk stays on screen: the sum of its words'
   * delays, so the speed stays exactly true and a pause inside the chunk is
   * counted and lands at its end. Equal to currentDelayMs() with chunking
   * off.
   */
  currentChunkDelayMs(): number {
    const base = wpmToDelayMs(this.wpm);
    if (this.isFinished) return base;
    const [start, end] = this.boundsOf(this.index);
    let total = 0;
    for (let word = start; word < end; word += 1) {
      total += this.delayAt(word, this.wordsShown + (word - start));
    }
    return total;
  }

  /**
   * The estimated time, in milliseconds, to read from the current word to
   * the end at the current speed. It includes the word on screen and the
   * pauses playback will make, leaves out the warm-up ramp, and is 0 once
   * finished.
   */
  remainingMs(): number {
    const base = wpmToDelayMs(this.wpm);
    const suffix = this.lengthPacingEnabled ? this.suffixPacedMult : this.suffixPunctMult;
    return pyRound(base * (suffix[this.index] ?? 0));
  }

  /** Move to the first word of the next chunk, and age the warm-up ramp by the words passed. */
  advance(): void {
    if (this.isFinished) return;
    const end = this.boundsOf(this.index)[1];
    this.wordsShown += end - this.index;
    this.index = end;
  }

  /**
   * Jump by delta words, backward for a negative number. It cannot land
   * before the first word or past the last, and it snaps to the start of
   * the chunk that holds the landed word. The warm-up position is left
   * alone, so skipping never restarts the ramp.
   */
  seek(delta: number): void {
    let landed = Math.max(0, Math.min(this.totalWords, this.index + delta));
    if (landed < this.totalWords) {
      landed = this.boundsOf(landed)[0];
    }
    this.index = landed;
  }

  /**
   * Jump straight to a word number. Built on seek(), so it clamps and
   * snaps the same way. Seeking back from a finished session un-finishes
   * it. Used by the progress scrubber.
   */
  seekTo(index: number): void {
    this.seek(index - this.index);
  }

  /** Back to the first word, with the warm-up ramp starting over. */
  reset(): void {
    this.index = 0;
    this.wordsShown = 0;
  }

  setWpm(newWpm: number): void {
    this.wpm = newWpm;
  }

  setLengthPacingEnabled(enabled: boolean): void {
    this.lengthPacingEnabled = enabled;
  }

  setWarmUpEnabled(enabled: boolean): void {
    this.warmUpEnabled = enabled;
  }

  /**
   * Group this session's words again with new chunking settings, in place.
   * The reading position is kept as a word and snapped to the start of the
   * chunk that now holds it. The warm-up ramp is left alone.
   *
   * enabled and size always apply. mode and charTarget keep what the
   * session already has when left out or null. A finished session keeps
   * its position.
   */
  setChunking(
    enabled: boolean,
    size: number,
    mode: string | null = null,
    charTarget: number | null = null,
  ): void {
    this.chunkingEnabled = enabled;
    this.chunkSize = size;
    if (mode !== null) this.chunkMode = mode;
    if (charTarget !== null) this.chunkCharTarget = charTarget;
    this.rebuildChunks();
    this.snapToChunkStart();
  }

  /**
   * Turn Speaker cues on or off for this session, or give it another
   * speaker list (null for the automatic one), in place. The turns, pauses
   * and time tables are worked out again, then the chunks, and the current
   * word snaps to the start of the chunk that now holds it. The warm-up
   * ramp is left alone. A finished session keeps its position.
   */
  setSpeakerCues(enabled: boolean, custom: unknown = null): void {
    this.speakerCuesEnabled = enabled;
    this.speakerCustom = cleanCustomSpeakers(custom);
    this.rebuildSpeakers();
    this.rebuildChunks();
    this.snapToChunkStart();
  }

  private snapToChunkStart(): void {
    if (this.index < this.totalWords) {
      this.index = this.boundsOf(this.index)[0];
    }
  }
}
