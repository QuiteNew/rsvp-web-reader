// Port of core/tokenizer.py.

import { pySplit } from './pythonText';

/** Split cleaned transcript text into a list of individual word tokens. */
export function tokenize(cleanText: string): string[] {
  return pySplit(cleanText);
}
