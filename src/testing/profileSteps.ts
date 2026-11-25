// The desktop's SettingsStore profile methods, each as the pure rule that
// ports it (src/core/savedProfiles.ts). Tests replay calls recorded from the
// desktop through this, in the shape the fixture script records them: the
// profiles before, the method and its arguments, then "ok" and what came
// back, or "error" and the message, with the profiles after.
import { ProfileError } from '../core/profiles';
import {
  addProfile,
  deleteProfile,
  getProfile,
  renameProfile,
  updateProfile,
} from '../core/savedProfiles';
import { DEFAULT_SAVED_SETTINGS } from '../core/settings';
import type { SavedSettings } from '../core/savedShapes';

export type ProfileStepResult = [outcome: 'ok' | 'error', answer: unknown, profilesAfter: unknown];

/** Every profile method the fixtures record, by its Python name. */
export const PROFILE_METHODS = [
  'get_profile',
  'add_profile',
  'update_profile',
  'rename_profile',
  'delete_profile',
] as const;

// The recorded arguments are whatever the desktop tests passed, a number for
// a name included. The port's names are typed as text, and take anything at
// run time, as the desktop does.
function text(value: unknown): string {
  return value as string;
}

function step(saved: SavedSettings, method: string, args: readonly unknown[]): [unknown, unknown] {
  const [name, second] = args;
  switch (method) {
    case 'get_profile':
      return [getProfile(saved, text(name)), saved.profiles];
    case 'add_profile': {
      const change = addProfile(saved, text(name), second);
      return [change.profile, change.saved.profiles];
    }
    case 'update_profile': {
      const change = updateProfile(saved, text(name), second);
      return [change.profile, change.saved.profiles];
    }
    case 'rename_profile': {
      const change = renameProfile(saved, text(name), text(second));
      return [change.profile, change.saved.profiles];
    }
    case 'delete_profile':
      return [null, deleteProfile(saved, text(name)).profiles];
    default:
      throw new Error(`No port for the desktop's ${method}`);
  }
}

/** One recorded call, run through the port. */
export function runProfileStep(
  before: unknown,
  method: string,
  args: readonly unknown[],
): ProfileStepResult {
  const saved: SavedSettings = { ...DEFAULT_SAVED_SETTINGS, profiles: before };
  try {
    const [answer, after] = step(saved, method, args);
    return ['ok', answer, after];
  } catch (error) {
    if (!(error instanceof ProfileError)) throw error;
    // A refused change leaves the saved settings as they were.
    return ['error', error.message, saved.profiles];
  }
}
