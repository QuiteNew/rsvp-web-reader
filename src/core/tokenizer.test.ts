import { expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { tokenize } from './tokenizer';

test('tokenize matches the Python fixtures', () => {
  expectToMatchFixture(loadFixture('tokenizer'), 'tokenize', ([text]) => tokenize(text as string));
});

// Ported from tests/test_tokenizer.py. The first column is the Python
// test's name.
test.each([
  ['splits_simple_sentence_into_words', 'Welcome to the show', ['Welcome', 'to', 'the', 'show']],
  ['splits_on_multiple_spaces', 'Hello    there     friend', ['Hello', 'there', 'friend']],
  ['splits_on_newlines_and_tabs', 'Hello\nthere\tfriend', ['Hello', 'there', 'friend']],
  [
    'keeps_punctuation_attached_to_words',
    "Welcome to the show. Today we're talking about RSVP.",
    ['Welcome', 'to', 'the', 'show.', 'Today', "we're", 'talking', 'about', 'RSVP.'],
  ],
  [
    'strips_leading_and_trailing_whitespace',
    '   Hello there friend   ',
    ['Hello', 'there', 'friend'],
  ],
  ['single_word_returns_single_item_list', 'Hello', ['Hello']],
  ['empty_string_returns_empty_list', '', []],
  ['whitespace_only_string_returns_empty_list', '     ', []],
])('%s', (_name, text, expected) => {
  expect(tokenize(text)).toEqual(expected);
});
