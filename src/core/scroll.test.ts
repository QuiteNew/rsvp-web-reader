// Tests for the scrollbar's pan arithmetic: the Python fixtures first, then
// the desktop project's own tests/test_scroll.py, replayed.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { clampPan, panFromFraction, panRange, scrollbarFractions } from './scroll';

const fixture = loadFixture('scroll');

// Minus zero is written as zero in the fixture (see build_scroll in the
// fixture script). The scrollbar cannot tell them apart.
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  return value === 0 ? 0 : value;
}

const RUN: Record<string, (args: readonly unknown[]) => unknown> = {
  pan_range: ([left, right]) => panRange(left as number, right as number),
  clamp_pan: ([pan, left, right]) => clampPan(pan as number, left as number, right as number),
  scrollbar_fractions: ([viewport, left, right, pan]) =>
    scrollbarFractions(viewport as number, left as number, right as number, pan as number),
  pan_from_fraction: ([first, viewport, left, right]) =>
    panFromFraction(first as number, viewport as number, left as number, right as number),
};

describe('against the desktop', () => {
  test.each(Object.keys(RUN))('%s', (name) => {
    const run = RUN[name];
    if (run === undefined) throw new Error(name);
    expectToMatchFixture(fixture, name, (args) => plain(run(args)));
  });
});

describe('test_scroll.py', () => {
  type Recorded = readonly [name: string, args: readonly unknown[], result: unknown];
  const recorded = (fixture.functions.desktop_tests ?? []).map(
    ([[name], calls]) => [name as string, calls as readonly Recorded[]] as const,
  );

  test('every desktop test was recorded', () => {
    expect(recorded.length).toBe(7);
    expect(recorded.every(([, calls]) => calls.length > 0)).toBe(true);
  });

  test.each(recorded)('%s', (_name, calls) => {
    for (const [name, args, expected] of calls) {
      const run = RUN[name];
      if (run === undefined) throw new Error(`no port of ${name}`);
      expect(plain(run(args))).toEqual(expected);
    }
  });
});
