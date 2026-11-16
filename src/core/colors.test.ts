// Tests for the colour helpers. First against the Python fixtures, then
// the desktop project's own tests/test_colors.py, replayed.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { blendColors, channels } from './colors';

const fixture = loadFixture('colors');

describe('against the desktop', () => {
  test('blend_colors', () => {
    expectToMatchFixture(fixture, 'blend_colors', ([a, b, ratio]) =>
      blendColors(a as string, b as string, ratio as number),
    );
  });

  test('_channels', () => {
    expectToMatchFixture(fixture, '_channels', ([value]) => channels(value as string));
  });
});

// The desktop's tests were run as they are, and every call they made was
// written down with its answer. The names are the Python ones.
describe('test_colors.py', () => {
  type Recorded = readonly [name: string, args: readonly unknown[], result: unknown];
  const recorded = (fixture.functions.desktop_tests ?? []).map(
    ([[name], calls]) => [name as string, calls as readonly Recorded[]] as const,
  );

  test('every desktop test was recorded', () => {
    expect(recorded.length).toBe(13);
    expect(recorded.every(([, calls]) => calls.length > 0)).toBe(true);
  });

  test.each(recorded)('%s', (_name, calls) => {
    for (const [name, args, expected] of calls) {
      if (name === 'blend_colors') {
        expect(blendColors(args[0] as string, args[1] as string, args[2] as number)).toBe(expected);
      } else {
        expect(channels(args[0] as string)).toEqual(expected);
      }
    }
  });
});

describe('what JSON cannot carry', () => {
  test('a ratio that is not a number blends all the way, as in Python', () => {
    // python3.13 -c "print(max(0.0, min(1.0, float('nan'))))" prints 1.0.
    expect(blendColors('#000000', '#FFFFFF', Number.NaN)).toBe('#FFFFFF');
    expect(blendColors('#000000', '#FFFFFF', Infinity)).toBe('#FFFFFF');
    expect(blendColors('#000000', '#FFFFFF', -Infinity)).toBe('#000000');
  });
});
