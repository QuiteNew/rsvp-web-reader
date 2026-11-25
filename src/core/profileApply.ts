// Working out what applying a reading profile actually does. Ported from
// core/profile_apply.py of the desktop app, checked against the plan_profile
// and clamp_value cases in fixtures/core/profiles.json.
//
// This is the pure step between a saved profile and the app. It takes the
// values a profile holds and the settings as they are right now, and hands
// back the complete set of values the app should end up with. The page then
// saves those the usual way, so nothing here touches a store or the screen.
//
// Three things are sorted out on the way:
//
// - Numbers are pulled into the same ranges the Settings window enforces. A
//   profile from a hand-edited file, an import, or a version with different
//   limits could otherwise hold a value the window would never allow.
// - A setting the profile does not hold is filled in from the current
//   settings, which is how "leave that setting alone" works. That also keeps
//   a profile saved before a setting joined the list working: the newer
//   settings are missing from it, so they stay as they are.
// - The guide mark colour is resolved against the current theme. A profile
//   that stored null was following the theme when it was saved, so it gets
//   the theme's colour now and keeps following. A colour picked by hand is
//   applied as it is and stops following.

import { PROFILE_KEYS, sanitizeValues, type ProfileKey } from './profiles';
import {
  FONT_SIZE_RANGE,
  FONT_SIZE_STEP_RANGE,
  GUIDE_MARK_LENGTH_PERCENT_RANGE,
  GUIDE_MARK_THICKNESS_RANGE,
  HIGHLIGHT_OFFSET_RANGE,
  LETTER_SPACING_LEVEL_RANGE,
  RESUME_REWIND_WORDS_RANGE,
  SKIP_WORD_COUNT_RANGE,
  WPM_RANGE,
  type Range,
} from './settings';

/**
 * The allowed [low, high] for every profile setting that is a number. These
 * are the very constants the Settings window checks its boxes against.
 */
export const NUMBER_RANGES = Object.freeze({
  highlight_offset_px: HIGHLIGHT_OFFSET_RANGE,
  guide_mark_thickness_px: GUIDE_MARK_THICKNESS_RANGE,
  guide_mark_length_percent: GUIDE_MARK_LENGTH_PERCENT_RANGE,
  resume_rewind_words: RESUME_REWIND_WORDS_RANGE,
  skip_word_count: SKIP_WORD_COUNT_RANGE,
  default_wpm: WPM_RANGE,
  default_font_size: FONT_SIZE_RANGE,
  font_size_step: FONT_SIZE_STEP_RANGE,
  letter_spacing_level: LETTER_SPACING_LEVEL_RANGE,
} satisfies Partial<Record<ProfileKey, Range>>);

export type NumberKey = keyof typeof NUMBER_RANGES;

function isNumberKey(key: string): key is NumberKey {
  return Object.hasOwn(NUMBER_RANGES, key);
}

/**
 * What the app should hold after a profile is applied. values has every key
 * in PROFILE_KEYS, numbers already pulled into range, with the guide mark
 * colour already resolved to a "#RRGGBB" text. guideMarkFollowsTheme says
 * whether that colour should keep tracking the Light/Dark theme.
 */
export interface ProfilePlan {
  readonly values: Record<ProfileKey, unknown>;
  readonly guideMarkFollowsTheme: boolean;
}

/** Pull a number into the allowed range for its setting. */
export function clampValue(key: NumberKey, value: number): number {
  const [low, high] = NUMBER_RANGES[key];
  return Math.max(low, Math.min(high, value));
}

/**
 * Work out the result of applying a profile.
 *
 * profileValues is what the profile holds. Anything in it that is not a
 * known key with a valid value is ignored, the same as when profiles are
 * loaded. currentValues must have every key in PROFILE_KEYS (a missing one
 * throws, since that means the caller and this module disagree about what a
 * profile holds), and it is what fills in the settings the profile leaves
 * out. currentGuideFollowsTheme is whether the guide mark colour follows the
 * theme right now. themeGuideMarkColor is the colour the current theme gives
 * the guide marks.
 *
 * Neither input is changed. The plan is frozen, and its values are a fresh
 * object.
 */
export function planProfile(
  profileValues: unknown,
  currentValues: Readonly<Record<string, unknown>>,
  currentGuideFollowsTheme: boolean,
  themeGuideMarkColor: string,
): ProfilePlan {
  const values: Partial<Record<ProfileKey, unknown>> = {};
  for (const key of PROFILE_KEYS) {
    if (!Object.hasOwn(currentValues, key)) {
      throw new Error(`The current settings have no ${key}, which every profile holds`);
    }
    values[key] = currentValues[key];
  }
  let followsTheme = currentGuideFollowsTheme;

  for (const [key, value] of Object.entries(sanitizeValues(profileValues))) {
    if (key === 'guide_mark_color') {
      if (value === null) {
        values[key] = themeGuideMarkColor;
        followsTheme = true;
      } else {
        values[key] = value;
        followsTheme = false;
      }
    } else if (isNumberKey(key)) {
      // sanitizeValues() let only whole numbers through for these keys.
      values[key] = clampValue(key, value as number);
    } else {
      values[key as ProfileKey] = value;
    }
  }

  return Object.freeze({
    values: values as Record<ProfileKey, unknown>,
    guideMarkFollowsTheme: followsTheme,
  });
}
