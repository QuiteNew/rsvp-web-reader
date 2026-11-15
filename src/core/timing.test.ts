import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { pyRound } from './pythonText';
import { PACE_CLAUSE, PACE_NONE, PACE_SENTENCE } from './punctuation';
import {
  CLAUSE_PAUSE_MULTIPLIER,
  HYPHEN_PACING_BONUS_CHARS,
  LONG_WORD_MULTIPLIER,
  MEDIUM_WORD_MULTIPLIER,
  SENTENCE_PAUSE_MULTIPLIER,
  VERY_LONG_WORD_MULTIPLIER,
  WARM_UP_START_MULTIPLIER,
  WARM_UP_WORD_COUNT,
  applyLengthMultiplier,
  applyPacingMultiplier,
  applyWarmUp,
  effectivePacingLength,
  formatDuration,
  lengthMultiplier,
  pacingMultiplier,
  warmUpMultiplier,
  wpmToDelayMs,
} from './timing';

describe('against the Python fixtures', () => {
  const fixture = loadFixture('timing');
  const cases: [string, (args: readonly unknown[]) => unknown][] = [
    ['wpm_to_delay_ms', ([wpm]) => wpmToDelayMs(wpm as number)],
    ['pacing_multiplier', ([pace]) => pacingMultiplier(pace as string)],
    [
      'apply_pacing_multiplier',
      ([base, pace]) => applyPacingMultiplier(base as number, pace as string),
    ],
    ['effective_pacing_length', ([word]) => effectivePacingLength(word as string)],
    ['length_multiplier', ([band]) => lengthMultiplier(band as number)],
    [
      'apply_length_multiplier',
      ([base, band]) => applyLengthMultiplier(base as number, band as number),
    ],
    ['warm_up_multiplier', ([shown]) => warmUpMultiplier(shown as number)],
    ['apply_warm_up', ([base, shown]) => applyWarmUp(base as number, shown as number)],
    ['format_duration', ([seconds]) => formatDuration(seconds as number)],
  ];

  test.each(cases)('%s', (pythonName, run) => {
    expectToMatchFixture(fixture, pythonName, run);
  });
});

// Ported from tests/test_timing.py.

test.each([
  ['300_wpm_gives_200ms', 300, 200],
  ['200_wpm_gives_300ms', 200, 300],
  ['400_wpm_gives_150ms', 400, 150],
  ['600_wpm_gives_100ms', 600, 100],
  ['minimum_app_wpm_100_gives_600ms', 100, 600],
  ['maximum_app_wpm_1000_gives_60ms', 1000, 60],
  ['rounds_rather_than_truncates', 700, 86],
])('%s', (_name, wpm, expected) => {
  expect(wpmToDelayMs(wpm)).toBe(expected);
});

test('zero_wpm_raises_value_error', () => {
  expect(() => wpmToDelayMs(0)).toThrow(RangeError);
});

test('negative_wpm_raises_value_error', () => {
  expect(() => wpmToDelayMs(-50)).toThrow(RangeError);
});

test('higher_wpm_gives_shorter_delay', () => {
  expect(wpmToDelayMs(600)).toBeLessThan(wpmToDelayMs(300));
});

// Not in the Python tests: speeds where the delay is exactly a half.
// Math.round would give 313 and 63.
test('a half-millisecond delay rounds to the even number, as Python does', () => {
  expect(wpmToDelayMs(192)).toBe(312);
  expect(wpmToDelayMs(960)).toBe(62);
});

describe('applyPacingMultiplier', () => {
  test('pace_none_returns_base_delay_unchanged', () => {
    expect(applyPacingMultiplier(200, PACE_NONE)).toBe(200);
  });

  test('pace_clause_multiplies_by_1_5', () => {
    expect(applyPacingMultiplier(200, PACE_CLAUSE)).toBe(300);
  });

  test('pace_sentence_multiplies_by_2_5', () => {
    expect(applyPacingMultiplier(200, PACE_SENTENCE)).toBe(500);
  });

  test('pace_sentence_pause_is_longer_than_pace_clause_pause', () => {
    expect(applyPacingMultiplier(200, PACE_SENTENCE)).toBeGreaterThan(
      applyPacingMultiplier(200, PACE_CLAUSE),
    );
  });

  test('apply_pacing_multiplier_rounds_rather_than_truncates', () => {
    // 89 * 1.5 is exactly 133.5. A halfway value goes to the nearest even
    // number, 134. Truncating would have given 133.
    expect(applyPacingMultiplier(89, PACE_CLAUSE)).toBe(134);
  });

  test('a half that Math.round would send the wrong way', () => {
    // 203 * 1.5 is exactly 304.5. Python gives 304, Math.round gives 305.
    expect(applyPacingMultiplier(203, PACE_CLAUSE)).toBe(304);
  });

  test('apply_pacing_multiplier_unrecognized_pace_falls_back_to_base_delay', () => {
    // An unknown or future pacing value means no extra pause. It must not
    // crash playback.
    expect(applyPacingMultiplier(200, 'not-a-real-pace')).toBe(200);
  });
});

describe('applyLengthMultiplier', () => {
  test.each([
    ['length_band_0_returns_base_delay_unchanged', 0, 200],
    ['length_band_1_returns_base_delay_unchanged', 1, 200],
    ['length_band_2_multiplies_by_1_2', 2, 240],
    ['length_band_3_multiplies_by_1_45', 3, 290],
    ['length_band_4_multiplies_by_1_7', 4, 340],
    // The check is >= 4, so a higher band does not quietly fall through to
    // no extra pause.
    ['length_band_beyond_4_still_gets_top_multiplier', 5, 340],
    ['length_negative_band_falls_back_to_base_delay', -1, 200],
  ])('%s', (_name, band, expected) => {
    expect(applyLengthMultiplier(200, band)).toBe(expected);
  });

  test('length_multiplier_increases_with_band', () => {
    const delays = [1, 2, 3, 4].map((band) => applyLengthMultiplier(200, band));
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(4);
  });
});

describe('effectivePacingLength', () => {
  test('effective_pacing_length_matches_len_for_a_plain_word', () => {
    expect(effectivePacingLength('understanding')).toBe('understanding'.length);
  });

  test('effective_pacing_length_for_empty_string_is_zero', () => {
    expect(effectivePacingLength('')).toBe(0);
  });

  test('effective_pacing_length_adds_bonus_for_one_internal_hyphen', () => {
    expect(effectivePacingLength('sub-terrain')).toBe(
      'sub-terrain'.length + HYPHEN_PACING_BONUS_CHARS,
    );
  });

  test('effective_pacing_length_adds_bonus_per_hyphen_for_multiple_hyphens', () => {
    expect(effectivePacingLength('step-by-step')).toBe(
      'step-by-step'.length + 2 * HYPHEN_PACING_BONUS_CHARS,
    );
  });

  test('effective_pacing_length_is_strictly_greater_than_len_when_hyphenated', () => {
    expect(effectivePacingLength('well-known')).toBeGreaterThan('well-known'.length);
  });

  test('an emoji counts as one character', () => {
    expect(effectivePacingLength('a😀b')).toBe(3);
  });
});

describe('warmUpMultiplier', () => {
  test('warm_up_multiplier_starts_at_the_start_multiplier', () => {
    expect(warmUpMultiplier(0)).toBe(WARM_UP_START_MULTIPLIER);
  });

  test('warm_up_multiplier_reaches_one_at_the_ramp_end', () => {
    expect(warmUpMultiplier(WARM_UP_WORD_COUNT)).toBe(1.0);
  });

  test('warm_up_multiplier_stays_one_past_the_ramp_end', () => {
    expect(warmUpMultiplier(WARM_UP_WORD_COUNT + 50)).toBe(1.0);
  });

  test('warm_up_multiplier_negative_words_clamp_to_the_start_multiplier', () => {
    expect(warmUpMultiplier(-5)).toBe(WARM_UP_START_MULTIPLIER);
  });

  test('warm_up_multiplier_is_halfway_at_the_ramp_midpoint', () => {
    const midpoint = Math.floor(WARM_UP_WORD_COUNT / 2);
    const expected =
      1.0 +
      (WARM_UP_START_MULTIPLIER - 1.0) * ((WARM_UP_WORD_COUNT - midpoint) / WARM_UP_WORD_COUNT);
    expect(warmUpMultiplier(midpoint)).toBeCloseTo(expected, 12);
  });

  test('warm_up_multiplier_decreases_monotonically_across_the_ramp', () => {
    const values = Array.from({ length: WARM_UP_WORD_COUNT + 1 }, (_, words) =>
      warmUpMultiplier(words),
    );
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index - 1]).toBeGreaterThanOrEqual(values[index] ?? Infinity);
    }
    expect(values[0]).toBeGreaterThan(values[values.length - 1] ?? Infinity);
  });
});

describe('applyWarmUp', () => {
  test('apply_warm_up_at_start_scales_by_the_start_multiplier', () => {
    expect(applyWarmUp(200, 0)).toBe(pyRound(200 * WARM_UP_START_MULTIPLIER));
  });

  test('apply_warm_up_after_ramp_leaves_delay_unchanged', () => {
    expect(applyWarmUp(200, WARM_UP_WORD_COUNT)).toBe(200);
  });

  test('apply_warm_up_never_shortens_the_delay', () => {
    for (let words = 0; words < WARM_UP_WORD_COUNT + 5; words += 1) {
      expect(applyWarmUp(200, words)).toBeGreaterThanOrEqual(200);
    }
  });
});

describe('the raw multipliers', () => {
  test('pacing_multiplier_values', () => {
    expect(pacingMultiplier(PACE_SENTENCE)).toBe(SENTENCE_PAUSE_MULTIPLIER);
    expect(pacingMultiplier(PACE_CLAUSE)).toBe(CLAUSE_PAUSE_MULTIPLIER);
    expect(pacingMultiplier(PACE_NONE)).toBe(1.0);
  });

  test('pacing_multiplier_unknown_is_one', () => {
    expect(pacingMultiplier('not-a-real-pace')).toBe(1.0);
  });

  test('apply_pacing_multiplier_matches_the_float_multiplier', () => {
    for (const pace of [PACE_SENTENCE, PACE_CLAUSE, PACE_NONE, 'unknown']) {
      expect(applyPacingMultiplier(200, pace)).toBe(pyRound(200 * pacingMultiplier(pace)));
    }
  });

  test('length_multiplier_values', () => {
    expect(lengthMultiplier(0)).toBe(1.0);
    expect(lengthMultiplier(1)).toBe(1.0);
    expect(lengthMultiplier(2)).toBe(MEDIUM_WORD_MULTIPLIER);
    expect(lengthMultiplier(3)).toBe(LONG_WORD_MULTIPLIER);
    expect(lengthMultiplier(4)).toBe(VERY_LONG_WORD_MULTIPLIER);
  });

  test('length_multiplier_beyond_band_4_stays_at_top', () => {
    expect(lengthMultiplier(5)).toBe(VERY_LONG_WORD_MULTIPLIER);
  });

  test('length_multiplier_negative_is_one', () => {
    expect(lengthMultiplier(-1)).toBe(1.0);
  });

  test('apply_length_multiplier_matches_the_float_multiplier', () => {
    for (const band of [0, 1, 2, 3, 4, 5, -1]) {
      expect(applyLengthMultiplier(200, band)).toBe(pyRound(200 * lengthMultiplier(band)));
    }
  });
});

test.each([
  ['zero', 0, '0s'],
  ['seconds_only', 45, '45s'],
  ['just_under_a_minute', 59, '59s'],
  ['minutes_and_seconds', 72, '1m 12s'],
  ['pads_seconds', 65, '1m 05s'],
  ['many_minutes', 754, '12m 34s'],
  ['exactly_one_hour', 3600, '1h 00m'],
  ['hours_drop_seconds', 3900, '1h 05m'],
  ['negative_clamps_to_zero', -5, '0s'],
])('format_duration_%s', (_name, seconds, expected) => {
  expect(formatDuration(seconds)).toBe(expected);
});
