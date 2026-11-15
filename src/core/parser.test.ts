import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import {
  cleanTranscript,
  cleanTranscriptKeepLines,
  expandLigatures,
  stripTimestamps,
} from './parser';

describe('against the Python fixtures', () => {
  const fixture = loadFixture('parser');
  const cases: [string, (text: string) => string][] = [
    ['clean_transcript', cleanTranscript],
    ['clean_transcript_keep_lines', cleanTranscriptKeepLines],
    ['strip_timestamps', stripTimestamps],
    ['expand_ligatures', expandLigatures],
  ];

  test.each(cases)('%s', (pythonName, run) => {
    expectToMatchFixture(fixture, pythonName, ([text]) => run(text as string));
  });
});

// Ported from tests/test_parser.py. The first column is the Python test's
// name.

test.each([
  ['strips_bracketed_timestamp', '[00:00:01] Welcome to the show.', 'Welcome to the show.'],
  [
    'strips_parenthesized_timestamp',
    "(1:23) Today we're talking about speed reading.",
    "Today we're talking about speed reading.",
  ],
  [
    'strips_bare_timestamp_no_brackets',
    '00:02:45 rapid serial visual presentation.',
    'rapid serial visual presentation.',
  ],
  [
    'strips_multiple_mixed_timestamps',
    "[00:00:01] Welcome to the show. (1:23) Today we're talking about RSVP.",
    "Welcome to the show. Today we're talking about RSVP.",
  ],
  ['collapses_internal_whitespace', 'Hello   there\n\nfriend', 'Hello there friend'],
  ['strips_leading_and_trailing_whitespace', '   Hello there friend   ', 'Hello there friend'],
  [
    'passes_through_text_with_no_timestamps',
    'Just a plain sentence with no timestamps at all.',
    'Just a plain sentence with no timestamps at all.',
  ],
  ['empty_string_returns_empty_string', '', ''],

  // Which times count as timestamps
  ['time_of_day_inside_a_sentence_is_kept', 'We met at 10:30 today.', 'We met at 10:30 today.'],
  // How YouTube transcripts copy: the time on its own line above each caption.
  [
    'short_time_alone_on_its_line_is_removed',
    '0:05\nso today we talk\n0:09\nabout the reader',
    'so today we talk about the reader',
  ],
  ['short_time_alone_on_a_windows_line_is_removed', '0:05\r\nHello.', 'Hello.'],
  [
    'subtitle_timing_line_is_removed_whole',
    '00:00:01,000 --> 00:00:04,000\nHello world.',
    'Hello world.',
  ],

  // Tidying the punctuation a removed timestamp leaves behind
  ['removed_timestamp_does_not_strand_a_comma', 'text [00:01:23], more', 'text, more'],
  [
    'removed_timestamp_does_not_strand_a_space_before_a_full_stop',
    'wrap up [00:05:00]. Next part',
    'wrap up. Next part',
  ],
  ['removed_timestamp_inside_parentheses_leaves_no_empty_pair', '(intro [0:30])', '(intro)'],
  ['removed_timestamp_before_a_colon_is_tidied', 'Speaker [00:01]: hello', 'Speaker: hello'],
  ['a_parenthesised_list_of_timestamps_collapses_cleanly', '(a [0:30], b [0:45], c)', '(a, b, c)'],
  [
    'a_run_of_only_timestamps_in_parentheses_leaves_the_rest',
    'See ([00:01:23], (1:23), 00:02:45, the notes)',
    'See (the notes)',
  ],
  // The tidy only runs on text that had a timestamp, so ordinary
  // punctuation elsewhere is never touched.
  ['a_smiley_is_left_alone_when_there_is_no_timestamp', 'hello :) there', 'hello :) there'],
])('%s', (_name, raw, expected) => {
  expect(cleanTranscript(raw)).toBe(expected);
});

test.each([
  ['keeps_single_line_breaks', 'First line.\nSecond line.', 'First line.\nSecond line.'],
  [
    'strips_timestamps_on_each_line',
    "[00:00:01] Welcome to the show.\n(1:23) Today we're talking.",
    "Welcome to the show.\nToday we're talking.",
  ],
  ['collapses_spaces_and_tabs_within_a_line', 'Hello   there\t\tfriend', 'Hello there friend'],
  ['trims_each_line', '   First.   \n   Second.   ', 'First.\nSecond.'],
  ['cuts_runs_of_blank_lines_down_to_one', 'First.\n\n\n\nSecond.', 'First.\n\nSecond.'],
  ['treats_whitespace_only_lines_as_blank', 'First.\n   \n\t\nSecond.', 'First.\n\nSecond.'],
  ['line_left_empty_by_a_timestamp_disappears', '[00:00:01]\nHello.', 'Hello.'],
  ['converts_windows_line_endings', 'First.\r\nSecond.', 'First.\nSecond.'],
  ['empty_string_returns_empty_string', '', ''],
  ['expands_combined_letters', 'ﬁnd the ﬂow', 'find the flow'],
  ['drops_a_youtube_style_time_line', '0:05\nHello.\n0:09\nWorld.', 'Hello.\nWorld.'],
  ['keeps_a_time_of_day', 'We met at 10:30 today.', 'We met at 10:30 today.'],
])('keep_lines_%s', (_name, raw, expected) => {
  expect(cleanTranscriptKeepLines(raw)).toBe(expected);
});

test.each([
  ['handles_every_combined_letter', 'ﬀﬁﬂﬃﬄﬅﬆ', 'fffiflffifflstst'],
  ['inside_words', 'eﬃcient and oﬀer', 'efficient and offer'],
  // Only the fixed list is touched, unlike a general Unicode cleanup.
  ['leaves_other_special_characters_alone', '½ x² wait…', '½ x² wait…'],
])('expand_ligatures_%s', (_name, text, expected) => {
  expect(expandLigatures(text)).toBe(expected);
});

test('strip_timestamps_leaves_timestamp_free_text_exactly_as_is', () => {
  expect(stripTimestamps('just words, and more :) words')).toBe('just words, and more :) words');
});

// Not in the Python tests: places where a JavaScript regular expression
// reads the same pattern differently from Python.
describe('where JavaScript and Python regular expressions differ', () => {
  test('a time before a lone carriage return is not alone on its line', () => {
    // Python's $ only stops before "\n". JavaScript's also stops before "\r".
    expect(stripTimestamps('0:05\rHello.')).toBe('0:05\rHello.');
  });

  test('a time before a line separator is not alone on its line', () => {
    expect(stripTimestamps('0:05 Hello.')).toBe('0:05 Hello.');
  });

  test('digits of another script make a timestamp', () => {
    expect(cleanTranscript('[٠٠:٠١] hello')).toBe('hello');
  });

  test('a byte order mark is not whitespace', () => {
    expect(cleanTranscript('﻿Hello')).toBe('﻿Hello');
  });
});
