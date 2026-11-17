import { describe, expect, test } from 'vitest';
import { bookmarkName, bookmarkPosition } from './bookmarkList';
import type { Bookmark } from './models';

// The expected values were worked out by hand from _make_row() in the
// desktop's bookmarks_popover.py.
function bookmark(parts: Partial<Bookmark>): Bookmark {
  return { index: 0, snippet: '', createdAt: '', label: '', ...parts };
}

describe('bookmarkName', () => {
  test('the label wins over the snippet', () => {
    expect(bookmarkName(bookmark({ label: 'Chapter two', snippet: 'it was a' }))).toBe(
      'Chapter two',
    );
  });

  test('without a label it is the snippet, with the spaces at its ends gone', () => {
    expect(bookmarkName(bookmark({ snippet: '  it was a dark night \n' }))).toBe(
      'it was a dark night',
    );
  });

  test('44 characters fit, 45 are cut to 43 and "…"', () => {
    const fits = 'a'.repeat(44);
    expect(bookmarkName(bookmark({ snippet: fits }))).toBe(fits);
    expect(bookmarkName(bookmark({ snippet: 'a'.repeat(45) }))).toBe(`${'a'.repeat(43)}…`);
  });

  test('a space left at the cut is dropped before the "…"', () => {
    const text = `${'a'.repeat(42)} bcd`;
    expect(bookmarkName(bookmark({ snippet: text }))).toBe(`${'a'.repeat(42)}…`);
  });

  test('an emoji counts as one character, as in Python', () => {
    const fits = '😀'.repeat(44);
    expect(bookmarkName(bookmark({ snippet: fits }))).toBe(fits);
    expect(bookmarkName(bookmark({ snippet: '😀'.repeat(45) }))).toBe(`${'😀'.repeat(43)}…`);
  });

  test('nothing at all is an empty name', () => {
    expect(bookmarkName(bookmark({}))).toBe('');
  });
});

describe('bookmarkPosition', () => {
  test('counts from 1, with commas, and the total when there is one', () => {
    expect(bookmarkPosition(bookmark({ index: 0 }), 10)).toBe('word 1 of 10');
    expect(bookmarkPosition(bookmark({ index: 1233 }), 5678)).toBe('word 1,234 of 5,678');
    expect(bookmarkPosition(bookmark({ index: 4 }), 0)).toBe('word 5');
  });
});
