// The desktop project's tests/test_models.py, under its Python names.
//
// Not ported: the two "requires" tests and the two "stores given values"
// tests. In Python they check the dataclass at run time. Here the compiler
// refuses a Transcript without an id, a title and a Space, and a plain
// object holds what it is given.
import { describe, expect, test } from 'vitest';
import { addBookmark, addTranscript } from './library';
import { BOOKMARK_DEFAULTS, EMPTY_LIBRARY, TRANSCRIPT_DEFAULTS } from './models';

describe('test_models.py', () => {
  test('test_bookmark_defaults', () => {
    const bookmark = { ...BOOKMARK_DEFAULTS, index: 5 };
    expect(bookmark).toEqual({ index: 5, snippet: '', createdAt: '', label: '' });
  });

  test('test_transcript_defaults', () => {
    const t = { ...TRANSCRIPT_DEFAULTS, id: 1, title: 'T', space: 'General' };
    expect(t.rawText).toBe('');
    expect(t.wpm).toBe(300);
    expect(t.position).toBe(0);
    expect(t.fontColor).toBe('#FFFFFF');
    expect(t.highlightColor).toBe('#E74C3C');
    expect(t.backgroundColor).toBe('#1E1E1E');
    expect(t.fontSize).toBe(32);
    expect(t.isPaused).toBe(false);
    expect(t.draftText).toBe('');
    expect(t.isStopped).toBe(false);
    expect(t.fontColorIsDefault).toBe(true);
    expect(t.highlightColorIsDefault).toBe(true);
    expect(t.backgroundColorIsDefault).toBe(true);
    expect(t.timesRead).toBe(0);
    expect(t.totalWordsRead).toBe(0);
    expect(t.totalTimeSpentSeconds).toBe(0);
    expect(t.preNormalizeText).toBe('');
    expect(t.normalizedText).toBe('');
    expect(t.bookmarks).toEqual([]);
  });

  test('test_transcript_bookmarks_default_is_an_empty_list', () => {
    expect(TRANSCRIPT_DEFAULTS.bookmarks).toEqual([]);
  });

  test('test_transcript_bookmarks_are_not_shared_between_instances', () => {
    // Python guards against one list shared by every transcript. Here the
    // rules never change a list in place, so a bookmark on one transcript
    // cannot show up on another, or in the defaults.
    let library = addTranscript(EMPTY_LIBRARY, 'A', 'General');
    library = addTranscript(library, 'B', 'General');
    library = addBookmark(library, 1, 0, '', 'NOW');
    expect(library.transcripts[0]?.bookmarks).toHaveLength(1);
    expect(library.transcripts[1]?.bookmarks).toHaveLength(0);
    expect(TRANSCRIPT_DEFAULTS.bookmarks).toHaveLength(0);
  });
});
