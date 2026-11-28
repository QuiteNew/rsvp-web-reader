import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { DEFAULT_SAVED_SETTINGS, settingsView } from './settings';
import {
  DEFAULTS_ENTRIES,
  DEFAULTS_NOTE,
  NOT_YET,
  NO_MATCH_TEXT,
  RESET_BUTTON_TEXT,
  RESET_NOTE_TEXT,
  SKIP_NOTE,
  WEB_WORDING,
  WPM_APPLY_NOTE,
  checkSettingsForm,
  defaultsLayout,
  formFromSettings,
  resetDefaultsForm,
  type SettingsForm,
} from './settingsView';

const fixture = loadFixture('settings_view');

interface DesktopEntry {
  readonly name: string;
  readonly keywords: string;
  readonly description: string;
  readonly searchable: boolean;
  readonly texts: readonly string[];
}

const desktop = (fixture.functions.entry ?? []).map(([, entry]) => entry as DesktopEntry);

function webWords(text: string): string {
  return WEB_WORDING.reduce((words, [from, to]) => words.split(from).join(to), text);
}

describe("the words are the desktop's", () => {
  test("every entry, in order, with the web's rewordings and without the ones not built yet", () => {
    const expected = desktop
      .filter((entry) => !(entry.name in NOT_YET))
      .map((entry) => ({
        name: entry.name,
        keywords: entry.keywords,
        description: webWords(entry.description),
        searchable: entry.searchable,
      }));
    expect(
      DEFAULTS_ENTRIES.map(({ name, keywords, description, searchable }) => ({
        name,
        keywords,
        description,
        searchable,
      })),
    ).toEqual(expected);
  });

  test('each rewording still finds its words in the desktop text', () => {
    const all = desktop.map((entry) => entry.description).join('\n');
    for (const [from] of WEB_WORDING) expect(all).toContain(from);
  });

  test('the chime is not said to be Windows only, as a browser plays it everywhere', () => {
    const cues = DEFAULTS_ENTRIES.find((entry) => entry.id === 'speakerCues');
    expect(cues?.description).toContain('a name tag, a brief flash and a soft chime.');
    expect(DEFAULTS_ENTRIES.some((entry) => entry.description.includes('Windows'))).toBe(false);
  });

  test('every entry left out is still on the desktop', () => {
    for (const name of Object.keys(NOT_YET)) {
      expect(desktop.some((entry) => entry.name === name)).toBe(true);
    }
  });

  test('the notes', () => {
    const texts = desktop.flatMap((entry) => entry.texts);
    for (const note of [DEFAULTS_NOTE, WPM_APPLY_NOTE, SKIP_NOTE]) expect(texts).toContain(note);
    expectToMatchFixture(
      fixture,
      'loose_text',
      ([index]) => [NO_MATCH_TEXT, RESET_NOTE_TEXT, RESET_BUTTON_TEXT][index as number],
    );
  });
});

describe('defaultsLayout', () => {
  const all = DEFAULTS_ENTRIES.map((entry) => entry.id);

  test('a blank query shows everything', () => {
    expect(defaultsLayout('', false)).toEqual({ shown: all, noMatch: false, resetNote: false });
    expect(defaultsLayout('   ', true).shown).toEqual(all);
  });

  test('a query shows only the settings it finds, in order, without the notes', () => {
    const layout = defaultsLayout('colour', false);
    expect(layout.shown).toEqual([
      'fontColor',
      'highlightColor',
      'backgroundColor',
      'guideMarkColor',
    ]);
    expect(layout).toMatchObject({ noMatch: false, resetNote: true });
  });

  test('the keywords count, every word must be found', () => {
    expect(defaultsLayout('crosshair', false).shown).toEqual([
      'guideMarkThickness',
      'guideMarkLength',
      'guideMarkColor',
      'guideMarkHorizontal',
    ]);
    expect(defaultsLayout('crosshair grey', false).shown).toEqual(['guideMarkHorizontal']);
  });

  test('the descriptions only when asked', () => {
    expect(defaultsLayout('bearings', false)).toEqual({
      shown: [],
      noMatch: true,
      resetNote: false,
    });
    expect(defaultsLayout('bearings', true).shown).toEqual(['scrubPause']);
  });
});

describe('the form', () => {
  const saved = settingsView(DEFAULT_SAVED_SETTINGS);
  const form = formFromSettings(saved);
  const withText = (changes: Partial<SettingsForm>) => checkSettingsForm({ ...form, ...changes });

  test('as it opens, it applies what is saved', () => {
    const check = checkSettingsForm(form);
    expect(check.ok).toBe(true);
    if (check.ok) {
      for (const [key, value] of Object.entries(check.changes)) {
        expect(saved[key as keyof typeof saved], key).toEqual(value);
      }
    }
  });

  test('spaces around a number are fine, and digits of other scripts are read', () => {
    const check = withText({ fontSizeStep: ' 7 ', guideMarkThicknessPx: '٣' });
    expect(check).toMatchObject({
      ok: true,
      changes: { fontSizeStep: 7, guideMarkThicknessPx: 3 },
    });
  });

  test.each([
    ['fontSizeStep', '', 'The word size step for +/- must be a whole number.'],
    ['fontSizeStep', '2.5', 'The word size step for +/- must be a whole number.'],
    ['fontSizeStep', '-1', 'The word size step for +/- must be a whole number.'],
    ['fontSizeStep', '0', 'The word size step for +/- must be between 1 and 10.'],
    ['fontSizeStep', '11', 'The word size step for +/- must be between 1 and 10.'],
    ['guideMarkThicknessPx', 'abc', 'The guide mark thickness must be a whole number.'],
    ['guideMarkThicknessPx', '7', 'The guide mark thickness must be between 2 and 6.'],
    ['resumeRewindWords', '9', 'Words to rewind on resume must be between 1 and 5.'],
    ['resumeRewindWords', '²', 'Words to rewind on resume must be a whole number.'],
    ['highlightOffsetPx', '-', 'The highlighted letter shift must be a whole number.'],
    ['highlightOffsetPx', '+2', 'The highlighted letter shift must be a whole number.'],
    ['highlightOffsetPx', '- 2', 'The highlighted letter shift must be a whole number.'],
    ['highlightOffsetPx', '-4', 'The highlighted letter shift must be between -3 and 3.'],
    ['highlightOffsetPx', '4', 'The highlighted letter shift must be between -3 and 3.'],
  ] as const)('%s "%s"', (field, text, message) => {
    expect(withText({ [field]: text })).toEqual({ ok: false, problem: { field, message } });
  });

  test('the shift may be negative, and "-0" is 0', () => {
    expect(withText({ highlightOffsetPx: '-3' })).toMatchObject({
      changes: { highlightOffsetPx: -3 },
    });
    const zero = withText({ highlightOffsetPx: '-0' });
    expect(zero.ok && Object.is(zero.changes.highlightOffsetPx, 0)).toBe(true);
  });

  test("the first problem in the desktop's order is the one shown", () => {
    const check = withText({ highlightOffsetPx: 'x', resumeRewindWords: 'x', fontSizeStep: 'x' });
    expect(check.ok ? null : check.problem.field).toBe('fontSizeStep');
  });

  test('the rewind words are checked even with the rewind off', () => {
    const check = withText({ resumeRewindEnabled: false, resumeRewindWords: '0' });
    expect(check.ok).toBe(false);
  });

  test('reset puts back the original defaults and keeps the theme', () => {
    const changed: SettingsForm = {
      ...form,
      defaultWpm: 700,
      guideMarkColor: '#112233',
      fontSizeStep: 'oops',
      skipWordCount: 3,
      appearanceMode: 'dark',
    };
    expect(resetDefaultsForm(changed)).toEqual({ ...form, appearanceMode: 'dark' });
  });
});
