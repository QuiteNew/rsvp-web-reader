// The settings as an export file carries them, kept in localStorage as
// they are. The web app has no settings of its own yet, so for now this
// only makes sure a desktop export that is imported here gives its
// settings back when it is exported again. Checking and using them is
// step 5 of docs/handoff/phase-3-progress.md.
//
// Two of the desktop's settings are used already, under their own names:
// last_transcript_id and reopen_last_transcript. They decide which
// transcript is open again after a reload.
import type { SavedSettings } from '../core/savedShapes';
import { SETTINGS_KEY } from './schema';

/** A path on the computer the export came from. It means nothing anywhere else. */
const NOT_KEPT = 'data_directory';

/** The saved settings, or an empty set when there are none or they cannot be read. */
export function readSavedSettings(storage: Pick<Storage, 'getItem' | 'setItem'>): SavedSettings {
  try {
    const text = storage.getItem(SETTINGS_KEY);
    if (text === null) return {};
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as SavedSettings;
    }
    // Text that is not a set of settings is put aside before it is lost.
    storage.setItem(`${SETTINGS_KEY}.damaged`, text);
  } catch {
    // No storage, or text that is not JSON. Start from nothing.
  }
  return {};
}

/** Keep these settings, without the one that only means something on one computer. */
export function writeSavedSettings(
  storage: Pick<Storage, 'setItem'>,
  settings: SavedSettings,
): boolean {
  const kept = Object.fromEntries(Object.entries(settings).filter(([key]) => key !== NOT_KEPT));
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(kept));
    return true;
  } catch {
    return false;
  }
}

/** The browser's localStorage, or null when the browser will not hand it out. */
export function browserSettingsStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The transcript that was open last, or null. Anything in the saved
 * settings that is not a whole number reads as null, as on the desktop.
 */
export function readLastTranscriptId(storage: Pick<Storage, 'getItem' | 'setItem'>): number | null {
  const value = readSavedSettings(storage).last_transcript_id;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/** Remember which transcript is open, or null for none. The other settings stay. */
export function writeLastTranscriptId(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: number | null,
): void {
  const settings = readSavedSettings(storage);
  if (settings.last_transcript_id === id) return;
  writeSavedSettings(storage, { ...settings, last_transcript_id: id });
}

/**
 * Whether the transcript that was open comes back after a reload. On
 * unless the saved settings say false, as on the desktop.
 */
export function reopenLastTranscript(storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  return readSavedSettings(storage).reopen_last_transcript !== false;
}
