import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import {
  LEVEL_GAP_EM,
  LEVEL_NAMES,
  MAX_LEVEL,
  WORD_GAP_RATIO,
  clampLevel,
  letterGapEm,
  wordSpacingEm,
} from './letterSpacing';

const fixture = loadFixture('letter_spacing');

describe('against the Python fixtures', () => {
  test('the level names, gaps, top level and word gap ratio', () => {
    expectToMatchFixture(fixture, 'level_names', () => [...LEVEL_NAMES]);
    expectToMatchFixture(fixture, 'level_gap_em', () => [...LEVEL_GAP_EM]);
    expectToMatchFixture(fixture, 'max_level', () => MAX_LEVEL);
    expectToMatchFixture(fixture, 'word_gap_ratio', () => WORD_GAP_RATIO);
  });

  test('clamp_level', () => {
    expectToMatchFixture(fixture, 'clamp_level', ([level]) => clampLevel(level));
  });
});

describe('the numbers, pinned', () => {
  test('the gap at each level, in em', () => {
    expect([0, 1, 2, 3].map(letterGapEm)).toEqual([0, 0.1, 0.18, 0.3]);
    expect(letterGapEm(7)).toBe(0.3);
    expect(letterGapEm('2')).toBe(0);
  });
});

describe('wordSpacingEm', () => {
  // The gap between two words with CSS is the space, two letter gaps (one
  // after the last letter, one after the space) and the word-spacing.
  const cssGap = (gap: number, space: number) => space + 2 * gap + wordSpacingEm(gap, space);

  test('no letter gap changes nothing', () => {
    expect(wordSpacingEm(0, 0.25)).toBe(0);
    expect(wordSpacingEm(0, 0.85)).toBe(0);
  });

  test('a narrow space: the gap is twice the letter gap', () => {
    // Fredoka's space is about 0.25 em. At Large, twice 0.3 is wider.
    expect(cssGap(0.3, 0.25)).toBeCloseTo(0.6, 12);
    expect(cssGap(0.18, 0.25)).toBeCloseTo(0.36, 12);
  });

  test('a wide space: the gap is the space alone', () => {
    // OpenDyslexic's space is about 0.85 em, wider than twice any level.
    expect(cssGap(0.3, 0.85)).toBeCloseTo(0.85, 12);
    expect(cssGap(0.1, 0.25)).toBeCloseTo(0.25, 12);
  });

  test('never above zero: it only ever takes room back', () => {
    for (const gap of LEVEL_GAP_EM) {
      for (const space of [0, 0.1, 0.25, 0.5, 0.85, 1.5]) {
        expect(wordSpacingEm(gap, space)).toBeLessThanOrEqual(0);
      }
    }
  });
});
