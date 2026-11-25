import { describe, expect, test, vi } from 'vitest';
import { ProfileError } from '../core/profiles';
import { DEFAULT_SAVED_SETTINGS, settingsView } from '../core/settings';
import { SETTINGS_KEY } from './schema';
import { DAMAGED_SETTINGS_KEY, SavedSettingsStore } from './settingsStore';

function storage(start: Record<string, string> = {}) {
  const items = new Map(Object.entries(start));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

function savedIn(kept: ReturnType<typeof storage>): unknown {
  return JSON.parse(kept.items.get(SETTINGS_KEY) ?? 'null');
}

const refusing = {
  getItem: (): string | null => {
    throw new Error('no storage');
  },
  setItem: (): void => {
    throw new Error('no storage');
  },
};

describe('reading the saved settings', () => {
  test('nothing saved gives the defaults and writes nothing', () => {
    const kept = storage();
    const store = new SavedSettingsStore(kept);
    expect(store.saved()).toEqual(DEFAULT_SAVED_SETTINGS);
    expect(store.getSnapshot()).toEqual(settingsView(DEFAULT_SAVED_SETTINGS));
    expect(store.damagedNotice()).toBeNull();
    expect(kept.items.size).toBe(0);
  });

  test('what was saved is read back over the defaults', () => {
    const kept = storage({ [SETTINGS_KEY]: '{"default_wpm": 450, "window_width": 1200}' });
    const store = new SavedSettingsStore(kept);
    expect(store.getSnapshot().defaultWpm).toBe(450);
    expect(store.getSnapshot().skipWordCount).toBe(10);
    expect(store.saved().window_width).toBe(1200);
  });

  test('a key that is not a setting is dropped, the rest stays', () => {
    const kept = storage({
      [SETTINGS_KEY]: '{"default_wpm": 450, "data_directory": "C:\\\\x", "from_the_future": 1}',
    });
    const store = new SavedSettingsStore(kept);
    expect(store.saved()).toEqual({ ...DEFAULT_SAVED_SETTINGS, default_wpm: 450 });
  });

  test.each(['not json', '[]', '5', 'null', ''])(
    'text that is not settings (%j) is put aside and the defaults are used',
    (text) => {
      const kept = storage({ [SETTINGS_KEY]: text });
      const store = new SavedSettingsStore(kept);
      expect(store.saved()).toEqual(DEFAULT_SAVED_SETTINGS);
      expect(kept.items.get(DAMAGED_SETTINGS_KEY)).toBe(text);
      expect(store.damagedNotice()).toContain('could not be read');
      expect(store.damagedNotice()).toContain(DAMAGED_SETTINGS_KEY);
      // The text itself is left until a change is saved over it.
      expect(kept.items.get(SETTINGS_KEY)).toBe(text);
    },
  );

  test('the notice goes away once, and tells whoever listens', () => {
    const store = new SavedSettingsStore(storage({ [SETTINGS_KEY]: '[]' }));
    const listener = vi.fn();
    store.subscribe(listener);
    store.clearDamagedNotice();
    store.clearDamagedNotice();
    expect(store.damagedNotice()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('a browser with no storage, or one that refuses, still works', () => {
    for (const none of [null, refusing]) {
      const store = new SavedSettingsStore(none);
      expect(store.saved()).toEqual(DEFAULT_SAVED_SETTINGS);
      store.set('defaultWpm', 450);
      expect(store.getSnapshot().defaultWpm).toBe(450);
    }
  });

  test('a save that fails is reported, and the next good one clears it', () => {
    const kept = storage();
    let full = true;
    const store = new SavedSettingsStore({
      getItem: kept.getItem,
      setItem: (key, value) => {
        if (full) throw new Error('full');
        kept.setItem(key, value);
      },
    });
    store.set('defaultWpm', 450);
    expect(store.saveProblem()).toContain('could not be saved');
    full = false;
    store.set('defaultWpm', 460);
    expect(store.saveProblem()).toBeNull();
    expect(savedIn(kept)).toMatchObject({ default_wpm: 460 });
  });
});

describe('changing settings', () => {
  test('a change is saved at once, in the desktop shape, and told', () => {
    const kept = storage();
    const store = new SavedSettingsStore(kept);
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();
    store.set('pauseOnSkip', true);
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot().pauseOnSkip).toBe(true);
    expect(savedIn(kept)).toEqual({ ...DEFAULT_SAVED_SETTINGS, pause_on_skip: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('a change to the value it already has does nothing', () => {
    const kept = storage();
    const store = new SavedSettingsStore(kept);
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();
    store.set('defaultWpm', 300);
    store.update({});
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(kept.items.size).toBe(0);
  });

  test('several changes are one save and one telling', () => {
    const kept = storage();
    const set = vi.spyOn(kept, 'setItem');
    const store = new SavedSettingsStore(kept);
    const listener = vi.fn();
    store.subscribe(listener);
    store.update({ defaultWpm: 450, skipWordCount: 5, lastTranscriptId: 3 });
    expect(set).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(savedIn(kept)).toMatchObject({
      default_wpm: 450,
      skip_word_count: 5,
      last_transcript_id: 3,
    });
  });

  test('a value outside its range is pulled back before it is saved', () => {
    const kept = storage();
    const store = new SavedSettingsStore(kept);
    store.set('defaultWpm', 5000);
    expect(store.getSnapshot().defaultWpm).toBe(1000);
    expect(savedIn(kept)).toMatchObject({ default_wpm: 1000 });
  });

  test('someone who stopped listening is not told', () => {
    const store = new SavedSettingsStore(storage());
    const listener = vi.fn();
    store.subscribe(listener)();
    store.set('defaultWpm', 450);
    expect(listener).not.toHaveBeenCalled();
  });

  test('a guide mark colour picked by hand stops following the theme', () => {
    const kept = storage();
    const store = new SavedSettingsStore(kept);
    store.setGuideMarkColor('#112233');
    expect(store.getSnapshot().guideMarkColor).toBe('#112233');
    expect(store.getSnapshot().guideMarkColorIsDefault).toBe(false);
    expect(savedIn(kept)).toMatchObject({
      guide_mark_color: '#112233',
      guide_mark_color_is_default: false,
    });
  });

  test('settings are still there for the next store on the same storage', () => {
    const kept = storage();
    new SavedSettingsStore(kept).update({ reopenLastTranscript: false, lastTranscriptId: 7 });
    const next = new SavedSettingsStore(kept).getSnapshot();
    expect(next.reopenLastTranscript).toBe(false);
    expect(next.lastTranscriptId).toBe(7);
  });
});

describe('an import in Replace mode', () => {
  test('takes the file settings, with the default for any it does not have', () => {
    const kept = storage({ [SETTINGS_KEY]: '{"default_wpm": 450, "pause_on_skip": true}' });
    const store = new SavedSettingsStore(kept);
    store.replaceFromBundle({ skip_word_count: 5, data_directory: 'C:\\x', unknown: 1 });
    expect(store.saved()).toEqual({ ...DEFAULT_SAVED_SETTINGS, skip_word_count: 5 });
    expect(savedIn(kept)).toEqual(store.saved());
    expect(store.getSnapshot().defaultWpm).toBe(300);
  });

  test('keeps the profiles that are here when the file has none', () => {
    const profiles = [{ name: 'Fast', values: { default_wpm: 450 } }];
    const kept = storage({ [SETTINGS_KEY]: JSON.stringify({ profiles }) });
    const store = new SavedSettingsStore(kept);
    store.replaceFromBundle({ default_wpm: 500 });
    expect(store.saved().profiles).toEqual(profiles);
    store.replaceFromBundle({ profiles: [] });
    expect(store.saved().profiles).toEqual([]);
  });
});

describe('reading profiles', () => {
  test('saving one writes it at once and tells, with the current settings in it', () => {
    const kept = storage();
    const store = new SavedSettingsStore(kept);
    store.set('skipWordCount', 25);
    const told = vi.fn();
    store.subscribe(told);
    const profile = store.saveProfile('  Fast   skim ');
    expect(profile.name).toBe('Fast skim');
    expect(profile.values.skip_word_count).toBe(25);
    // Following the theme, so saved as null.
    expect(profile.values.guide_mark_color).toBeNull();
    expect(told).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().profiles).toEqual([profile]);
    expect((savedIn(kept) as { profiles: unknown }).profiles).toEqual([profile]);
  });

  // The desktop's test_every_kind_of_change_is_saved_straight_away.
  test('every kind of change is saved straight away', () => {
    const kept = storage();
    const store = new SavedSettingsStore(kept);
    store.saveProfile('Fast skim');
    store.set('pauseOnSkip', true);
    store.saveProfile('Careful read');
    store.set('skipWordCount', 30);
    store.updateProfile('Fast skim');
    store.renameProfile('Careful read', 'Slow');
    store.deleteProfile('Fast skim');
    const saved = savedIn(kept) as {
      profiles: { name: string; values: Record<string, unknown> }[];
    };
    expect(saved.profiles.map((profile) => profile.name)).toEqual(['Slow']);
    expect(saved.profiles[0]?.values.pause_on_skip).toBe(true);
    expect(saved.profiles[0]?.values.skip_word_count).toBe(10);
  });

  // The desktop's test_updating_a_profile_replaces_its_settings_and_keeps_its_name.
  test('updating a profile replaces its settings and keeps its name', () => {
    const store = new SavedSettingsStore(storage());
    store.set('skipWordCount', 30);
    store.saveProfile('Mine');
    store.set('skipWordCount', 9);
    const updated = store.updateProfile('mine');
    expect(updated.name).toBe('Mine');
    expect(store.getSnapshot().profiles.map((profile) => profile.name)).toEqual(['Mine']);
    expect(store.getSnapshot().profiles[0]?.values.skip_word_count).toBe(9);
  });

  test('profiles are still there for the next store on the same storage', () => {
    const kept = storage();
    const first = new SavedSettingsStore(kept);
    first.set('letterSpacingLevel', 2);
    first.saveProfile('Spaced');
    const again = new SavedSettingsStore(kept);
    expect(again.getSnapshot().profiles).toEqual(first.getSnapshot().profiles);
    expect(again.getSnapshot().profiles[0]?.values.letter_spacing_level).toBe(2);
  });

  test('a refused change throws, and saves and tells nothing', () => {
    const kept = storage();
    const store = new SavedSettingsStore(kept);
    store.saveProfile('Mine');
    const before = kept.items.get(SETTINGS_KEY);
    const told = vi.fn();
    store.subscribe(told);
    expect(() => store.saveProfile('MINE')).toThrow(ProfileError);
    expect(() => store.updateProfile('Nope')).toThrow('There is no profile called "Nope".');
    expect(() => store.renameProfile('Mine', '')).toThrow('Give the profile a name.');
    expect(() => store.deleteProfile('Nope')).toThrow(ProfileError);
    expect(() => store.applyProfile('Nope', '#3B2E27')).toThrow(ProfileError);
    expect(told).not.toHaveBeenCalled();
    expect(kept.items.get(SETTINGS_KEY)).toBe(before);
    expect(store.getSnapshot().profiles.map((profile) => profile.name)).toEqual(['Mine']);
  });

  // The desktop's test_an_applied_profile_is_written_to_settings_json.
  test('an applied profile is written at once, and the page reads it', () => {
    const kept = storage();
    const store = new SavedSettingsStore(kept);
    store.set('skipWordCount', 30);
    store.setGuideMarkColor('#112233');
    store.saveProfile('Mine');
    store.set('skipWordCount', 5);
    store.setGuideMarkColor('#AABBCC');
    store.applyProfile('mine', '#3B2E27');
    expect(store.getSnapshot().skipWordCount).toBe(30);
    expect(store.getSnapshot().guideMarkColor).toBe('#112233');
    const saved = savedIn(kept) as Record<string, unknown>;
    expect(saved.skip_word_count).toBe(30);
    expect(saved.guide_mark_color).toBe('#112233');
    expect(saved.guide_mark_color_is_default).toBe(false);
  });
});
