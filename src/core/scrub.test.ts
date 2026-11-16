import { describe, expect, test } from 'vitest';
import { scrubMax, scrubReadout, scrubTickFraction, scrubTickIndices, scrubValue } from './scrub';

// The expected values were worked out by hand from scrub_bar.py.
describe('scrubReadout', () => {
  test('counts words from 1 and puts commas in', () => {
    expect(scrubReadout(0, 10)).toBe('word 1 of 10');
    expect(scrubReadout(1233, 5678)).toBe('word 1,234 of 5,678');
  });

  test('a finished reader (one past the end) shows the last word', () => {
    expect(scrubReadout(10, 10)).toBe('word 10 of 10');
  });

  test('nothing loaded shows nothing', () => {
    expect(scrubReadout(0, 0)).toBe('');
  });
});

describe('the slider', () => {
  test('goes from 0 to one less than the words, and a finished reader rests on the last', () => {
    expect(scrubMax(10)).toBe(9);
    expect(scrubMax(0)).toBe(0);
    expect(scrubValue(10, 10)).toBe(9);
    expect(scrubValue(3, 10)).toBe(3);
    expect(scrubValue(-2, 10)).toBe(0);
  });
});

describe('the bookmark ticks', () => {
  test('are in order, without repeats, none under 0', () => {
    expect(scrubTickIndices([5, 2, 5, -3, 9])).toEqual([0, 2, 5, 9]);
    expect(scrubTickIndices([])).toEqual([]);
  });

  test('sit at the fraction of the way along that the thumb rests at', () => {
    expect(scrubTickFraction(0, 11)).toBe(0);
    expect(scrubTickFraction(5, 11)).toBe(0.5);
    expect(scrubTickFraction(10, 11)).toBe(1);
  });

  test('past the last word is drawn at the end', () => {
    expect(scrubTickFraction(99, 11)).toBe(1);
  });

  test('fewer than two words has nowhere to put one', () => {
    expect(scrubTickFraction(0, 1)).toBe(0);
  });
});
