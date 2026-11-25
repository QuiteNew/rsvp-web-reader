// Tests for what applying a reading profile does. First against the Python
// fixtures, made from the desktop's core/profile_apply.py, then the
// desktop's own tests/test_profile_apply.py, with the same test names.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { NUMBER_RANGES, clampValue, planProfile, type NumberKey } from './profileApply';
import { PROFILE_KEYS, valueIsValid } from './profiles';
import {
  DEFAULT_SAVED_SETTINGS,
  FONT_SIZE_RANGE,
  FONT_SIZE_STEP_RANGE,
  GUIDE_MARK_LENGTH_PERCENT_RANGE,
  GUIDE_MARK_THICKNESS_RANGE,
  HIGHLIGHT_OFFSET_RANGE,
  LETTER_SPACING_LEVEL_RANGE,
  RESUME_REWIND_WORDS_RANGE,
  SKIP_WORD_COUNT_RANGE,
  WPM_RANGE,
} from './settings';

const fixture = loadFixture('profiles');

// Python's ProfilePlan, as the fixtures record it.
function asPython(...args: Parameters<typeof planProfile>) {
  const plan = planProfile(...args);
  return { values: plan.values, guide_mark_follows_theme: plan.guideMarkFollowsTheme };
}

describe('against the Python fixtures', () => {
  test('NUMBER_RANGES', () => {
    expectToMatchFixture(fixture, 'NUMBER_RANGES', () => NUMBER_RANGES);
  });

  test('clamp_value', () => {
    expectToMatchFixture(fixture, 'clamp_value', ([key, value]) =>
      clampValue(key as NumberKey, value as number),
    );
  });

  test('plan_profile, with the keys in profile order', () => {
    expectToMatchFixture(fixture, 'plan_profile', ([values, current, follows, theme]) =>
      asPython(values, current as Record<string, unknown>, follows as boolean, theme as string),
    );
    // The comparison above does not look at the order of keys. The current
    // settings in the fixtures are already in profile order, so each case is
    // also run with them reversed, and the plan must still be in that order.
    const wrong: unknown[] = [];
    for (const [[values, current, follows, theme]] of fixture.functions['plan_profile'] ?? []) {
      const given = current as Record<string, unknown>;
      for (const order of [given, Object.fromEntries(Object.entries(given).reverse())]) {
        const plan = planProfile(values, order, follows as boolean, theme as string);
        if (Object.keys(plan.values).join() !== PROFILE_KEYS.join()) wrong.push(values);
      }
    }
    expect(wrong).toEqual([]);
  });
});

// ---- The desktop's tests/test_profile_apply.py ----

const THEME_COLOUR = '#F2E8DC';

// The settings as they are on a fresh install.
function current(): Record<string, unknown> {
  return Object.fromEntries(PROFILE_KEYS.map((key) => [key, DEFAULT_SAVED_SETTINGS[key]]));
}

function plan(
  profileValues: unknown,
  options: { current?: Record<string, unknown>; follows?: boolean; theme?: string } = {},
) {
  return planProfile(
    profileValues,
    options.current ?? current(),
    options.follows ?? true,
    options.theme ?? THEME_COLOUR,
  );
}

const RANGE_KEYS = (Object.keys(NUMBER_RANGES) as NumberKey[]).sort();

describe('the ranges agree with the real settings', () => {
  test('every number setting has a range', () => {
    const numberKeys = PROFILE_KEYS.filter(
      (key) => typeof DEFAULT_SAVED_SETTINGS[key] === 'number',
    );
    expect(new Set(numberKeys)).toEqual(new Set(Object.keys(NUMBER_RANGES)));
  });

  test('only profile keys have a range', () => {
    for (const key of Object.keys(NUMBER_RANGES)) {
      expect(PROFILE_KEYS as readonly string[]).toContain(key);
    }
  });

  // The same objects, not just the same numbers, so a range changed in
  // settings.ts changes here too.
  test('the ranges are the ones the settings window uses', () => {
    expect(NUMBER_RANGES.highlight_offset_px).toBe(HIGHLIGHT_OFFSET_RANGE);
    expect(NUMBER_RANGES.guide_mark_thickness_px).toBe(GUIDE_MARK_THICKNESS_RANGE);
    expect(NUMBER_RANGES.guide_mark_length_percent).toBe(GUIDE_MARK_LENGTH_PERCENT_RANGE);
    expect(NUMBER_RANGES.resume_rewind_words).toBe(RESUME_REWIND_WORDS_RANGE);
    expect(NUMBER_RANGES.skip_word_count).toBe(SKIP_WORD_COUNT_RANGE);
    expect(NUMBER_RANGES.default_wpm).toBe(WPM_RANGE);
    expect(NUMBER_RANGES.default_font_size).toBe(FONT_SIZE_RANGE);
    expect(NUMBER_RANGES.font_size_step).toBe(FONT_SIZE_STEP_RANGE);
    expect(NUMBER_RANGES.letter_spacing_level).toBe(LETTER_SPACING_LEVEL_RANGE);
  });

  test('every range has a low below its high', () => {
    for (const [key, [low, high]] of Object.entries(NUMBER_RANGES)) {
      expect(low, key).toBeLessThan(high);
    }
  });

  test('the real defaults sit inside their ranges', () => {
    for (const [key, [low, high]] of Object.entries(NUMBER_RANGES)) {
      const value = DEFAULT_SAVED_SETTINGS[key] as number;
      expect(value, key).toBeGreaterThanOrEqual(low);
      expect(value, key).toBeLessThanOrEqual(high);
    }
  });
});

describe('clampValue', () => {
  test.each(RANGE_KEYS)('a number below the range is raised to the low end: %s', (key) => {
    const [low] = NUMBER_RANGES[key];
    expect(clampValue(key, low - 1000)).toBe(low);
  });

  test.each(RANGE_KEYS)('a number above the range is lowered to the high end: %s', (key) => {
    const [, high] = NUMBER_RANGES[key];
    expect(clampValue(key, high + 1000)).toBe(high);
  });

  test.each(RANGE_KEYS)('the ends of the range are allowed as they are: %s', (key) => {
    const [low, high] = NUMBER_RANGES[key];
    expect(clampValue(key, low)).toBe(low);
    expect(clampValue(key, high)).toBe(high);
  });

  test('a number inside the range is left alone', () => {
    expect(clampValue('skip_word_count', 12)).toBe(12);
    expect(clampValue('highlight_offset_px', -2)).toBe(-2);
  });
});

describe('planProfile: numbers', () => {
  test('the plan clamps numbers from the profile', () => {
    const { values } = plan({
      skip_word_count: 999,
      highlight_offset_px: -50,
      guide_mark_thickness_px: 1,
      guide_mark_length_percent: 100,
      resume_rewind_words: 0,
    });
    expect(values.skip_word_count).toBe(SKIP_WORD_COUNT_RANGE[1]);
    expect(values.highlight_offset_px).toBe(HIGHLIGHT_OFFSET_RANGE[0]);
    expect(values.guide_mark_thickness_px).toBe(GUIDE_MARK_THICKNESS_RANGE[0]);
    expect(values.guide_mark_length_percent).toBe(GUIDE_MARK_LENGTH_PERCENT_RANGE[1]);
    expect(values.resume_rewind_words).toBe(RESUME_REWIND_WORDS_RANGE[0]);
  });

  test('the plan keeps numbers that are in range', () => {
    const { values } = plan({ skip_word_count: 25, resume_rewind_words: 4 });
    expect(values.skip_word_count).toBe(25);
    expect(values.resume_rewind_words).toBe(4);
  });

  test('the plan takes speed, word size and step from the profile', () => {
    const { values } = plan({ default_wpm: 450, default_font_size: 48, font_size_step: 4 });
    expect(values.default_wpm).toBe(450);
    expect(values.default_font_size).toBe(48);
    expect(values.font_size_step).toBe(4);
  });

  test('the plan clamps speed, word size and step', () => {
    const { values } = plan({ default_wpm: 5000, default_font_size: 4, font_size_step: 99 });
    expect(values.default_wpm).toBe(WPM_RANGE[1]);
    expect(values.default_font_size).toBe(FONT_SIZE_RANGE[0]);
    expect(values.font_size_step).toBe(FONT_SIZE_STEP_RANGE[1]);
  });

  test('the plan takes the letter spacing level from the profile', () => {
    expect(plan({ letter_spacing_level: 2 }).values.letter_spacing_level).toBe(2);
  });

  test('the plan clamps the letter spacing level to the levels that exist', () => {
    const [low, high] = LETTER_SPACING_LEVEL_RANGE;
    expect(plan({ letter_spacing_level: 99 }).values.letter_spacing_level).toBe(high);
    expect(plan({ letter_spacing_level: -4 }).values.letter_spacing_level).toBe(low);
  });

  test('a profile can turn the letter spacing off', () => {
    const now = { ...current(), letter_spacing_level: 3 };
    expect(plan({ letter_spacing_level: 0 }, { current: now }).values.letter_spacing_level).toBe(0);
  });
});

describe('planProfile: switches', () => {
  test('the plan takes switch values from the profile', () => {
    const keys = [
      'warm_up_enabled',
      'pause_on_skip',
      'length_pacing_enabled',
      'guide_mark_horizontal_enabled',
      'peripheral_context_enabled',
      'resume_rewind_enabled',
    ] as const;
    const { values } = plan(Object.fromEntries(keys.map((key) => [key, true])));
    for (const key of keys) expect(values[key], key).toBe(true);
  });

  test('a profile can switch something off', () => {
    const now = { ...current(), warm_up_enabled: true };
    expect(plan({ warm_up_enabled: false }, { current: now }).values.warm_up_enabled).toBe(false);
  });

  test('the plan takes the scrubber and paragraph switches from the profile', () => {
    const now = { ...current(), scrub_pause_enabled: true, split_long_paragraphs_enabled: false };
    const { values } = plan(
      { scrub_pause_enabled: false, split_long_paragraphs_enabled: true },
      { current: now },
    );
    expect(values.scrub_pause_enabled).toBe(false);
    expect(values.split_long_paragraphs_enabled).toBe(true);
  });
});

describe('planProfile: settings the profile leaves out', () => {
  test('the plan always holds every profile key', () => {
    expect(new Set(Object.keys(plan({}).values))).toEqual(new Set(PROFILE_KEYS));
    expect(new Set(Object.keys(plan({ skip_word_count: 25 }).values))).toEqual(
      new Set(PROFILE_KEYS),
    );
  });

  test('an empty profile changes nothing', () => {
    const now = {
      ...current(),
      skip_word_count: 7,
      warm_up_enabled: true,
      guide_mark_color: '#112233',
    };
    const result = plan({}, { current: now, follows: false });
    expect(result.values).toEqual(now);
    expect(result.guideMarkFollowsTheme).toBe(false);
  });

  test('settings the profile leaves out keep their current value', () => {
    const now = { ...current(), skip_word_count: 7, resume_rewind_words: 2, pause_on_skip: true };
    const { values } = plan({ skip_word_count: 25 }, { current: now });
    expect(values.skip_word_count).toBe(25);
    expect(values.resume_rewind_words).toBe(2);
    expect(values.pause_on_skip).toBe(true);
  });

  test('a profile saved before the newer settings joined leaves them as they are', () => {
    // The twelve settings profiles started with, and nothing else.
    const newer = [
      'default_wpm',
      'default_font_size',
      'font_size_step',
      'split_long_paragraphs_enabled',
      'scrub_pause_enabled',
      'letter_spacing_level',
    ];
    const older = Object.fromEntries(
      Object.entries(current()).filter(([key]) => !newer.includes(key)),
    );
    const now = {
      ...current(),
      default_wpm: 450,
      default_font_size: 48,
      font_size_step: 4,
      split_long_paragraphs_enabled: true,
      scrub_pause_enabled: false,
      letter_spacing_level: 2,
    };
    const { values } = plan(older, { current: now });
    for (const key of newer) {
      expect(values[key as keyof typeof values], key).toBe(now[key as keyof typeof now]);
    }
  });

  test('a current value that is out of range is left as it is when the profile leaves it out', () => {
    // Only what a profile sets is pulled into range. Anything else is not
    // this module's business to change.
    const now = { ...current(), skip_word_count: 999 };
    expect(plan({ warm_up_enabled: true }, { current: now }).values.skip_word_count).toBe(999);
  });
});

describe('planProfile: junk in the profile', () => {
  test('a value of the wrong kind is ignored and the current value stays', () => {
    const now = { ...current(), skip_word_count: 7, pause_on_skip: true };
    const { values } = plan({ skip_word_count: 'many', pause_on_skip: 0 }, { current: now });
    expect(values.skip_word_count).toBe(7);
    expect(values.pause_on_skip).toBe(true);
  });

  test('a bool is not accepted as a number', () => {
    const now = { ...current(), skip_word_count: 7 };
    expect(plan({ skip_word_count: true }, { current: now }).values.skip_word_count).toBe(7);
  });

  test('keys that are not part of a profile are ignored', () => {
    const { values } = plan({ wpm: 600, font_size: 28, window_width: 1200, skip_word_count: 25 });
    expect(new Set(Object.keys(values))).toEqual(new Set(PROFILE_KEYS));
    expect(values.skip_word_count).toBe(25);
  });

  test('a malformed colour is ignored and the current colour stays', () => {
    const now = { ...current(), guide_mark_color: '#112233' };
    const result = plan({ guide_mark_color: 'red' }, { current: now, follows: false });
    expect(result.values.guide_mark_color).toBe('#112233');
    expect(result.guideMarkFollowsTheme).toBe(false);
  });
});

describe('planProfile: the guide mark colour', () => {
  test("a colour that followed the theme gets the theme's colour and keeps following", () => {
    const now = { ...current(), guide_mark_color: '#112233' };
    const result = plan(
      { guide_mark_color: null },
      { current: now, follows: false, theme: '#F2E8DC' },
    );
    expect(result.values.guide_mark_color).toBe('#F2E8DC');
    expect(result.guideMarkFollowsTheme).toBe(true);
  });

  test("the theme's colour comes from the caller, so light and dark differ", () => {
    const light = plan({ guide_mark_color: null }, { theme: '#3B2E27' });
    const dark = plan({ guide_mark_color: null }, { theme: '#F2E8DC' });
    expect(light.values.guide_mark_color).toBe('#3B2E27');
    expect(dark.values.guide_mark_color).toBe('#F2E8DC');
  });

  test('a colour picked by hand is applied and stops following', () => {
    const result = plan({ guide_mark_color: '#AABBCC' }, { follows: true });
    expect(result.values.guide_mark_color).toBe('#AABBCC');
    expect(result.guideMarkFollowsTheme).toBe(false);
  });

  test('a hand-picked colour that matches the theme still stops following', () => {
    const result = plan({ guide_mark_color: THEME_COLOUR }, { follows: true, theme: THEME_COLOUR });
    expect(result.values.guide_mark_color).toBe(THEME_COLOUR);
    expect(result.guideMarkFollowsTheme).toBe(false);
  });

  test.each([true, false])(
    'a profile without a colour keeps the current colour and whether it follows: %s',
    (follows) => {
      const now = { ...current(), guide_mark_color: '#112233' };
      const result = plan({ skip_word_count: 25 }, { current: now, follows });
      expect(result.values.guide_mark_color).toBe('#112233');
      expect(result.guideMarkFollowsTheme).toBe(follows);
    },
  );

  test('the resolved colour is always a valid colour', () => {
    for (const profile of [{ guide_mark_color: null }, { guide_mark_color: '#AABBCC' }, {}]) {
      expect(valueIsValid('guide_mark_color', plan(profile).values.guide_mark_color)).toBe(true);
    }
  });
});

describe('planProfile: the inputs and the result', () => {
  test('the inputs are not changed', () => {
    const profile = { skip_word_count: 999, guide_mark_color: null };
    const now = { ...current(), guide_mark_color: '#112233' };
    const profileBefore = { ...profile };
    const currentBefore = { ...now };
    plan(profile, { current: now, follows: false });
    expect(profile).toEqual(profileBefore);
    expect(now).toEqual(currentBefore);
  });

  test('the result is a copy of the current settings', () => {
    const now = current();
    const result = plan({}, { current: now });
    result.values.skip_word_count = 1;
    expect(now.skip_word_count).not.toBe(1);
  });

  test('a current dict with extra keys is fine and they are left out of the plan', () => {
    const now = { ...current(), window_width: 1000, default_font_color: '#3B2E27' };
    expect(new Set(Object.keys(plan({}, { current: now }).values))).toEqual(new Set(PROFILE_KEYS));
  });

  // Python raises KeyError, which is not a ValueError, so this is a plain
  // Error and not a RangeError.
  test('a current dict missing a key raises', () => {
    const incomplete = current();
    delete incomplete.warm_up_enabled;
    expect(() => plan({}, { current: incomplete })).toThrow(Error);
    expect(() => plan({}, { current: incomplete })).not.toThrow(RangeError);
  });

  test('the plan cannot be changed after it is made', () => {
    const result = plan({});
    expect(Object.isFrozen(result)).toBe(true);
    expect(() => {
      (result as { guideMarkFollowsTheme: boolean }).guideMarkFollowsTheme = false;
    }).toThrow(TypeError);
  });
});
