// The desktop project's own tests for its stores, replayed.
//
// tools/fixtures/generate.py runs these desktop test files with pytest, as
// they are, and writes down what each passing test asks of the code that
// has a port here:
//   tests/test_transcript_store.py     tests/test_storage.py
//   tests/test_damaged_files.py        tests/test_data_bundle.py
//   tests/test_transcript_speaker_list.py   tests/test_chunking.py
//   tests/test_settings_store.py and its four sister files
// Every case below starts with the name of the Python test it came from, so
// a failure names the desktop test to read.
//
// What a replay cannot show is listed in docs/handoff/phase-3-progress.md:
// tests that only call code with no port (one setter per setting, files on
// a disk, saving, renaming or deleting a profile) record nothing. Loading
// and importing profiles do record, since phase 6.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { STORE_STEPS } from '../testing/storeSteps';
import { buildBundle, parseBundle } from './bundle';
import { mergeAll, replaceAll } from './library';
import type { Library, Settings } from './models';
import type { SavedSettings } from './savedShapes';
import {
  loadSavedSettings,
  replaceFromBundle,
  resyncGuideMarkColorDefault,
  restoreGuideMarkColor,
  savedName,
  setGuideMarkColor,
  settingsView,
} from './settings';
import { parseData, toSavedData } from './storageFormat';

const fixture = loadFixture('desktop_tests');

function library(saved: unknown): Library {
  const parsed = parseData(saved);
  if (parsed === null) throw new Error('The desktop store held a library that cannot be read');
  return parsed;
}

describe('TranscriptStore', () => {
  test('every change a desktop test made gives the same library here', () => {
    expectToMatchFixture(fixture, 'store_step', ([, before, name, args]) => {
      const current = library(before);
      const given = args as unknown[];
      if (name === 'replace_all') return [null, toSavedData(replaceAll(library(given[0])))];
      if (name === 'merge_all') return [null, toSavedData(mergeAll(current, library(given[0])))];
      const step = STORE_STEPS[name as string];
      if (step === undefined) throw new Error(`No port of ${String(name)}`);
      const [after, answer] = step(current, given);
      return [answer, toSavedData(after)];
    });
  });

  test('the desktop tests reach every ported method', () => {
    const used = new Set((fixture.functions.store_step ?? []).map(([args]) => args[2]));
    expect([...used].sort()).toEqual(
      [...Object.keys(STORE_STEPS), 'merge_all', 'replace_all'].sort(),
    );
  });
});

describe('storage', () => {
  test('parse_data', () => {
    expectToMatchFixture(fixture, 'parse_data', ([, saved]) => {
      const parsed = parseData(saved);
      return parsed === null ? null : toSavedData(parsed);
    });
  });

  test('what save_state wrote is what the web writes for the same library', () => {
    expectToMatchFixture(fixture, 'save_state', ([, written]) => toSavedData(library(written)));
  });
});

describe('data_bundle', () => {
  test('parse_bundle', () => {
    expectToMatchFixture(fixture, 'parse_bundle', ([, text]) => {
      const parsed = parseBundle(text as string);
      return parsed.kind === 'ok'
        ? ['ok', toSavedData(parsed.library), parsed.settings]
        : ['error', parsed.message];
    });
  });

  test('build_bundle', () => {
    expectToMatchFixture(fixture, 'build_bundle', ([, state, settings]) =>
      buildBundle(library(state), settings as SavedSettings),
    );
  });
});

describe('SettingsStore', () => {
  test('reading a settings.json, and what the checked settings then read as', () => {
    expectToMatchFixture(fixture, 'settings_load', ([, text, , ...rest]) => {
      void rest;
      let saved: SavedSettings | null = null;
      try {
        saved = loadSavedSettings(JSON.parse(text as string));
      } catch {
        // Not JSON: damaged, as on the desktop.
      }
      if (saved === null) return null;
      const all = settingsView(saved);
      const view = Object.fromEntries(
        (Object.keys(all) as (keyof Settings)[])
          .filter((key) => CHECKED.has(savedName(key)))
          .map((key) => [savedName(key), all[key]]),
      );
      return { saved, view };
    });
  });

  test('replace_from_bundle', () => {
    expectToMatchFixture(fixture, 'settings_replace', ([, before, incoming]) =>
      replaceFromBundle(before as SavedSettings, incoming as SavedSettings),
    );
  });

  test('the guide mark colour', () => {
    expectToMatchFixture(fixture, 'settings_guide_mark', ([, before, method, args]) => {
      const saved = before as SavedSettings;
      const [color, followsTheme] = args as [string, boolean];
      if (method === 'set_guide_mark_color') return setGuideMarkColor(saved, color);
      if (method === 'restore_guide_mark_color') {
        return restoreGuideMarkColor(saved, color, followsTheme);
      }
      return resyncGuideMarkColorDefault(saved, color);
    });
  });
});

// The settings the desktop checks when it reads them. The fixture records
// its getters for these.
const CHECKED = new Set([
  'bold_starts_enabled',
  'speaker_cues_enabled',
  'speaker_cue_sound',
  'speaker_cue_style',
  'speaker_cue_name_tag_enabled',
  'speaker_cue_tag_position',
  'speaker_cue_flash_enabled',
  'reopen_last_transcript',
  'last_transcript_id',
  'transcript_sort',
]);

describe('how much of the desktop tests this covers', () => {
  type Row = readonly [
    [file: string, name: string],
    [passed: boolean, calls: number, kept: number],
  ];
  const rows = (fixture.functions.tests ?? []) as unknown as readonly Row[];

  test('the desktop tests that ran, passed and were recorded', () => {
    const passed = rows.filter(([, [ok]]) => ok);
    const recorded = passed.filter(([, [, calls]]) => calls > 0);
    // 7 tests of test_damaged_files.py open the desktop window, which the
    // fixture machine cannot do. (2 more need it before they even start, and
    // are not in the list at all.)
    expect(rows.length - passed.length).toBe(7);
    expect(passed.length).toBe(611);
    expect(recorded.length).toBe(338);
  });
});
