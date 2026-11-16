// The app-wide settings, kept in localStorage.
//
// All the rules are in src/core/settings.ts: the defaults, what each
// setting reads as, what a change or an import does. This file only holds
// the current settings, saves them after every change and reads them back
// when the page opens.
//
// localStorage answers at once, so unlike the library there is nothing to
// wait for: the settings are read when the store is made, and every change
// is written before the method returns.
import type { Settings } from '../core/models';
import type { SavedSettings } from '../core/savedShapes';
import {
  DEFAULT_SAVED_SETTINGS,
  loadSavedSettings,
  replaceFromBundle,
  setGuideMarkColor,
  settingsView,
  withChanges,
} from '../core/settings';
import type { SettingsStore } from './contract';
import { SETTINGS_KEY } from './schema';

/** Where settings text that could not be read is put aside. */
export const DAMAGED_SETTINGS_KEY = `${SETTINGS_KEY}.damaged`;

export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser's localStorage, or null when the browser will not hand it out. */
export function browserSettingsStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class SavedSettingsStore implements SettingsStore {
  private readonly storage: SettingsStorage | null;
  private readonly listeners = new Set<() => void>();
  private settings: SavedSettings;
  private view: Settings;
  private notice: string | null = null;
  private problem: string | null = null;

  /** `storage` is null when the browser has none to give. Then nothing is kept. */
  constructor(storage: SettingsStorage | null) {
    this.storage = storage;
    this.settings = this.read();
    this.view = settingsView(this.settings);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The settings as the page uses them. A new object after a change, the same one until then. */
  getSnapshot = (): Settings => this.view;

  /** The settings as they are saved and exported: the desktop's shape. */
  saved = (): SavedSettings => this.settings;

  /** Set when the saved settings could not be read. The page shows it once. */
  damagedNotice = (): string | null => this.notice;

  clearDamagedNotice = (): void => {
    if (this.notice === null) return;
    this.notice = null;
    this.tell();
  };

  /** Why the last save did not work, or null. Cleared by the next save that does. */
  saveProblem = (): string | null => this.problem;

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.update({ [key]: value } as Partial<Settings>);
  }

  update(changes: Partial<Settings>): void {
    this.become(withChanges(this.settings, changes));
  }

  /** A guide mark colour picked by hand. It stops following the theme. */
  setGuideMarkColor(color: string): void {
    this.become(setGuideMarkColor(this.settings, color));
  }

  /** An import in Replace mode: the file's settings in place of these. */
  replaceFromBundle(incoming: SavedSettings): void {
    this.settings = replaceFromBundle(this.settings, incoming);
    this.view = settingsView(this.settings);
    this.write();
    this.tell();
  }

  private become(next: SavedSettings): void {
    // The rules give the same object back when nothing changes.
    if (next === this.settings) return;
    this.settings = next;
    this.view = settingsView(next);
    this.write();
    this.tell();
  }

  private read(): SavedSettings {
    let text: string | null = null;
    try {
      text = this.storage?.getItem(SETTINGS_KEY) ?? null;
    } catch {
      // A browser that refuses to be read is a browser with nothing saved.
    }
    if (text === null) return { ...DEFAULT_SAVED_SETTINGS };
    let loaded: SavedSettings | null = null;
    try {
      loaded = loadSavedSettings(JSON.parse(text));
    } catch {
      // Not JSON.
    }
    if (loaded !== null) return loaded;
    // Something was saved and it is not settings. Put it aside before the
    // next change writes over it, and start from the defaults.
    let kept = true;
    try {
      this.storage?.setItem(DAMAGED_SETTINGS_KEY, text);
    } catch {
      kept = false;
    }
    this.notice =
      'The saved settings could not be read, so the app started with the default ones. ' +
      (kept
        ? `What was there is kept in this browser as "${DAMAGED_SETTINGS_KEY}".`
        : 'A copy of them could not be kept.');
    return { ...DEFAULT_SAVED_SETTINGS };
  }

  private write(): void {
    if (this.storage === null) return;
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      this.problem = null;
    } catch {
      this.problem =
        'The last change to the settings could not be saved in this browser. ' +
        'Export your data from Settings to keep a copy.';
    }
  }

  private tell(): void {
    for (const listener of this.listeners) listener();
  }
}
