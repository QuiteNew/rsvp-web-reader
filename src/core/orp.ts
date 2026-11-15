// Port of core/orp.py.

import { characters, pyLength } from './pythonText';

/** A word split around its Optimal Recognition Point for RSVP display. */
export interface OrpWord {
  readonly before: string;
  readonly focus: string;
  readonly after: string;
}

/**
 * The standard RSVP length-banding heuristic, taking a character count
 * directly rather than a word. Separate from getOrpIndex() so that
 * effectivePacingLength() in timing.ts, which pads hyphenated words with
 * extra length before banding them for pacing, can reuse these exact
 * thresholds. It has no effect on which letter getOrpIndex() picks.
 */
export function getOrpIndexForLength(length: number): number {
  if (length <= 1) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  if (length <= 13) return 3;
  return 4;
}

/**
 * The index of a word's Optimal Recognition Point letter, based on word
 * length. Length is counted in characters, so an emoji counts as one.
 */
export function getOrpIndex(word: string): number {
  return getOrpIndexForLength(pyLength(word));
}

/** Split a word into before, focus letter and after, around its ORP. */
export function splitAtOrp(word: string): OrpWord {
  if (word === '') {
    throw new RangeError('splitAtOrp() requires a non-empty word');
  }
  const letters = characters(word);
  const index = Math.min(getOrpIndexForLength(letters.length), letters.length - 1);
  return {
    before: letters.slice(0, index).join(''),
    focus: letters[index] ?? '',
    after: letters.slice(index + 1).join(''),
  };
}
