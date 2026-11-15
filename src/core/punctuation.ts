// Port of core/punctuation.py.
//
// Separates leading and trailing punctuation from a word token, and
// classifies what pause, if any, should follow it during playback.
//
// tokenizer.ts only splits on whitespace, so "reading." still has its period
// attached. Left alone, that period would throw off the ORP letter, and
// timing.ts would have no signal that a word ends a sentence or clause.
//
// splitPunctuation() strips characters that are not letters or numbers from
// each end of a token, working inward. It only works from the ends, never
// the middle, so "well-known" and "$5.99" keep their inner punctuation.

import { characters, isPyAlnum } from './pythonText';

export const PACE_NONE = 'none';
export const PACE_CLAUSE = 'clause';
export const PACE_SENTENCE = 'sentence';

/** The pause that follows a word. */
export type Pace = typeof PACE_NONE | typeof PACE_CLAUSE | typeof PACE_SENTENCE;

const SENTENCE_MARKS = new Set(['.', '!', '?']);
const CLAUSE_MARKS = new Set([',', ';', ':']);

/** A token split into the punctuation before, the word, and the punctuation after. */
export interface SplitToken {
  readonly leading: string;
  readonly core: string;
  readonly trailing: string;
}

/**
 * Split a token into leading punctuation, the word itself, and trailing
 * punctuation. core is empty for a token that is all punctuation ("--"), and
 * everything lands in leading in that case.
 */
export function splitPunctuation(token: string): SplitToken {
  const letters = characters(token);
  let start = 0;
  let end = letters.length;
  while (start < end && !isPyAlnum(letters[start] ?? '')) {
    start += 1;
  }
  while (end > start && !isPyAlnum(letters[end - 1] ?? '')) {
    end -= 1;
  }
  return {
    leading: letters.slice(0, start).join(''),
    core: letters.slice(start, end).join(''),
    trailing: letters.slice(end).join(''),
  };
}

/**
 * Classify the pause that should follow a word, from the punctuation
 * splitPunctuation() stripped off it. Pass leading and trailing joined
 * together, so a token that is all punctuation still classifies correctly.
 *
 * It asks "does any character match", not "does it end with exactly one
 * mark", so "?!", "..." and '."' classify in one pass. Sentence marks win
 * over clause marks if both are present.
 */
export function classifyPacing(strippedMarks: string): Pace {
  let hasClauseMark = false;
  for (const mark of strippedMarks) {
    if (SENTENCE_MARKS.has(mark)) return PACE_SENTENCE;
    if (CLAUSE_MARKS.has(mark)) hasClauseMark = true;
  }
  return hasClauseMark ? PACE_CLAUSE : PACE_NONE;
}
