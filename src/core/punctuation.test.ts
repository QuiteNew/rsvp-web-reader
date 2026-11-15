import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import {
  PACE_CLAUSE,
  PACE_NONE,
  PACE_SENTENCE,
  classifyPacing,
  splitPunctuation,
} from './punctuation';

// Python returns a (leading, core, trailing) tuple. The port returns an
// object, so tests compare through this.
function parts(token: string): [string, string, string] {
  const { leading, core, trailing } = splitPunctuation(token);
  return [leading, core, trailing];
}

describe('against the Python fixtures', () => {
  const fixture = loadFixture('punctuation');

  test('splitPunctuation', () => {
    expectToMatchFixture(fixture, 'split_punctuation', ([token]) => parts(token as string));
  });

  test('classifyPacing', () => {
    expectToMatchFixture(fixture, 'classify_pacing', ([marks]) => classifyPacing(marks as string));
  });
});

// Ported from tests/test_punctuation.py.

test.each([
  ['word_with_no_marks', 'hello', ['', 'hello', '']],
  ['single_letter_word', 'a', ['', 'a', '']],
  ['trailing_period', 'show.', ['', 'show', '.']],
  ['leading_quote', '"hello', ['"', 'hello', '']],
  ['leading_and_trailing_marks', '"hello."', ['"', 'hello', '."']],
  ['multiple_marks_each_side', '...hello!!!', ['...', 'hello', '!!!']],
  // Only the runs at the start and end are stripped. Marks in the middle
  // of a word are part of the word.
  ['leaves_internal_hyphen_untouched', 'well-known', ['', 'well-known', '']],
  ['leaves_internal_decimal_point_untouched', '$5.99', ['$', '5.99', '']],
  ['leaves_internal_apostrophe_untouched', '"don\'t"', ['"', "don't", '"']],
  // No letters or digits: the core is empty and the whole token goes into
  // leading.
  ['all_punctuation_token_has_empty_core', '--', ['--', '', '']],
  ['single_mark_lands_in_leading', '.', ['.', '', '']],
  ['empty_string_returns_three_empty_strings', '', ['', '', '']],
])('split_punctuation_%s', (_name, token, expected) => {
  expect(parts(token)).toEqual(expected);
});

test('split_punctuation_reconstructs_original_token_exactly', () => {
  const tokens = [
    'hello',
    'show.',
    '"hello."',
    '...hello!!!',
    'well-known',
    '$5.99',
    '--',
    '.',
    '',
  ];
  for (const token of tokens) {
    expect(parts(token).join('')).toBe(token);
  }
});

test.each([
  ['period_is_sentence', '.', PACE_SENTENCE],
  ['exclamation_is_sentence', '!', PACE_SENTENCE],
  ['question_mark_is_sentence', '?', PACE_SENTENCE],
  ['comma_is_clause', ',', PACE_CLAUSE],
  ['semicolon_is_clause', ';', PACE_CLAUSE],
  ['colon_is_clause', ':', PACE_CLAUSE],
  ['empty_string_is_none', '', PACE_NONE],
  // Not every leading or trailing character should slow playback down.
  ['quote_alone_is_none', '"', PACE_NONE],
  ['hyphen_alone_is_none', '-', PACE_NONE],
  // "Does any character match", so three periods count the same as one.
  ['ellipsis_is_sentence', '...', PACE_SENTENCE],
  ['interrobang_is_sentence', '?!', PACE_SENTENCE],
  ['closing_quote_after_period_is_sentence', '."', PACE_SENTENCE],
  ['closing_quote_after_comma_is_clause', ',"', PACE_CLAUSE],
  ['sentence_mark_wins_over_clause_mark', '.,', PACE_SENTENCE],
])('classify_pacing_%s', (_name, marks, expected) => {
  expect(classifyPacing(marks)).toBe(expected);
});

test('classify_pacing_handles_an_all_punctuation_token_via_leading', () => {
  // splitPunctuation("...") puts the whole token in leading and leaves
  // trailing empty. Passing leading + trailing, not just trailing, is what
  // stops this from quietly coming out as PACE_NONE.
  const { leading, core, trailing } = splitPunctuation('...');
  expect(core).toBe('');
  expect(classifyPacing(leading + trailing)).toBe(PACE_SENTENCE);
});

// Not in the Python tests: letters and digits outside ASCII.
describe('letters and numbers in any script count as the word', () => {
  test.each([
    ['Cyrillic', '«Привет!»', ['«', 'Привет', '!»']],
    ['Greek', 'κόσμε;', ['', 'κόσμε', ';']],
    ['Arabic-Indic digits', '(٣٤٥)', ['(', '٣٤٥', ')']],
    ['a fraction', '½.', ['', '½', '.']],
    ['an emoji is punctuation', '😀hi😀', ['😀', 'hi', '😀']],
    ['an underscore is punctuation', '_a_', ['_', 'a', '_']],
  ])('%s', (_name, token, expected) => {
    expect(parts(token)).toEqual(expected);
  });
});
