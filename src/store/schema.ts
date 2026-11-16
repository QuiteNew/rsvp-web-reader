// Where the saved data lives in the browser, and in what shape. Names and
// types only. The code that opens the database is phase 3. The reasons
// are in docs/handoff/phase-3.md under "Stored data".
import type { SavedData, SavedSettings } from '../core/savedShapes';

/** The IndexedDB database. One per site, so one per browser profile. */
export const DATABASE_NAME = 'rsvp-web-reader';

/**
 * The IndexedDB version. Raise it only when an object store is added or
 * removed, and add the step to the upgrade function. A new field in the
 * saved data does not raise it.
 */
export const DATABASE_VERSION = 1;

/** Object stores. Both use keys given by the app, no key path. */
export const LIBRARY_STORE = 'library';
export const DAMAGED_STORE = 'damaged';

/** The one key in LIBRARY_STORE. The whole library is one record. */
export const LIBRARY_KEY = 'current';

/** The localStorage key the settings are kept under, as JSON text. */
export const SETTINGS_KEY = 'rsvp-web-reader.settings';

/**
 * The number in LibraryRecord.format. Raise it only when the record can no
 * longer be read by the code before the change. A new field with a default
 * does not raise it.
 */
export const LIBRARY_RECORD_FORMAT = 1;

/** The record under LIBRARY_KEY. */
export interface LibraryRecord {
  format: typeof LIBRARY_RECORD_FORMAT;
  /** When it was written, as an ISO 8601 string. For the person, not for rules. */
  savedAt: string;
  /** The same shape as the desktop's data.json, read by the same rules. */
  data: SavedData;
}

/**
 * A value that could not be read, kept before anything is saved over it.
 * Its key in DAMAGED_STORE is "library.damaged-YYYYMMDD-HHMMSS" or
 * "settings.damaged-YYYYMMDD-HHMMSS", with "-2", "-3" added when taken.
 */
export interface DamagedRecord {
  kind: 'library' | 'settings';
  keptAt: string;
  /** What was found, exactly as it was. Text for the settings. */
  found: unknown;
}

/** What the settings text under SETTINGS_KEY parses to. */
export type SettingsRecord = SavedSettings;
