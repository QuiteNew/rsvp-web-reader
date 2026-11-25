// Tests for the saved reading profiles. The desktop's own store tests are
// replayed in storeTests.desktop.test.ts. This file replays the fixture
// script's steps, aimed at what those tests leave out, and checks what a
// pure function promises that a store with one list in it never had to.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { PROFILE_METHODS, runProfileStep } from '../testing/profileSteps';
import { ProfileError } from './profiles';
import {
  addProfile,
  deleteProfile,
  getProfile,
  profileNames,
  renameProfile,
  savedProfiles,
  updateProfile,
} from './savedProfiles';
import type { SavedSettings } from './savedShapes';
import { DEFAULT_SAVED_SETTINGS } from './settings';

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
