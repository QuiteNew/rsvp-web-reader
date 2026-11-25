// Tests for the reading profile rules. First against the Python fixtures,
// made from the desktop's core/profiles.py, then the cases a fixture file
// cannot hold, then the desktop's own tests/test_profiles.py, with the same
// test names.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture, type FixtureCase } from '../testing/fixtures';
import { TRANSCRIPT_DEFAULTS } from './models';
import {
  MAX_NAME_LENGTH,
  PROFILE_KEYS,
  ProfileError,
  THEME_COLOR_KEYS,
  buildValues,
  cleanName,
  cleanProfileList,
  nameProblem,
  profileFromDict,
  sanitizeValues,
  valueIsValid,
} from './profiles';
import { DEFAULT_SAVED_SETTINGS } from './settings';

const fixture = loadFixture('profiles');

function cases(name: string): readonly FixtureCase[] {
  const found = fixture.functions[name];
  if (!found) throw new Error(`profiles.json has no ${name}`);
  return found;
}

// The fixture comparison does not look at the order of keys, and Python's
// answers have them in PROFILE_KEYS order. JSON.parse() keeps the order of
// the file, so the order can be compared here.
function keyOrders(value: unknown): string[][] {
  if (Array.isArray(value)) return value.flatMap(keyOrders);
  if (typeof value !== 'object' || value === null) return [];
  const record = value as Record<string, unknown>;
  return [Object.keys(record), ...Object.values(record).flatMap(keyOrders)];
}

function expectSameKeyOrder(pythonName: string, run: (args: readonly unknown[]) => unknown): void {
  const wrong: unknown[] = [];
  for (const [args, expected, raises] of cases(pythonName)) {
    if (raises) continue;
    const actual = run(args);
    if (JSON.stringify(keyOrders(actual)) !== JSON.stringify(keyOrders(expected))) {
      wrong.push({ args, python: expected, typescript: actual });
    }
  }
  expect(wrong.slice(0, 3)).toEqual([]);
}

// The settings as a new install has them, by the names a profile uses.
function realSettings(): Record<string, unknown> {
  return Object.fromEntries(PROFILE_KEYS.map((key) => [key, DEFAULT_SAVED_SETTINGS[key]]));
}

describe('against the Python fixtures', () => {
  test('the keys, the theme colour keys and the name limit', () => {
    expectToMatchFixture(fixture, 'PROFILE_KEYS', () => [...PROFILE_KEYS]);
    expectToMatchFixture(fixture, 'THEME_COLOR_KEYS', () => [...THEME_COLOR_KEYS]);
    expectToMatchFixture(fixture, 'MAX_NAME_LENGTH', () => MAX_NAME_LENGTH);
  });

  test("the desktop's defaults for these settings are the web's", () => {
    expectToMatchFixture(fixture, 'defaults', () => realSettings());
  });

  test('clean_name', () => {
    expectToMatchFixture(fixture, 'clean_name', ([name]) => cleanName(name));
  });

  test('name_problem', () => {
    expectToMatchFixture(fixture, 'name_problem', ([name, existing, own]) =>
      nameProblem(name, existing as readonly unknown[], own),
    );
  });

  test('value_is_valid', () => {
    expectToMatchFixture(fixture, 'value_is_valid', ([key, value]) =>
      valueIsValid(key as string, value),
    );
  });

  test('sanitize_values, with the keys in profile order', () => {
    const run = ([values]: readonly unknown[]) => sanitizeValues(values);
    expectToMatchFixture(fixture, 'sanitize_values', run);
    expectSameKeyOrder('sanitize_values', run);
  });

  test('build_values, with the keys in profile order', () => {
    const run = ([settings, following]: readonly unknown[]) =>
      buildValues(settings as Record<string, unknown>, following as string[] | undefined);
    expectToMatchFixture(fixture, 'build_values', run);
    expectSameKeyOrder('build_values', run);
    // The settings in the fixtures are already in profile order, so they are
    // also given reversed here, and the answer must still be in that order.
    expectSameKeyOrder('build_values', ([settings, following]) =>
      run([Object.fromEntries(Object.entries(settings as object).reverse()), following]),
    );
  });

  test('profile_from_dict', () => {
    const run = ([raw]: readonly unknown[]) => profileFromDict(raw);
    expectToMatchFixture(fixture, 'profile_from_dict', run);
    expectSameKeyOrder('profile_from_dict', run);
  });

  test('clean_profile_list', () => {
    const run = ([raw]: readonly unknown[]) => cleanProfileList(raw);
    expectToMatchFixture(fixture, 'clean_profile_list', run);
    expectSameKeyOrder('clean_profile_list', run);
  });
});

describe('where the port cannot follow Python', () => {
  // Python takes 10 but not 10.0 as a whole number. JSON.parse() gives 10 for
  // both, so the web keeps such a value where the desktop drops it. Only a
  // file edited by hand can hold one. The fixture records Python's answer,
  // and this pins down the web's, so the difference stays written down.
  test('a whole number written as a float is taken as a whole number', () => {
    const intKeys = new Set([
      'skip_word_count',
      'highlight_offset_px',
      'letter_spacing_level',
      'default_wpm',
    ]);
    for (const [[key, value], python] of cases('value_is_valid_whole_floats')) {
      expect(python).toBe(false);
      expect(valueIsValid(key as string, value)).toBe(intKeys.has(key as string));
    }
  });
});

describe('what a fixture file cannot hold', () => {
  // Vite's JSON reader refuses half of a surrogate pair on its own, so these
  // are here. Python says such a character cannot be shown (charsets.json,
  // str_isprintable), and is not a space.
  test('half of a surrogate pair makes a name unusable', () => {
    expect(cleanName(' a\ud800b ')).toBe('a\ud800b');
    expect(nameProblem('a\ud800b', [])).toBe("That name has a character that can't be shown.");
    expect(profileFromDict({ name: '\udc00', values: {} })).toBeNull();
  });

  test('a name of 30 emoji is 30 characters, not 60', () => {
    expect(nameProblem('\u{1F600}'.repeat(30), [])).toBeNull();
    expect(nameProblem('\u{1F600}'.repeat(31), [])).toBe('Use 30 characters or fewer.');
  });

  test('a key every JavaScript object inherits is still not a profile key', () => {
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(valueIsValid(key, 1)).toBe(false);
    }
    // Inherited, not own: a plain object answers for these without holding them.
    const inherits = Object.create({ skip_word_count: 5 }) as Record<string, unknown>;
    expect(sanitizeValues(inherits)).toEqual({});
    expect(profileFromDict(Object.create({ name: 'A', values: {} }))).toBeNull();
  });
});

// ---- The desktop's tests/test_profiles.py ----
//
// Not ported: test_profile_to_dict_gives_a_copy_of_the_values. There is no
// Profile class here, a profile is a plain read-only object that is already
// in its saved form.

// A transcript's own fields, by the names they are saved under.
function transcriptFields(): Set<string> {
  const camel = [...Object.keys(TRANSCRIPT_DEFAULTS), 'id', 'title', 'space'];
  return new Set(
    camel.map((name) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)),
  );
}

describe('the key list agrees with the real settings', () => {
  test('every key is listed once', () => {
    expect(new Set(PROFILE_KEYS).size).toBe(PROFILE_KEYS.length);
  });

  test('every key is a real app settings field', () => {
    for (const key of PROFILE_KEYS)
      expect(Object.hasOwn(DEFAULT_SAVED_SETTINGS, key), key).toBe(true);
  });

  test('theme colour keys are profile keys', () => {
    for (const key of THEME_COLOR_KEYS) expect(PROFILE_KEYS).toContain(key);
  });

  test('the real defaults are all valid values', () => {
    for (const [key, value] of Object.entries(realSettings())) {
      expect(valueIsValid(key, value), key).toBe(true);
    }
  });

  test('a profile never holds anything that belongs to a transcript', () => {
    const fields = transcriptFields();
    expect(fields.has('raw_text')).toBe(true);
    expect(PROFILE_KEYS.filter((key) => fields.has(key))).toEqual([]);
  });

  test('a profile holds only speed and word size of the defaults for new transcripts', () => {
    expect(PROFILE_KEYS.filter((key) => key.startsWith('default_'))).toEqual([
      'default_wpm',
      'default_font_size',
    ]);
  });

  test('the colours and chunking defaults are not part of a profile', () => {
    for (const key of [
      'default_font_color',
      'default_highlight_color',
      'default_background_color',
      'default_chunking_enabled',
      'default_chunk_size',
      'default_chunk_mode',
      'default_chunk_char_target',
    ]) {
      expect(PROFILE_KEYS as readonly string[]).not.toContain(key);
    }
  });

  test("a transcript's own speed, look and chunking are not part of a profile", () => {
    for (const key of [
      'wpm',
      'font_color',
      'highlight_color',
      'background_color',
      'font_size',
      'chunking_enabled',
      'chunk_size',
      'chunk_mode',
      'chunk_char_target',
    ]) {
      expect(PROFILE_KEYS as readonly string[]).not.toContain(key);
    }
  });

  test('layout, theme and storage settings are not part of a profile', () => {
    for (const key of [
      'window_width',
      'window_height',
      'sidebar_width',
      'bottom_band_height',
      'freeform_resize_enabled',
      'data_directory',
      'appearance_mode',
    ]) {
      expect(PROFILE_KEYS as readonly string[]).not.toContain(key);
    }
  });

  test('speed, word size, step and the two switches are part of a profile', () => {
    for (const key of [
      'default_wpm',
      'default_font_size',
      'font_size_step',
      'split_long_paragraphs_enabled',
      'scrub_pause_enabled',
    ]) {
      expect(PROFILE_KEYS as readonly string[]).toContain(key);
    }
  });

  test('the letter spacing level is part of a profile', () => {
    expect(PROFILE_KEYS).toContain('letter_spacing_level');
  });

  test('the dyslexia font switch is not part of a profile', () => {
    expect(PROFILE_KEYS as readonly string[]).not.toContain('dyslexia_font_enabled');
  });

  // Not in the desktop's tests: bold word starts came after profiles there,
  // and its note says it stays out of them too.
  test('bold word starts are not part of a profile', () => {
    expect(PROFILE_KEYS as readonly string[]).not.toContain('bold_starts_enabled');
  });
});

describe('names', () => {
  test('clean name trims and squeezes whitespace', () => {
    expect(cleanName('  Fast   skim \t')).toBe('Fast skim');
  });

  test('clean name of something that is not text is empty', () => {
    expect(cleanName(null)).toBe('');
    expect(cleanName(42)).toBe('');
  });

  test('a normal name has no problem', () => {
    expect(nameProblem('Fast skim', [])).toBeNull();
  });

  test('an empty or blank name is rejected', () => {
    expect(nameProblem('', [])).not.toBeNull();
    expect(nameProblem('   ', [])).not.toBeNull();
  });

  test('a name at the length limit is allowed and one over is not', () => {
    expect(nameProblem('x'.repeat(MAX_NAME_LENGTH), [])).toBeNull();
    expect(nameProblem('x'.repeat(MAX_NAME_LENGTH + 1), [])).not.toBeNull();
  });

  test('length is measured after cleaning the name', () => {
    expect(nameProblem(`  ${'x'.repeat(MAX_NAME_LENGTH)}  `, [])).toBeNull();
  });

  test('a name with an unprintable character is rejected', () => {
    expect(nameProblem('Fast\u0000skim', [])).not.toBeNull();
  });

  test('a duplicate name is rejected whatever its case', () => {
    expect(nameProblem('fast skim', ['Fast skim'])).not.toBeNull();
    expect(nameProblem('FAST  SKIM', ['Fast skim'])).not.toBeNull();
  });

  test('the duplicate message names the existing profile', () => {
    expect(nameProblem('fast skim', ['Fast skim'])).toContain('Fast skim');
  });

  test('a different name is fine next to existing ones', () => {
    expect(nameProblem('Careful read', ['Fast skim'])).toBeNull();
  });

  test('a profile may keep its own name when renamed', () => {
    expect(nameProblem('Fast skim', ['Fast skim'], 'Fast skim')).toBeNull();
  });

  test('a profile may change only the capitals of its own name', () => {
    expect(nameProblem('FAST SKIM', ['Fast skim'], 'Fast skim')).toBeNull();
  });

  test("renaming onto another profile's name is still rejected", () => {
    expect(nameProblem('Careful read', ['Fast skim', 'Careful read'], 'Fast skim')).not.toBeNull();
  });
});

describe('valueIsValid', () => {
  test('whole numbers are valid for number settings', () => {
    expect(valueIsValid('skip_word_count', 10)).toBe(true);
    expect(valueIsValid('highlight_offset_px', -2)).toBe(true);
  });

  test('a bool is not a valid number', () => {
    expect(valueIsValid('skip_word_count', true)).toBe(false);
  });

  // The desktop's test also has 10.0, which JavaScript cannot tell from 10.
  // See "where the port cannot follow Python" above.
  test('a float or a string is not a valid number', () => {
    expect(valueIsValid('skip_word_count', 10.5)).toBe(false);
    expect(valueIsValid('skip_word_count', '10')).toBe(false);
  });

  test('true and false are valid for switches', () => {
    expect(valueIsValid('pause_on_skip', true)).toBe(true);
    expect(valueIsValid('pause_on_skip', false)).toBe(true);
  });

  test('a number is not a valid switch value', () => {
    expect(valueIsValid('pause_on_skip', 1)).toBe(false);
  });

  test('speed, word size and step take whole numbers only', () => {
    for (const key of ['default_wpm', 'default_font_size', 'font_size_step']) {
      expect(valueIsValid(key, 300), key).toBe(true);
      expect(valueIsValid(key, true), key).toBe(false);
      expect(valueIsValid(key, 300.5), key).toBe(false);
      expect(valueIsValid(key, '300'), key).toBe(false);
      expect(valueIsValid(key, null), key).toBe(false);
    }
  });

  test('the letter spacing level takes whole numbers only', () => {
    expect(valueIsValid('letter_spacing_level', 0)).toBe(true);
    expect(valueIsValid('letter_spacing_level', 3)).toBe(true);
    expect(valueIsValid('letter_spacing_level', true)).toBe(false);
    expect(valueIsValid('letter_spacing_level', false)).toBe(false);
    expect(valueIsValid('letter_spacing_level', 2.5)).toBe(false);
    expect(valueIsValid('letter_spacing_level', '2')).toBe(false);
    expect(valueIsValid('letter_spacing_level', null)).toBe(false);
  });

  test('the scrubber and paragraph settings take true or false only', () => {
    for (const key of ['split_long_paragraphs_enabled', 'scrub_pause_enabled']) {
      expect(valueIsValid(key, true), key).toBe(true);
      expect(valueIsValid(key, false), key).toBe(true);
      expect(valueIsValid(key, 1), key).toBe(false);
      expect(valueIsValid(key, null), key).toBe(false);
    }
  });

  test('hex colours are valid in either case', () => {
    expect(valueIsValid('guide_mark_color', '#3B2E27')).toBe(true);
    expect(valueIsValid('guide_mark_color', '#3b2e27')).toBe(true);
  });

  test('malformed colours are not valid', () => {
    for (const bad of ['3B2E27', '#3B2E2', '#3B2E277', '#GGGGGG', 'red', '', 123]) {
      expect(valueIsValid('guide_mark_color', bad), String(bad)).toBe(false);
    }
  });

  test('none is valid for theme colours only', () => {
    for (const key of THEME_COLOR_KEYS) expect(valueIsValid(key, null), key).toBe(true);
    expect(valueIsValid('skip_word_count', null)).toBe(false);
    expect(valueIsValid('pause_on_skip', null)).toBe(false);
  });

  test('an unknown key is never valid', () => {
    expect(valueIsValid('window_width', 1000)).toBe(false);
    expect(valueIsValid('wpm', 300)).toBe(false);
  });
});

describe('sanitizeValues', () => {
  test('sanitize keeps valid values unchanged', () => {
    const values = realSettings();
    expect(sanitizeValues(values)).toEqual(values);
  });

  test('sanitize drops unknown keys', () => {
    expect(
      sanitizeValues({ skip_word_count: 10, window_width: 1000, made_up: 1, wpm: 300 }),
    ).toEqual({ skip_word_count: 10 });
  });

  test('sanitize drops values of the wrong kind', () => {
    expect(
      sanitizeValues({
        skip_word_count: 'many',
        pause_on_skip: 1,
        guide_mark_color: 'red',
        resume_rewind_words: 4,
      }),
    ).toEqual({ resume_rewind_words: 4 });
  });

  test('sanitize keeps none for a theme colour but not for anything else', () => {
    expect(sanitizeValues({ guide_mark_color: null, skip_word_count: null })).toEqual({
      guide_mark_color: null,
    });
  });

  test('sanitize of something that is not a dict is empty', () => {
    for (const junk of [null, [], 'text', 5]) expect(sanitizeValues(junk)).toEqual({});
  });

  test('sanitize returns keys in profile order', () => {
    expect(Object.keys(sanitizeValues({ pause_on_skip: true, highlight_offset_px: 1 }))).toEqual([
      'highlight_offset_px',
      'pause_on_skip',
    ]);
  });

  test('sanitize does not change the dict it was given', () => {
    const values = { skip_word_count: 'many', resume_rewind_words: 4 };
    sanitizeValues(values);
    expect(values).toEqual({ skip_word_count: 'many', resume_rewind_words: 4 });
  });
});

describe('buildValues', () => {
  test('build values holds every profile key', () => {
    expect(new Set(Object.keys(buildValues(realSettings())))).toEqual(new Set(PROFILE_KEYS));
  });

  test('build values takes each value from the input', () => {
    const given = Object.fromEntries(PROFILE_KEYS.map((key, index) => [key, index]));
    expect(buildValues(given)).toEqual(given);
  });

  test('build values ignores keys that are not part of a profile', () => {
    // All the saved settings can be passed in without picking them out first.
    const given = { ...realSettings(), window_width: 1234, default_font_color: '#112233' };
    expect(new Set(Object.keys(buildValues(given)))).toEqual(new Set(PROFILE_KEYS));
  });

  test('build values stores none for a colour that follows the theme', () => {
    expect(buildValues(realSettings(), ['guide_mark_color']).guide_mark_color).toBeNull();
  });

  test('build values keeps a colour that was picked by hand', () => {
    const settings = { ...realSettings(), guide_mark_color: '#112233' };
    expect(buildValues(settings).guide_mark_color).toBe('#112233');
  });

  test('build values rejects a following key that is not a colour', () => {
    expect(() => buildValues(realSettings(), ['skip_word_count'])).toThrow(RangeError);
  });

  // Python raises KeyError, which is not a ValueError, so this is a plain
  // Error and not a RangeError.
  test('build values raises when an input is missing a key', () => {
    const incomplete = realSettings();
    delete incomplete.skip_word_count;
    expect(() => buildValues(incomplete)).toThrow(Error);
    expect(() => buildValues(incomplete)).not.toThrow(RangeError);
  });
});

describe('loading', () => {
  test('profile from dict rebuilds a saved profile', () => {
    expect(profileFromDict({ name: '  Fast   skim ', values: { skip_word_count: 25 } })).toEqual({
      name: 'Fast skim',
      values: { skip_word_count: 25 },
    });
  });

  test('profile from dict drops bad entries inside the values', () => {
    const profile = profileFromDict({
      name: 'A',
      values: { skip_word_count: 25, guide_mark_color: 'red' },
    });
    expect(profile?.values).toEqual({ skip_word_count: 25 });
  });

  test('profile from dict rejects unusable entries', () => {
    expect(profileFromDict('text')).toBeNull();
    expect(profileFromDict({ values: {} })).toBeNull();
    expect(profileFromDict({ name: '', values: {} })).toBeNull();
    expect(profileFromDict({ name: 'x'.repeat(MAX_NAME_LENGTH + 1), values: {} })).toBeNull();
    expect(profileFromDict({ name: 'A', values: 'nope' })).toBeNull();
    expect(profileFromDict({ name: 'A' })).toBeNull();
  });

  test('clean profile list keeps good profiles in order', () => {
    const raw = [
      { name: 'B', values: { skip_word_count: 20 } },
      { name: 'A', values: { skip_word_count: 30 } },
    ];
    expect(cleanProfileList(raw)).toEqual(raw);
  });

  test('clean profile list skips unusable entries', () => {
    const raw = [
      'junk',
      null,
      { name: 'Good', values: { skip_word_count: 30 } },
      { name: '', values: {} },
    ];
    expect(cleanProfileList(raw)).toEqual([{ name: 'Good', values: { skip_word_count: 30 } }]);
  });

  test('clean profile list keeps the first of two names that differ only in case', () => {
    const raw = [
      { name: 'Fast', values: { skip_word_count: 40 } },
      { name: 'FAST', values: { skip_word_count: 10 } },
    ];
    expect(cleanProfileList(raw)).toEqual([{ name: 'Fast', values: { skip_word_count: 40 } }]);
  });

  test('clean profile list of something that is not a list is empty', () => {
    for (const junk of [null, {}, 'text', 5]) expect(cleanProfileList(junk)).toEqual([]);
  });

  test('clean profile list returns plain dicts', () => {
    const [profile] = cleanProfileList([{ name: 'A', values: { skip_word_count: 30 } }]);
    expect(Object.getPrototypeOf(profile)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(profile?.values)).toBe(Object.prototype);
  });

  test('clean profile list drops settings that used to be allowed', () => {
    // Profiles saved by the first draft of the desktop feature could hold a
    // transcript's own speed, font size and so on. They are ignored, and the
    // rest of the profile loads.
    const raw = [{ name: 'Old', values: { wpm: 600, font_size: 28, skip_word_count: 25 } }];
    expect(cleanProfileList(raw)).toEqual([{ name: 'Old', values: { skip_word_count: 25 } }]);
  });

  test('clean profile list keeps the letter spacing level and drops the font switch', () => {
    const raw = [
      {
        name: 'Spaced',
        values: { letter_spacing_level: 2, dyslexia_font_enabled: true, skip_word_count: 25 },
      },
    ];
    expect(cleanProfileList(raw)).toEqual([
      { name: 'Spaced', values: { skip_word_count: 25, letter_spacing_level: 2 } },
    ]);
  });

  test('clean profile list drops a letter spacing level of the wrong kind', () => {
    const raw = [{ name: 'Odd', values: { letter_spacing_level: 'large', skip_word_count: 25 } }];
    expect(cleanProfileList(raw)).toEqual([{ name: 'Odd', values: { skip_word_count: 25 } }]);
  });

  test('clean profile list keeps the newer settings and drops the colour defaults', () => {
    const raw = [
      {
        name: 'Mixed',
        values: {
          default_wpm: 450,
          default_font_size: 40,
          font_size_step: 3,
          scrub_pause_enabled: false,
          split_long_paragraphs_enabled: true,
          default_font_color: '#112233',
          default_chunk_size: 4,
        },
      },
    ];
    expect(cleanProfileList(raw)).toEqual([
      {
        name: 'Mixed',
        values: {
          default_wpm: 450,
          default_font_size: 40,
          font_size_step: 3,
          split_long_paragraphs_enabled: true,
          scrub_pause_enabled: false,
        },
      },
    ]);
  });

  test('profile error is a value error', () => {
    // Python's ValueError is RangeError in the port.
    expect(new ProfileError('x')).toBeInstanceOf(RangeError);
    expect(new ProfileError('x').name).toBe('ProfileError');
  });
});
