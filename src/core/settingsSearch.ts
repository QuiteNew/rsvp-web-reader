// The rule behind the Settings search box, ported from core/settings_search.py.
// The settings view describes each setting with a name, some extra search
// terms and a description. This decides whether a typed query finds it.
import { pyCasefold, pySplit } from './pythonText';

/** The typed query as lowercase words. A blank query gives an empty list. */
export function queryWords(query: string): string[] {
  return pySplit(pyCasefold(query));
}

/**
 * Whether a setting is found by the query.
 *
 * The name and the extra keywords are always searched. The description is
 * searched only when includeDescription is on, so a long explanation does not
 * drag unrelated settings into the results by default.
 *
 * Every word of the query must appear somewhere in the searched text, in any
 * order, and a word can be just the start (or the middle) of a longer one.
 * Case is ignored the way Python does it (casefold, so "ß" matches "ss"). A
 * blank query matches everything, which brings the full list back when the
 * box is cleared.
 */
export function matches(
  query: string,
  name: string,
  keywords = '',
  description = '',
  includeDescription = false,
): boolean {
  const words = queryWords(query);
  if (words.length === 0) return true;
  const parts = [name, keywords];
  if (includeDescription) parts.push(description);
  // Joined with one space, so a word cannot be found across two fields.
  const searched = pyCasefold(parts.filter((part) => part !== '').join(' '));
  return words.every((word) => searched.includes(word));
}
