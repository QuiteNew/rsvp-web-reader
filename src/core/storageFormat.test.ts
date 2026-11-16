// parseData and toSavedData, against what the desktop's parse_data() gives.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { EMPTY_LIBRARY, TRANSCRIPT_DEFAULTS, type Library } from './models';
import { LIVE_SAVE_INTERVAL_SECONDS, parseData, toSavedData } from './storageFormat';

const fixture = loadFixture('storage');

function data(transcripts: unknown): Record<string, unknown> {
  return { next_id: 5, current_space_index: 1, spaces: ['General', 'Work'], transcripts };
}

describe('against the Python fixtures', () => {
  test('parse_data, read and written back in the saved shape', () => {
    expectToMatchFixture(fixture, 'parse_data', ([saved]) => {
      const library = parseData(saved);
      return library === null ? null : toSavedData(library);
    });
  });

  test('the fixture has both readable and unreadable data', () => {
    const results = (fixture.functions.parse_data ?? []).map(([, result]) => result === null);
    expect(results.filter((unreadable) => unreadable).length).toBeGreaterThan(20);
    expect(results.filter((unreadable) => !unreadable).length).toBeGreaterThan(20);
  });

  test('LIVE_SAVE_INTERVAL_SECONDS', () => {
    const recorded = (fixture.functions.constants ?? [])[0]?.[1];
    expect(LIVE_SAVE_INTERVAL_SECONDS).toBe(recorded);
  });
});

// The fixture test reads and writes with the same table of names, so a
// name that was wrong both ways would cancel out. These look at the
// camelCase side directly.
describe('the camelCase side', () => {
  test('every saved name lands on its own field', () => {
    const library = parseData(
      data([
        {
          id: 2,
          title: 'Full',
          space: 'Work',
          raw_text: 'raw',
          wpm: 450,
          position: 7,
          font_color: '#111111',
          highlight_color: '#222222',
          background_color: '#333333',
          font_size: 40,
          is_paused: true,
          draft_text: 'draft',
          is_stopped: true,
          font_color_is_default: false,
          highlight_color_is_default: true,
          background_color_is_default: false,
          times_read: 3,
          total_words_read: 1200,
          total_time_spent_seconds: 345,
          pre_normalize_text: 'before',
          normalized_text: 'after',
          chunking_enabled: true,
          chunk_size: 4,
          chunk_mode: 'adaptive',
          chunk_char_target: 42,
          bookmarks: [
            { index: 3, snippet: 'hi', created_at: '2026-01-02T03:04:05', label: 'start' },
          ],
          speaker_custom: { ann: 'Ann' },
        },
      ]),
    );
    expect(library).toEqual({
      nextId: 5,
      currentSpaceIndex: 1,
      spaces: ['General', 'Work'],
      transcripts: [
        {
          id: 2,
          title: 'Full',
          space: 'Work',
          rawText: 'raw',
          wpm: 450,
          position: 7,
          fontColor: '#111111',
          highlightColor: '#222222',
          backgroundColor: '#333333',
          fontSize: 40,
          isPaused: true,
          draftText: 'draft',
          isStopped: true,
          fontColorIsDefault: false,
          highlightColorIsDefault: true,
          backgroundColorIsDefault: false,
          timesRead: 3,
          totalWordsRead: 1200,
          totalTimeSpentSeconds: 345,
          preNormalizeText: 'before',
          normalizedText: 'after',
          chunkingEnabled: true,
          chunkSize: 4,
          chunkMode: 'adaptive',
          chunkCharTarget: 42,
          bookmarks: [
            { index: 3, snippet: 'hi', createdAt: '2026-01-02T03:04:05', label: 'start' },
          ],
          speakerCustom: { ann: 'Ann' },
        },
      ],
    } satisfies Library);
  });

  test('a transcript with only its three required fields gets the defaults', () => {
    const library = parseData(data([{ id: 1, title: 'T', space: 'General' }]));
    expect(library?.transcripts[0]).toEqual({
      ...TRANSCRIPT_DEFAULTS,
      id: 1,
      title: 'T',
      space: 'General',
      // Missing colour flags read as false, so old colours are kept.
      fontColorIsDefault: false,
      highlightColorIsDefault: false,
      backgroundColorIsDefault: false,
    });
  });

  test('the data given is not changed', () => {
    const saved = data([{ id: 1, title: 'T', space: 'General', extra: 1 }]);
    const before = JSON.stringify(saved);
    parseData(saved);
    expect(JSON.stringify(saved)).toBe(before);
  });

  test('an empty library is written and read back the same', () => {
    expect(parseData(toSavedData(EMPTY_LIBRARY))).toEqual(EMPTY_LIBRARY);
  });

  test('the saved shape has every name of a transcript and nothing else', () => {
    const [saved] = toSavedData({
      ...EMPTY_LIBRARY,
      transcripts: [{ ...TRANSCRIPT_DEFAULTS, id: 1, title: 'T', space: 'General' }],
    }).transcripts;
    expect(Object.keys(saved ?? {})).toHaveLength(27);
    expect(Object.keys(saved ?? {}).every((name) => name === name.toLowerCase())).toBe(true);
  });
});
