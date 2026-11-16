// Tests for the settings rules. First against the Python fixtures, made
// from the desktop's SettingsStore, then the parts that are the web's own.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import type { Settings } from './models';
import type { SavedSettings } from './savedShapes';
import * as settings from './settings';
import {
  DEFAULT_SAVED_SETTINGS,
  loadSavedSettings,
  replaceFromBundle,
  resyncGuideMarkColorDefault,
  restoreGuideMarkColor,
  savedName,
  setGuideMarkColor,
  settingsView,
  withChanges,
} from './settings';

const fixture = loadFixture('settings');

/** What the desktop does with the text of a settings.json: null when it cannot be read. */
function load(text: string): SavedSettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return loadSavedSettings(parsed);
}

/** The settings a desktop store starts from: a saved file, or none. */
function start(text: string | null): SavedSettings {
  return text === null ? { ...DEFAULT_SAVED_SETTINGS } : (load(text) as SavedSettings);
}

/** The view under the names the desktop uses, to compare with its getters. */
function viewBySavedName(saved: SavedSettings): Record<string, unknown> {
  const view = settingsView(saved);
  return Object.fromEntries(
    (Object.keys(view) as (keyof Settings)[]).map((key) => [savedName(key), view[key]]),
  );
}

describe('against the desktop', () => {
  test('the ranges and the choices', () => {
    expectToMatchFixture(fixture, 'constants', ([name]) => [
      ...(settings as unknown as Record<string, readonly unknown[]>)[name as string]!,
    ]);
  });

  test('the defaults of a new install', () => {
    expectToMatchFixture(fixture, 'defaults', () => DEFAULT_SAVED_SETTINGS);
  });

  test('the defaults are in the order the desktop writes them', () => {
    const [, expected] = fixture.functions.defaults![0]!;
    expect(Object.keys(DEFAULT_SAVED_SETTINGS)).toEqual(Object.keys(expected as object));
  });

  test('reading saved settings, and what each setting then reads as', () => {
    expectToMatchFixture(fixture, 'load', ([text]) => {
      const saved = load(text as string);
      return saved === null ? null : { saved, view: viewBySavedName(saved) };
    });
  });

  test('odd values are saved as they are, as the desktop does', () => {
    expectToMatchFixture(fixture, 'load_saved_only', ([text]) => load(text as string));
  });

  test('an import in Replace mode', () => {
    expectToMatchFixture(fixture, 'replace_from_bundle', ([current, incoming]) =>
      replaceFromBundle(start(current as string | null), incoming as SavedSettings),
    );
  });

  test('the guide mark colour and following the theme', () => {
    expectToMatchFixture(fixture, 'guide_mark', ([current, method, args]) => {
      const saved = start(current as string | null);
      const [color, followsTheme] = args as [string, boolean];
      if (method === 'set_guide_mark_color') return setGuideMarkColor(saved, color);
      if (method === 'restore_guide_mark_color') {
        return restoreGuideMarkColor(saved, color, followsTheme);
      }
      return resyncGuideMarkColorDefault(saved, color);
    });
  });
});

describe('what the page reads', () => {
  const defaults = settingsView(DEFAULT_SAVED_SETTINGS);

  test('a number outside its range reads as the nearest end', () => {
    expect(settingsView(start('{"default_wpm": 5000}')).defaultWpm).toBe(1000);
    expect(settingsView(start('{"default_wpm": -1}')).defaultWpm).toBe(100);
    expect(settingsView(start('{"skip_word_count": 0}')).skipWordCount).toBe(1);
    expect(settingsView(start('{"highlight_offset_px": 10}')).highlightOffsetPx).toBe(3);
    expect(settingsView(start('{"letter_spacing_level": 99}')).letterSpacingLevel).toBe(3);
    expect(settingsView(start('{"guide_mark_thickness_px": 1}')).guideMarkThicknessPx).toBe(2);
  });

  test('the wrong kind of value reads as the default', () => {
    const odd = start(
      JSON.stringify({
        default_wpm: 'fast',
        default_font_size: 2.5,
        resume_rewind_words: '3',
        default_font_color: 5,
        default_highlight_color: 'red',
        appearance_mode: 'purple',
        default_chunk_mode: 'weird',
        pause_on_skip: 'yes',
        scrub_pause_enabled: 0,
      }),
    );
    expect(settingsView(odd)).toEqual(defaults);
  });

  test('every setting of the page has a saved name the desktop knows', () => {
    for (const key of Object.keys(defaults) as (keyof Settings)[]) {
      expect(Object.hasOwn(DEFAULT_SAVED_SETTINGS, savedName(key)), key).toBe(true);
    }
  });

  test('the folder of one computer is never among the settings', () => {
    expect(Object.hasOwn(DEFAULT_SAVED_SETTINGS, 'data_directory')).toBe(false);
    expect(load('{"data_directory": "D:/x"}')).toEqual(DEFAULT_SAVED_SETTINGS);
  });
});

describe('changing settings from the page', () => {
  const saved = start(null);

  test('a change is saved under the desktop name and nothing else moves', () => {
    const next = withChanges(saved, { defaultWpm: 450, pauseOnSkip: true });
    expect(next).toEqual({ ...saved, default_wpm: 450, pause_on_skip: true });
    expect(saved.default_wpm).toBe(300);
  });

  test('a value outside its range is pulled back before it is saved', () => {
    expect(withChanges(saved, { defaultWpm: 5000 }).default_wpm).toBe(1000);
    expect(withChanges(saved, { skipWordCount: 0 }).skip_word_count).toBe(1);
  });

  test('a change to the value it already has gives the same object back', () => {
    expect(withChanges(saved, { defaultWpm: 300, reopenLastTranscript: true })).toBe(saved);
    expect(withChanges(saved, {})).toBe(saved);
  });

  test('settings the page does not show are kept through a change', () => {
    const fromDesktop = start('{"window_width": 1200, "sidebar_width": 300}');
    const next = withChanges(fromDesktop, { lastTranscriptId: 4 });
    expect(next.window_width).toBe(1200);
    expect(next.sidebar_width).toBe(300);
    expect(next.last_transcript_id).toBe(4);
  });

  test('the guide mark rules give the same object back when nothing changes', () => {
    expect(setGuideMarkColor(saved, '#3B2E27')).toBe(saved);
    expect(restoreGuideMarkColor(saved, '#3B2E27', true)).toBe(saved);
    expect(resyncGuideMarkColorDefault(saved, '#3B2E27')).toBe(saved);
  });
});
