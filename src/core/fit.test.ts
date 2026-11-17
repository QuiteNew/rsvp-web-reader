import { describe, expect, test } from 'vitest';
import { fitCandidates, fitRenderSize, requiredWidth } from './fit';
import type { ChunkText } from './reader';

// The expected values were worked out by hand from _fit_render_size(),
// _recompute_fit_widest() and _measure_reaches() in reader_display.py.
const text = (before: string, focus: string, after: string): ChunkText => ({
  before,
  focus,
  after,
});

describe('requiredWidth', () => {
  test('is twice the longer side, each side with half the focus letter', () => {
    expect(requiredWidth(10, 20, 100)).toBe(220);
    expect(requiredWidth(100, 20, 10)).toBe(220);
    expect(requiredWidth(0, 0, 0)).toBe(0);
  });
});

describe('fitRenderSize', () => {
  test('a flash that fits keeps the chosen size', () => {
    // 10 px of width per px of font: 400 px wide at size 40. Usable is 484.
    expect(fitRenderSize(40, 10, 500)).toBe(40);
  });

  test('one that does not is drawn at the largest size that fits, cut to a whole number', () => {
    // usable 300 - 16 = 284, and 284 / 10 = 28.4
    expect(fitRenderSize(40, 10, 300)).toBe(28);
  });

  test('never under 60 percent of the chosen size', () => {
    expect(fitRenderSize(40, 10, 100)).toBe(24);
    // 0.6 * 35 = 21
    expect(fitRenderSize(35, 100, 100)).toBe(21);
  });

  test('the floor is rounded as Python rounds, and is at least 8', () => {
    // 0.6 * 37.5 would be 22.5: to the even number
    expect(fitRenderSize(37.5, 100, 100)).toBe(22);
    expect(fitRenderSize(10, 100, 100)).toBe(8);
  });

  test('nothing measured, or a row with no size yet, gives the chosen size', () => {
    expect(fitRenderSize(40, null, 300)).toBe(40);
    expect(fitRenderSize(40, 0, 300)).toBe(40);
    expect(fitRenderSize(40, Number.NaN, 300)).toBe(40);
    expect(fitRenderSize(40, 10, 17)).toBe(40);
    expect(fitRenderSize(40, 10, 0)).toBe(40);
  });
});

describe('fitCandidates', () => {
  test('the longest by the wider side come first', () => {
    const texts = [
      text('a', 'b', 'c'),
      text('', 'x', 'a long tail'),
      text('longer before', 'y', ''),
    ];
    expect(fitCandidates(texts).map((t) => t.focus)).toEqual(['y', 'x', 'b']);
  });

  test('only twelve are kept, and ties stay in the order of the text', () => {
    const texts = Array.from({ length: 20 }, (_, index) => text('', String(index), 'same'));
    const kept = fitCandidates(texts);
    expect(kept).toHaveLength(12);
    expect(kept.map((t) => t.focus)).toEqual(texts.slice(0, 12).map((t) => t.focus));
  });

  test('an emoji counts as one character, as in Python', () => {
    const texts = [text('', 'a', '😀😀'), text('', 'b', 'abc')];
    expect(fitCandidates(texts)[0]?.focus).toBe('b');
  });

  test('the list given is not changed', () => {
    const texts = [text('', 'a', 'x'), text('', 'b', 'xxx')];
    fitCandidates(texts);
    expect(texts[0]?.focus).toBe('a');
  });
});
