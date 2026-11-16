// Tests for the three small helpers of phase 3: wpmStep, transcriptSort and
// reopen. First against the Python fixtures, then the desktop project's own
// tests for them under their Python names.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { pyCompareText } from './pythonText';
import { transcriptToReopen } from './reopen';
import {
  DEFAULT_SORT,
  SORT_ORDERS,
  knownSort,
  sortTranscripts,
  type Sortable,
} from './transcriptSort';
import { WPM_KEY_STEP, WPM_RANGE, stepWpm } from './wpmStep';

type SortRow = [id: number, title: string, timesRead: number, seconds: number];

function sortable([id, title, timesRead, totalTimeSpentSeconds]: SortRow): Sortable {
  return { id, title, timesRead, totalTimeSpentSeconds };
}

function ids(transcripts: readonly { id: number }[]): number[] {
  return transcripts.map((transcript) => transcript.id);
}

function constant(fixtureName: string, name: string): unknown {
  const cases = loadFixture(fixtureName).functions.constants ?? [];
  return cases.find(([args]) => args[0] === name)?.[1];
}

describe('against the Python fixtures', () => {
  test('step_wpm', () => {
    expectToMatchFixture(loadFixture('wpm_step'), 'step_wpm', ([wpm, direction]) =>
      stepWpm(wpm as number, direction as number),
    );
    expect(WPM_KEY_STEP).toBe(constant('wpm_step', 'WPM_KEY_STEP'));
  });

  test('sort_transcripts', () => {
    expectToMatchFixture(loadFixture('transcript_sort'), 'sort_transcripts', ([rows, sortId]) =>
      ids(sortTranscripts((rows as SortRow[]).map(sortable), sortId)),
    );
  });

  test('known_sort', () => {
    expectToMatchFixture(loadFixture('transcript_sort'), 'known_sort', ([value]) =>
      knownSort(value),
    );
  });

  test('the orders, their labels and the default', () => {
    expectToMatchFixture(loadFixture('transcript_sort'), 'orders', ([sortId]) => {
      const order = SORT_ORDERS[sortId as keyof typeof SORT_ORDERS];
      return [order.label, order.reverse];
    });
    const recorded = (loadFixture('transcript_sort').functions.orders ?? []).map(
      ([args]) => args[0],
    );
    expect(Object.keys(SORT_ORDERS)).toEqual(recorded);
    expect(DEFAULT_SORT).toBe(constant('transcript_sort', 'DEFAULT_SORT'));
  });

  test('transcript_to_reopen', () => {
    expectToMatchFixture(loadFixture('reopen'), 'transcript_to_reopen', ([enabled, last, list]) => {
      const transcripts = (list as number[]).map((id) => ({ id }));
      return transcriptToReopen(enabled as boolean, last as number | null, transcripts)?.id ?? null;
    });
  });
});

// Not in the Python tests: the two string traps the sort depends on.
describe('pyCompareText', () => {
  test('compares by code point, not by UTF-16 unit', () => {
    expect('\u{1F600}' < '￿').toBe(true); // what JavaScript's < says
    expect(pyCompareText('\u{1F600}', '￿')).toBeGreaterThan(0);
    expect(pyCompareText('a', 'b')).toBeLessThan(0);
    expect(pyCompareText('same', 'same')).toBe(0);
    expect(pyCompareText('ab', 'abc')).toBeLessThan(0);
    expect(pyCompareText('', 'a')).toBeLessThan(0);
  });
});

describe('test_transcript_sort.py', () => {
  const TRANSCRIPTS: Sortable[] = [
    sortable([1, 'beta', 2, 300]),
    sortable([2, 'Alpha', 5, 100]),
    sortable([3, 'gamma', 1, 900]),
  ];

  test.each([
    ['title_az', [2, 1, 3]], // upper and lower case sort together
    ['title_za', [3, 1, 2]],
    ['newest', [3, 2, 1]],
    ['oldest', [1, 2, 3]],
    ['most_read', [2, 1, 3]],
    ['most_time', [3, 1, 2]],
  ])('each_order_sorts_the_way_its_label_says %j', (sortId, expected) => {
    expect(ids(sortTranscripts(TRANSCRIPTS, sortId))).toEqual(expected);
  });

  test('the_menu_shows_the_same_six_orders_in_the_same_order_as_before', () => {
    expect(Object.values(SORT_ORDERS).map((order) => order.label)).toEqual([
      'Title (A–Z)',
      'Title (Z–A)',
      'Date added (newest first)',
      'Date added (oldest first)',
      'Most read',
      'Most time spent reading',
    ]);
  });

  test('the_default_is_the_order_the_list_always_had', () => {
    expect(DEFAULT_SORT).toBe('oldest');
    expect(SORT_ORDERS[DEFAULT_SORT].label).toBe('Date added (oldest first)');
  });

  test.each(['', 'Title (A–Z)', 'TITLE_AZ', null, 3, ['title_az']])(
    'anything_that_is_not_a_known_id_reads_as_the_default %j',
    (odd) => {
      expect(knownSort(odd)).toBe(DEFAULT_SORT);
      expect(ids(sortTranscripts(TRANSCRIPTS, odd))).toEqual([1, 2, 3]);
    },
  );

  test('every_id_is_known', () => {
    for (const sortId of Object.keys(SORT_ORDERS)) {
      expect(knownSort(sortId)).toBe(sortId);
    }
  });

  test('transcripts_that_tie_keep_the_order_they_came_in', () => {
    const tied = [
      sortable([1, 'same', 0, 0]),
      sortable([2, 'Same', 0, 0]),
      sortable([3, 'same', 0, 0]),
    ];
    expect(ids(sortTranscripts(tied, 'title_az'))).toEqual([1, 2, 3]);
    expect(ids(sortTranscripts(tied, 'title_za'))).toEqual([1, 2, 3]);
    expect(ids(sortTranscripts(tied, 'most_read'))).toEqual([1, 2, 3]);
  });

  test('sorting_gives_a_new_list_and_leaves_the_old_one_alone', () => {
    const given = [...TRANSCRIPTS];
    const result = sortTranscripts(given, 'newest');
    expect(result).not.toBe(given);
    expect(ids(given)).toEqual([1, 2, 3]);
  });
});

describe('test_reopen_last_transcript.py', () => {
  const TRANSCRIPTS = [
    { id: 1, title: 'Lecture', space: 'General' },
    { id: 2, title: 'Notes', space: 'Work' },
  ];

  test('the_last_transcript_is_chosen', () => {
    expect(transcriptToReopen(true, 1, TRANSCRIPTS)).toBe(TRANSCRIPTS[0]);
  });

  test('a_transcript_in_another_space_is_chosen_too', () => {
    // The app keeps a transcript open across a switch of Space, so it comes
    // back the same way.
    expect(transcriptToReopen(true, 2, TRANSCRIPTS)).toBe(TRANSCRIPTS[1]);
  });

  test('nothing_when_the_setting_is_off', () => {
    expect(transcriptToReopen(false, 1, TRANSCRIPTS)).toBeNull();
  });

  test('nothing_when_nothing_was_open', () => {
    expect(transcriptToReopen(true, null, TRANSCRIPTS)).toBeNull();
  });

  test('nothing_when_the_transcript_is_gone', () => {
    expect(transcriptToReopen(true, 99, TRANSCRIPTS)).toBeNull();
  });
});

describe('test_wpm_keys.py', () => {
  const UP = 1;
  const DOWN = -1;

  test('a_step_is_ten_words_per_minute', () => {
    expect(WPM_KEY_STEP).toBe(10);
    expect(stepWpm(300, UP)).toBe(310);
    expect(stepWpm(300, DOWN)).toBe(290);
  });

  test('a_speed_between_the_sliders_stops_goes_to_the_nearest_one_that_way', () => {
    expect(stepWpm(305, UP)).toBe(310);
    expect(stepWpm(305, DOWN)).toBe(300);
    expect(stepWpm(301, DOWN)).toBe(300);
    expect(stepWpm(309, UP)).toBe(310);
  });

  test('the_speed_stays_inside_the_range', () => {
    const [low, high] = WPM_RANGE;
    expect(stepWpm(high, UP)).toBe(high);
    expect(stepWpm(low, DOWN)).toBe(low);
    expect(stepWpm(high - 5, UP)).toBe(high);
    expect(stepWpm(low + 5, DOWN)).toBe(low);
    expect(stepWpm(high, DOWN)).toBe(high - 10);
    expect(stepWpm(low, UP)).toBe(low + 10);
  });

  test('every_step_lands_inside_the_range_on_a_multiple_of_ten', () => {
    const [low, high] = WPM_RANGE;
    for (let wpm = low; wpm <= high; wpm += 1) {
      for (const direction of [UP, DOWN]) {
        const stepped = stepWpm(wpm, direction);
        expect(stepped).toBeGreaterThanOrEqual(low);
        expect(stepped).toBeLessThanOrEqual(high);
        expect(stepped % 10).toBe(0);
      }
    }
  });
});
