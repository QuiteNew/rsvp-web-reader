// Tests for the normalizer. First against the Python fixtures, then the
// desktop project's own tests (tests/test_normalizer.py), then the helpers
// that had to be written for it.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import {
  canRevert,
  normalizeTranscript,
  splitNumberedRun,
  splitSentences,
  toggleNormalization,
} from './normalizer';
import { isPyDigit, pyInt } from './pythonText';

const fixture = loadFixture('normalizer');

function toggled(args: readonly unknown[]): string[] {
  const [current, before, normalized, split] = args as [string, string, string, boolean?];
  const result = toggleNormalization(current, before, normalized, split);
  return [result.text, result.preNormalizeText, result.normalizedText];
}

describe('against the desktop', () => {
  test('normalize_transcript', () => {
    expectToMatchFixture(fixture, 'normalize_transcript', ([text, split]) =>
      normalizeTranscript(text as string, split as boolean),
    );
  });

  test('_split_numbered_run', () => {
    expectToMatchFixture(fixture, '_split_numbered_run', ([line]) =>
      splitNumberedRun(line as string),
    );
  });

  test('_split_sentences', () => {
    expectToMatchFixture(fixture, '_split_sentences', ([line]) => splitSentences(line as string));
  });

  test('can_revert', () => {
    expectToMatchFixture(fixture, 'can_revert', ([current, before, normalized]) =>
      canRevert(current as string, before as string, normalized as string),
    );
  });

  test('toggle_normalization', () => {
    expectToMatchFixture(fixture, 'toggle_normalization', toggled);
  });
});

// The desktop's tests were run as they are, and every call they made to the
// normalizer was written down with what it returned. Each one passed there,
// so if the same calls give the same here, it holds here. The names are the
// Python ones, to be found in tests/test_normalizer.py.
describe('test_normalizer.py', () => {
  type Recorded = readonly [name: string, args: readonly unknown[], result: unknown];
  const recorded = (fixture.functions.desktop_tests ?? []).map(
    ([[name], calls]) => [name as string, calls as readonly Recorded[]] as const,
  );

  test('every desktop test was recorded', () => {
    expect(recorded.length).toBe(113);
    expect(recorded.every(([, calls]) => calls.length > 0)).toBe(true);
  });

  test.each(recorded)('%s', (_name, calls) => {
    for (const [name, args, expected] of calls) {
      if (name === 'normalize_transcript') {
        expect(normalizeTranscript(args[0] as string, args[1] as boolean | undefined)).toBe(
          expected,
        );
      } else if (name === 'toggle_normalization') {
        expect(toggled(args)).toEqual(expected);
      } else {
        expect(canRevert(args[0] as string, args[1] as string, args[2] as string)).toBe(expected);
      }
    }
  });
});

describe('digits the way Python reads them', () => {
  test('isdigit is more than 0 to 9', () => {
    for (const digit of ['0', '9', '٣', '²', '①', '１']) expect(isPyDigit(digit), digit).toBe(true);
    for (const other of ['a', '½', 'Ⅳ', ' ', '']) expect(isPyDigit(other), other).toBe(false);
  });

  test('int reads the digits of any script', () => {
    expect(pyInt('12')).toBe(12);
    expect(pyInt('٣')).toBe(3);
    expect(pyInt('1٢')).toBe(12);
    expect(pyInt('\u{1d7ce}\u{1d7d9}')).toBe(1);
    expect(pyInt('')).toBe(0);
    expect(() => pyInt('x')).toThrow(RangeError);
  });
});
