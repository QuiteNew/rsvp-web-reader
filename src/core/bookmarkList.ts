// How a bookmark reads in the list, from the desktop's
// gui/components/bookmarks_popover.py (_make_row). That file is tkinter and
// cannot be run here, so this is checked by hand in bookmarkList.test.ts,
// not by a fixture.
import type { Bookmark } from './models';
import { characters, pyRstrip, pyStrip } from './pythonText';

/** The longest name a row shows, in characters as Python counts them. */
export const SNIPPET_MAX_CHARS = 44;

/**
 * The name of a bookmark in the list: its label, or its snippet when it has
 * none. Cut to 44 characters with "…" at the end when longer.
 */
export function bookmarkName(bookmark: Bookmark): string {
  const name = pyStrip(bookmark.label !== '' ? bookmark.label : bookmark.snippet);
  const letters = characters(name);
  if (letters.length <= SNIPPET_MAX_CHARS) return name;
  return `${pyRstrip(letters.slice(0, SNIPPET_MAX_CHARS - 1).join(''))}…`;
}

/** "word 1,234 of 5,678", or "word 1,234" when the total is not known. */
export function bookmarkPosition(bookmark: Bookmark, totalWords: number): string {
  const word = `word ${(bookmark.index + 1).toLocaleString('en-US')}`;
  return totalWords > 0 ? `${word} of ${totalWords.toLocaleString('en-US')}` : word;
}
