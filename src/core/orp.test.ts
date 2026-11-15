import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { getOrpIndex, getOrpIndexForLength, splitAtOrp } from './orp';

describe('against the Python fixtures', () => {
  const fixture = loadFixture('orp');

  test('getOrpIndexForLength', () => {
    expectToMatchFixture(fixture, 'get_orp_index_for_length', ([length]) =>
      getOrpIndexForLength(length as number),
    );
  });

  test('getOrpIndex', () => {
    expectToMatchFixture(fixture, 'get_orp_index', ([word]) => getOrpIndex(word as string));
  });

  test('splitAtOrp', () => {
    expectToMatchFixture(fixture, 'split_at_orp', ([word]) => splitAtOrp(word as string));
  });
});

// Ported from tests/test_orp.py.

// Made-up "a" * n words guarantee each length is exactly what it claims to
// be. The boundaries are the whole behaviour of this function.
test.each([
  [0, 0],
  [1, 0],
  [2, 1],
  [5, 1],
  [6, 2], // one letter past the first band boundary
  [9, 2],
  [10, 3], // one letter past the second
  [13, 3],
  [14, 4], // one letter past the third
  [50, 4], // the top band has no ceiling
])('orp_index_length_%i_returns_%i', (length, expected) => {
  expect(getOrpIndex('a'.repeat(length))).toBe(expected);
});

test.each([
  [0, 0],
  [1, 0],
  [5, 1],
  [6, 2],
  [9, 2],
  [10, 3],
  [13, 3],
  [14, 4],
  [50, 4],
  [15, 4], // a padded length beyond any real word, as timing.ts uses it
])('orp_index_for_length_%i_returns_%i', (length, expected) => {
  expect(getOrpIndexForLength(length)).toBe(expected);
});

test('get_orp_index_still_agrees_with_get_orp_index_for_length', () => {
  for (const word of ['', 'a', 'to', 'about', 'friendship', 'understanding', 'a'.repeat(30)]) {
    expect(getOrpIndex(word)).toBe(getOrpIndexForLength(word.length));
  }
});

test.each([
  ['split_single_letter_word', 'I', { before: '', focus: 'I', after: '' }],
  ['split_two_letter_word', 'to', { before: 't', focus: 'o', after: '' }],
  ['split_five_letter_word', 'about', { before: 'a', focus: 'b', after: 'out' }],
  // tokenize() keeps punctuation attached to its word on purpose, and
  // splitAtOrp treats it like any other character.
  ['split_word_with_trailing_punctuation', 'show.', { before: 's', focus: 'h', after: 'ow.' }],
])('%s', (_name, word, expected) => {
  expect(splitAtOrp(word)).toEqual(expected);
});

test('split_reconstructs_original_word_exactly', () => {
  for (const word of ['I', 'to', 'about', 'friendship', 'understanding', 'a'.repeat(30)]) {
    const { before, focus, after } = splitAtOrp(word);
    expect(before + focus + after).toBe(word);
  }
});

test('split_at_orp_raises_clear_error_on_empty_string', () => {
  // tokenize() never produces empty tokens, so this cannot happen in the
  // running app. It still gets a clear error and not a confusing one.
  expect(() => splitAtOrp('')).toThrow(RangeError);
});

// Not in the Python tests: Python gets these right for free, JavaScript
// only if the port counts characters and not UTF-16 units.
describe('emoji count as one character', () => {
  test('an emoji is never cut in half', () => {
    expect(splitAtOrp('😀')).toEqual({ before: '', focus: '😀', after: '' });
    expect(splitAtOrp('a😀b')).toEqual({ before: 'a', focus: '😀', after: 'b' });
    expect(splitAtOrp('😀ab')).toEqual({ before: '😀', focus: 'a', after: 'b' });
  });

  test('five emoji are a five-letter word', () => {
    expect(getOrpIndex('😀😀😀😀😀')).toBe(1);
    expect(getOrpIndex('😀😀😀😀😀😀')).toBe(2);
  });
});
