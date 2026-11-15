// Port of core/timing.py.

import { pyLength, pyRound } from './pythonText';
import { PACE_CLAUSE, PACE_SENTENCE } from './punctuation';

// Multipliers applied on top of the flat per-word delay when a word's
// punctuation marks a sentence or clause boundary.
//
// They are multipliers rather than a flat number of added milliseconds
// because a flat +200 ms would be nearly invisible at 100 WPM (600 ms per
// word) and huge at 1000 WPM (60 ms per word). A multiplier keeps the pause
// feeling the same relative size across the whole speed range.
//
// The values are the desktop app's. They have to stay equal to it, or the
// fixtures stop matching.
export const SENTENCE_PAUSE_MULTIPLIER = 2.5;
export const CLAUSE_PAUSE_MULTIPLIER = 1.5;

// The pause before a new speaker, used only while Speaker cues is on. It
// goes on the last word of a speaker's turn, in place of that word's own
// pause when it is longer. Larger than the sentence pause on purpose, so a
// turn that ends with a full stop still gets a clear extra beat.
export const SPEAKER_PAUSE_MULTIPLIER = 3.5;

// Multipliers for a long word, when length-aware pacing is on. The bands
// are the same length boundaries orp.ts uses for the ORP letter. Kept
// gentler than the punctuation multipliers, because only the larger of the
// two ever applies to one word.
export const MEDIUM_WORD_MULTIPLIER = 1.2; // length band 2 (6 to 9 letters)
export const LONG_WORD_MULTIPLIER = 1.45; // length band 3 (10 to 13 letters)
export const VERY_LONG_WORD_MULTIPLIER = 1.7; // length band 4 (14 or more)

// How many extra characters each hyphen inside a word counts for when its
// length band is worked out for pacing. "sub-terrain" reads more like two
// words than one, so it earns extra length. It never moves the ORP letter.
export const HYPHEN_PACING_BONUS_CHARS = 4;

// The warm-up ramp. When warm-up is on, the first words of a session play
// slower and speed up to the normal rate. Linear from the start multiplier
// at the first word down to 1.0 once WARM_UP_WORD_COUNT words were shown.
export const WARM_UP_START_MULTIPLIER = 2.0;
export const WARM_UP_WORD_COUNT = 20;

/** Convert a words-per-minute rate into a per-word delay in milliseconds. */
export function wpmToDelayMs(wpm: number): number {
  if (wpm <= 0) {
    throw new RangeError('WPM must be greater than zero');
  }
  return pyRound(60000 / wpm);
}

/**
 * The raw delay multiplier for a word's pacing class. PACE_NONE and any
 * value it does not know return 1.0, so an unknown or future pacing value
 * means "no extra pause" and cannot crash playback.
 */
export function pacingMultiplier(pace: string): number {
  if (pace === PACE_SENTENCE) return SENTENCE_PAUSE_MULTIPLIER;
  if (pace === PACE_CLAUSE) return CLAUSE_PAUSE_MULTIPLIER;
  return 1.0;
}

/** Scale a base delay up for a word that ends a sentence or clause. */
export function applyPacingMultiplier(baseDelayMs: number, pace: string): number {
  return pyRound(baseDelayMs * pacingMultiplier(pace));
}

/**
 * The length to use when banding a word for length-aware pacing: its real
 * length in characters, plus HYPHEN_PACING_BONUS_CHARS for each hyphen.
 */
export function effectivePacingLength(word: string): number {
  const hyphens = word.split('-').length - 1;
  return pyLength(word) + HYPHEN_PACING_BONUS_CHARS * hyphens;
}

/**
 * The raw delay multiplier for a word's length band. 1.0 for the two
 * shortest bands and for anything out of range below them. Checked from the
 * top down, so a band above 4 still gets the top multiplier.
 */
export function lengthMultiplier(lengthBand: number): number {
  if (lengthBand >= 4) return VERY_LONG_WORD_MULTIPLIER;
  if (lengthBand === 3) return LONG_WORD_MULTIPLIER;
  if (lengthBand === 2) return MEDIUM_WORD_MULTIPLIER;
  return 1.0;
}

/** Scale a base delay up for a long word. */
export function applyLengthMultiplier(baseDelayMs: number, lengthBand: number): number {
  return pyRound(baseDelayMs * lengthMultiplier(lengthBand));
}

/**
 * The warm-up delay multiplier for a word this many words into the session.
 * Never below 1.0, so warm-up only ever slows the start down, even if
 * wordsShown is somehow negative.
 */
export function warmUpMultiplier(wordsShown: number): number {
  if (wordsShown >= WARM_UP_WORD_COUNT) return 1.0;
  if (wordsShown <= 0) return WARM_UP_START_MULTIPLIER;
  const remainingFraction = (WARM_UP_WORD_COUNT - wordsShown) / WARM_UP_WORD_COUNT;
  return 1.0 + (WARM_UP_START_MULTIPLIER - 1.0) * remainingFraction;
}

/** Scale a delay up by the warm-up ramp. Applied last, after the other pacing. */
export function applyWarmUp(baseDelayMs: number, wordsShown: number): number {
  return pyRound(baseDelayMs * warmUpMultiplier(wordsShown));
}

/**
 * Format a whole number of seconds as a short duration: "0s", "45s",
 * "12m 34s" or "1h 05m". The unit only changes once each threshold is
 * crossed, so a short span never shows "0h 00m".
 */
export function formatDuration(totalSeconds: number): string {
  const total = Math.max(0, totalSeconds);
  if (total < 60) return `${total}s`;
  const allMinutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (allMinutes < 60) return `${allMinutes}m ${String(seconds).padStart(2, '0')}s`;
  const hours = Math.floor(allMinutes / 60);
  const minutes = allMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
