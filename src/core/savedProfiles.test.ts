// Tests for the saved reading profiles. The desktop's own store tests are
// replayed in storeTests.desktop.test.ts. This file replays the fixture
// script's steps, aimed at what those tests leave out, and checks what a
// pure function promises that a store with one list in it never had to.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { PROFILE_METHODS, runProfileStep } from '../testing/profileSteps';
import { PROFILE_KEYS, ProfileError } from './profiles';
import {
  addProfile,
  applyProfile,
  currentProfileSettings,
  deleteProfile,
  getProfile,
  profileNames,
  renameProfile,
  savedProfiles,
  snapshotValues,
  updateProfile,
} from './savedProfiles';
import type { SavedSettings } from './savedShapes';
import {
  DEFAULT_SAVED_SETTINGS,
  GUIDE_MARK_THICKNESS_RANGE,
  LETTER_SPACING_LEVEL_RANGE,
  SKIP_WORD_COUNT_RANGE,
  restoreGuideMarkColor,
} from './settings';
import { themeGuideMarkColor } from './theme';

const fixture = loadFixture('settings');

const FAST = { skip_word_count: 25, warm_up_enabled: true };

function withTwo(): SavedSettings {
  return {
    ...DEFAULT_SAVED_SETTINGS,
    profiles: [
      { name: 'Fast skim', values: FAST },
      { name: 'Careful read', values: { pause_on_skip: true } },
    ],
  };
}

describe('against the desktop store', () => {
  test('a script of steps through every method, with the messages', () => {
    expectToMatchFixture(fixture, 'profile_steps', ([before, method, args]) =>
      runProfileStep(before, method as string, args as readonly unknown[]),
    );
  });

  test('the script reaches every method, and both outcomes of each but get', () => {
    const seen = new Set(
      (fixture.functions.profile_steps ?? []).map(
        ([args, result]) => `${String(args[1])} ${String((result as unknown[])[0])}`,
      ),
    );
    for (const method of PROFILE_METHODS) {
      expect(seen.has(`${method} ok`), method).toBe(true);
      if (method !== 'get_profile') expect(seen.has(`${method} error`), method).toBe(true);
    }
  });
});

describe('only the profiles change', () => {
  test('every other setting is the same value, in the same object', () => {
    const before = withTwo();
    const afters = [
      addProfile(before, 'Slow', {}).saved,
      updateProfile(before, 'Fast skim', {}).saved,
      renameProfile(before, 'Fast skim', 'Quick').saved,
      deleteProfile(before, 'Careful read'),
    ];
    for (const after of afters) {
      expect(after).not.toBe(before);
      for (const key of Object.keys(before)) {
        if (key !== 'profiles') expect(after[key], key).toBe(before[key]);
      }
      expect(Object.keys(after)).toEqual(Object.keys(before));
    }
  });

  test('the settings handed in are not changed', () => {
    const before = withTwo();
    const copy = structuredClone(before);
    addProfile(before, 'Slow', {});
    updateProfile(before, 'Fast skim', { skip_word_count: 3 });
    renameProfile(before, 'Fast skim', 'Quick');
    deleteProfile(before, 'Careful read');
    expect(before).toEqual(copy);
  });

  test('a refused change throws ProfileError and gives nothing back', () => {
    const before = withTwo();
    expect(() => addProfile(before, 'FAST SKIM', {})).toThrow(ProfileError);
    expect(() => renameProfile(before, 'Nope', 'B')).toThrow('There is no profile called "Nope".');
  });
});

describe('copies', () => {
  // The desktop's test_changing_a_returned_profile_does_not_change_the_store.
  test('changing a profile that was looked up does not change the saved one', () => {
    const saved = withTwo();
    const found = getProfile(saved, 'Fast skim') as { values: Record<string, unknown> };
    found.values.skip_word_count = 1;
    expect(getProfile(saved, 'Fast skim')?.values).toEqual(FAST);
  });

  // The desktop's test_changing_the_values_given_to_add_profile_does_not_change_the_store.
  test('changing the values given to addProfile does not change the saved ones', () => {
    const values: Record<string, unknown> = { ...FAST };
    const { saved } = addProfile(DEFAULT_SAVED_SETTINGS, 'Fast skim', values);
    values.skip_word_count = 1;
    expect(getProfile(saved, 'Fast skim')?.values).toEqual(FAST);
  });
});

describe('the list as it is saved', () => {
  test('names in the order they were added', () => {
    let saved: SavedSettings = DEFAULT_SAVED_SETTINGS;
    for (const name of ['B', 'A', 'C']) saved = addProfile(saved, name, {}).saved;
    expect(profileNames(saved)).toEqual(['B', 'A', 'C']);
  });

  test('a list that was never checked is checked on the way out', () => {
    const saved = { ...DEFAULT_SAVED_SETTINGS, profiles: ['junk', { name: ' A ', values: {} }] };
    expect(savedProfiles(saved)).toEqual([{ name: 'A', values: {} }]);
    expect(savedProfiles({ ...DEFAULT_SAVED_SETTINGS, profiles: 'junk' })).toEqual([]);
  });
});

// ---- Taking a snapshot and applying a profile ----
// The desktop's tests for these drive its window (tests/test_gui_smoke.py,
// the reading profile part). Those about the settings themselves are ported
// here with their names. Those about widgets, the open reader and the
// detached window are not: the page reads the settings from the store, so
// what is saved is what the reader shows.

// The desktop's _PROFILE_VALUES: every setting, none at its default.
const EVERYTHING = {
  highlight_offset_px: 2,
  guide_mark_horizontal_enabled: true,
  guide_mark_thickness_px: 4,
  guide_mark_length_percent: 50,
  guide_mark_color: '#112233',
  length_pacing_enabled: true,
  warm_up_enabled: true,
  resume_rewind_enabled: true,
  resume_rewind_words: 5,
  peripheral_context_enabled: true,
  skip_word_count: 30,
  pause_on_skip: true,
  default_wpm: 450,
  default_font_size: 48,
  font_size_step: 4,
  split_long_paragraphs_enabled: true,
  scrub_pause_enabled: false,
  letter_spacing_level: 2,
} as const;

const LIGHT = themeGuideMarkColor(false);

// The desktop's _put_profile_settings_back: these settings, and whether the
// guide mark colour follows the theme.
function settingsWith(values: Record<string, unknown>, followsTheme: boolean): SavedSettings {
  const { guide_mark_color: color, ...rest } = values;
  return restoreGuideMarkColor(
    { ...DEFAULT_SAVED_SETTINGS, ...rest },
    (color ?? DEFAULT_SAVED_SETTINGS.guide_mark_color) as string,
    followsTheme,
  );
}

function withProfile(saved: SavedSettings, name: string, values: unknown): SavedSettings {
  return addProfile(saved, name, values).saved;
}

describe('applyProfile', () => {
  test('applying a profile changes every app-wide setting', () => {
    const saved = applyProfile(
      withProfile(DEFAULT_SAVED_SETTINGS, 'Everything', EVERYTHING),
      'Everything',
      LIGHT,
    );
    expect(currentProfileSettings(saved)).toEqual(EVERYTHING);
    expect(saved.guide_mark_color_is_default).toBe(false);
  });

  test('applying a profile leaves the colours, chunking and everything else alone', () => {
    const before = withProfile(
      {
        ...DEFAULT_SAVED_SETTINGS,
        default_font_color: '#445566',
        default_highlight_color: '#778899',
        default_background_color: '#AABBCC',
        default_chunking_enabled: true,
        default_chunk_size: 4,
        appearance_mode: 'dark',
        dyslexia_font_enabled: true,
        bold_starts_enabled: true,
        speaker_cues_enabled: true,
      },
      'Everything',
      EVERYTHING,
    );
    const after = applyProfile(before, 'Everything', LIGHT);
    const touched = new Set<string>([...PROFILE_KEYS, 'guide_mark_color_is_default']);
    for (const key of Object.keys(before)) {
      if (!touched.has(key)) expect(after[key], key).toBe(before[key]);
    }
    expect(Object.keys(after)).toEqual(Object.keys(before));
  });

  test('applying a profile moves the speed and word size defaults', () => {
    const saved = withProfile(DEFAULT_SAVED_SETTINGS, 'Quick', {
      default_wpm: 450,
      default_font_size: 48,
    });
    const after = applyProfile(saved, 'Quick', LIGHT);
    expect(after.default_wpm).toBe(450);
    expect(after.default_font_size).toBe(48);
    expect(after.default_font_color).toBe(saved.default_font_color);
  });

  test('a profile saved before speed and size joined leaves them alone', () => {
    const older = Object.fromEntries(
      Object.entries(EVERYTHING).filter(
        ([key]) =>
          ![
            'default_wpm',
            'default_font_size',
            'font_size_step',
            'split_long_paragraphs_enabled',
            'scrub_pause_enabled',
            'letter_spacing_level',
          ].includes(key),
      ),
    );
    const saved = withProfile(
      { ...DEFAULT_SAVED_SETTINGS, default_wpm: 420, default_font_size: 40 },
      'Older',
      older,
    );
    const after = applyProfile(saved, 'Older', LIGHT);
    expect(after.skip_word_count).toBe(30);
    expect(after.default_wpm).toBe(420);
    expect(after.default_font_size).toBe(40);
  });

  test('a profile saved before letter spacing joined leaves the spacing alone', () => {
    const saved = withProfile(
      { ...DEFAULT_SAVED_SETTINGS, letter_spacing_level: 3 },
      'No spacing in it',
      { skip_word_count: 7 },
    );
    const after = applyProfile(saved, 'No spacing in it', LIGHT);
    expect(after.skip_word_count).toBe(7);
    expect(after.letter_spacing_level).toBe(3);
  });

  test('a profile that holds only some settings leaves the rest as they are', () => {
    const before = settingsWith({ ...EVERYTHING, skip_word_count: 12, pause_on_skip: true }, false);
    const after = applyProfile(
      withProfile(before, 'Only skip', { skip_word_count: 7 }),
      'Only skip',
      LIGHT,
    );
    expect(after.skip_word_count).toBe(7);
    expect(after.pause_on_skip).toBe(true);
    expect(after.guide_mark_thickness_px).toBe(4);
    expect(after.resume_rewind_words).toBe(5);
  });

  test('a number outside the allowed range is clamped when applied', () => {
    const saved = withProfile(DEFAULT_SAVED_SETTINGS, 'Too much', {
      skip_word_count: 999,
      guide_mark_thickness_px: 1,
    });
    const after = applyProfile(saved, 'Too much', LIGHT);
    expect(after.skip_word_count).toBe(SKIP_WORD_COUNT_RANGE[1]);
    expect(after.guide_mark_thickness_px).toBe(GUIDE_MARK_THICKNESS_RANGE[0]);
  });

  test("a profile that followed the theme gets the theme's guide colour back", () => {
    const before = restoreGuideMarkColor(DEFAULT_SAVED_SETTINGS, '#AABBCC', false);
    const dark = themeGuideMarkColor(true);
    const after = applyProfile(
      withProfile(before, 'Themed', { guide_mark_color: null }),
      'Themed',
      dark,
    );
    expect(after.guide_mark_color).toBe(dark);
    expect(after.guide_mark_color_is_default).toBe(true);
  });

  // Not one of the desktop's window tests. Its plan test covers it, and this
  // checks the flag gets through to the saved settings too.
  test('a profile without a colour leaves the colour following the theme if it was', () => {
    const before = withProfile(DEFAULT_SAVED_SETTINGS, 'Only skip', { skip_word_count: 7 });
    expect(before.guide_mark_color_is_default).toBe(true);
    const after = applyProfile(before, 'Only skip', LIGHT);
    expect(after.guide_mark_color_is_default).toBe(true);
    expect(after.guide_mark_color).toBe(before.guide_mark_color);
  });

  test('a letter spacing level outside the levels is clamped when applied', () => {
    const saved = withProfile(DEFAULT_SAVED_SETTINGS, 'Far too much', { letter_spacing_level: 99 });
    expect(applyProfile(saved, 'Far too much', LIGHT).letter_spacing_level).toBe(
      LETTER_SPACING_LEVEL_RANGE[1],
    );
  });

  test('applying a profile leaves the font switch alone', () => {
    const saved = withProfile(
      { ...DEFAULT_SAVED_SETTINGS, dyslexia_font_enabled: true },
      'Everything',
      {
        ...EVERYTHING,
        dyslexia_font_enabled: false,
      },
    );
    expect(applyProfile(saved, 'Everything', LIGHT).dyslexia_font_enabled).toBe(true);
  });

  test('a guide colour picked by hand stops following even when it matches the theme', () => {
    const before = restoreGuideMarkColor(DEFAULT_SAVED_SETTINGS, LIGHT, true);
    const after = applyProfile(
      withProfile(before, 'Hand picked', { guide_mark_color: LIGHT }),
      'Hand picked',
      LIGHT,
    );
    expect(after.guide_mark_color).toBe(LIGHT);
    expect(after.guide_mark_color_is_default).toBe(false);
  });

  test('applying a profile that does not exist raises and changes nothing', () => {
    const before = structuredClone(DEFAULT_SAVED_SETTINGS);
    expect(() => applyProfile(DEFAULT_SAVED_SETTINGS, 'Nope', LIGHT)).toThrow(ProfileError);
    expect(() => applyProfile(DEFAULT_SAVED_SETTINGS, 'Nope', LIGHT)).toThrow('Nope');
    expect(DEFAULT_SAVED_SETTINGS).toEqual(before);
  });
});

describe('snapshotValues', () => {
  test('the snapshot holds every profile setting', () => {
    expect(new Set(Object.keys(snapshotValues(DEFAULT_SAVED_SETTINGS)))).toEqual(
      new Set(PROFILE_KEYS),
    );
  });

  test('the snapshot stores a guide colour that follows the theme as none', () => {
    const saved = restoreGuideMarkColor(DEFAULT_SAVED_SETTINGS, LIGHT, true);
    expect(snapshotValues(saved).guide_mark_color).toBeNull();
  });

  test('the snapshot stores a guide colour picked by hand as that colour', () => {
    const saved = restoreGuideMarkColor(DEFAULT_SAVED_SETTINGS, '#AABBCC', false);
    expect(snapshotValues(saved).guide_mark_color).toBe('#AABBCC');
  });

  test('saving then applying a profile brings the settings back', () => {
    let saved = settingsWith(EVERYTHING, false);
    saved = addProfile(saved, 'Mine', snapshotValues(saved)).saved;
    expect(getProfile(saved, 'Mine')?.values).toEqual(EVERYTHING);
    const other = {
      ...EVERYTHING,
      highlight_offset_px: -1,
      guide_mark_horizontal_enabled: false,
      guide_mark_thickness_px: 2,
      guide_mark_length_percent: 20,
      guide_mark_color: '#FFEEDD',
      length_pacing_enabled: false,
      warm_up_enabled: false,
      resume_rewind_enabled: false,
      resume_rewind_words: 1,
      peripheral_context_enabled: false,
      skip_word_count: 3,
      pause_on_skip: false,
      letter_spacing_level: 0,
    };
    saved = { ...settingsWith(other, false), profiles: saved.profiles };
    expect(currentProfileSettings(saved)).toEqual(other);
    expect(currentProfileSettings(applyProfile(saved, 'Mine', LIGHT))).toEqual(EVERYTHING);
  });

  test('a profile saved while following the theme keeps following when applied', () => {
    let saved = restoreGuideMarkColor(DEFAULT_SAVED_SETTINGS, LIGHT, true);
    saved = addProfile(saved, 'Following', snapshotValues(saved)).saved;
    expect(getProfile(saved, 'Following')?.values.guide_mark_color).toBeNull();
    saved = restoreGuideMarkColor(saved, '#AABBCC', false);
    const after = applyProfile(saved, 'Following', LIGHT);
    expect(after.guide_mark_color).toBe(LIGHT);
    expect(after.guide_mark_color_is_default).toBe(true);
  });

  test('the snapshot copies odd saved values as they are, as the desktop does', () => {
    // Saving the profile then drops what a profile cannot hold.
    const saved = { ...DEFAULT_SAVED_SETTINGS, skip_word_count: 'many' };
    expect(snapshotValues(saved).skip_word_count).toBe('many');
    expect(addProfile(saved, 'A', snapshotValues(saved)).profile.values).not.toHaveProperty(
      'skip_word_count',
    );
  });
});
