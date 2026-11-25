// The saved reading profiles: finding one, and adding, updating, renaming
// and deleting them. Ported from the "Reading profiles" part of the desktop's
// core/settings_store.py, as pure functions over the saved settings, so the
// store in src/store only has to save what comes back. Taking a snapshot of
// the settings and applying a profile come from the desktop's gui/app.py, at
// the end of this file.
//
// Checked against the desktop's own store tests (settings_profile in
// desktop_tests.json) and a script of steps aimed at what those tests leave
// out (profile_steps in settings.json).
//
// Names are matched without regard to case, the way Python's casefold() sees
// it, and after tidying the spaces, so " fast  SKIM " finds "Fast skim". A
// problem with a name, or a profile that is not there, throws ProfileError
// with a message that can be shown to the user as it is.

import { planProfile } from './profileApply';
import {
  ProfileError,
  buildValues,
  cleanName,
  cleanProfileList,
  nameProblem,
  sanitizeValues,
} from './profiles';
import type { Profile, ProfileKey } from './profiles';
import { pyCasefold } from './pythonText';
import type { SavedSettings } from './savedShapes';
import { restoreGuideMarkColor } from './settings';

/** What a change gives back: the saved settings after it, and the profile. */
export interface ProfileChange {
  readonly saved: SavedSettings;
  readonly profile: Profile;
}

/**
 * Every saved profile, in the order they were added. The list was checked
 * when the settings were read, so checking it again changes nothing. It is
 * what lets the type be trusted.
 */
export function savedProfiles(saved: SavedSettings): readonly Profile[] {
  return cleanProfileList(saved.profiles);
}

/** The names of the saved profiles, in the order they were added. */
export function profileNames(saved: SavedSettings): string[] {
  return savedProfiles(saved).map((profile) => profile.name);
}

/** The profile with this name, or null when there is none. */
export function getProfile(saved: SavedSettings, name: string): Profile | null {
  const profiles = savedProfiles(saved);
  const index = profileIndex(profiles, name);
  return index === null ? null : (profiles[index] ?? null);
}

/**
 * Save a new profile at the end of the list. The name is tidied first and
 * has to be free (see nameProblem()). Entries in values that a profile cannot
 * hold are dropped (see sanitizeValues()).
 */
export function addProfile(saved: SavedSettings, name: string, values: unknown): ProfileChange {
  const profiles = savedProfiles(saved);
  const problem = nameProblem(name, names(profiles));
  if (problem !== null) throw new ProfileError(problem);
  const profile: Profile = { name: cleanName(name), values: sanitizeValues(values) };
  return { saved: withProfiles(saved, [...profiles, profile]), profile };
}

/**
 * Replace the settings an existing profile holds, keeping its name and its
 * place in the list.
 */
export function updateProfile(saved: SavedSettings, name: string, values: unknown): ProfileChange {
  const profiles = savedProfiles(saved);
  const index = requireProfile(profiles, name);
  const profile: Profile = { name: at(profiles, index).name, values: sanitizeValues(values) };
  return { saved: withProfiles(saved, replaced(profiles, index, profile)), profile };
}

/**
 * Give an existing profile a new name, keeping what it holds and its place.
 * Changing only the capitals of its own name is fine.
 */
export function renameProfile(saved: SavedSettings, name: string, newName: string): ProfileChange {
  const profiles = savedProfiles(saved);
  const index = requireProfile(profiles, name);
  const current = at(profiles, index);
  const problem = nameProblem(newName, names(profiles), current.name);
  if (problem !== null) throw new ProfileError(problem);
  const profile: Profile = { name: cleanName(newName), values: current.values };
  return { saved: withProfiles(saved, replaced(profiles, index, profile)), profile };
}

/** Remove a profile. Its name can be used again afterwards. */
export function deleteProfile(saved: SavedSettings, name: string): SavedSettings {
  const profiles = savedProfiles(saved);
  const index = requireProfile(profiles, name);
  return withProfiles(
    saved,
    profiles.filter((_, i) => i !== index),
  );
}

function names(profiles: readonly Profile[]): string[] {
  return profiles.map((profile) => profile.name);
}

// Where the profile with this name is, or null. A name that is blank once
// tidied never matches, not even a profile whose name is blank, which a
// checked list cannot hold anyway.
function profileIndex(profiles: readonly Profile[], name: string): number | null {
  const wanted = pyCasefold(cleanName(name));
  if (wanted === '') return null;
  const index = profiles.findIndex((profile) => pyCasefold(profile.name) === wanted);
  return index === -1 ? null : index;
}

// The message quotes the name as it was given, spaces and all, as the
// desktop's does.
function requireProfile(profiles: readonly Profile[], name: string): number {
  const index = profileIndex(profiles, name);
  if (index === null) throw new ProfileError(`There is no profile called "${String(name)}".`);
  return index;
}

function at(profiles: readonly Profile[], index: number): Profile {
  const profile = profiles[index];
  if (profile === undefined) throw new Error(`No profile at ${index}`);
  return profile;
}

function replaced(profiles: readonly Profile[], index: number, profile: Profile): Profile[] {
  return profiles.map((item, i) => (i === index ? profile : item));
}

// Only the profiles change. Every other setting is the same value, in the
// same object, so nothing else is saved differently.
function withProfiles(saved: SavedSettings, profiles: readonly Profile[]): SavedSettings {
  return { ...saved, profiles };
}

// ---- Taking a snapshot, and applying a profile ----
// From the "Reading profiles" part of the desktop's gui/app.py. There the
// window does this, through one store setter per setting. Every one of those
// setters only stores the value, so here it is one change to the saved
// settings, and the store saves it once.

// The desktop tests the flag with a plain `if`, so this reads it with
// truthiness too, as resyncGuideMarkColorDefault() in settings.ts does.
function guideMarkFollowsTheme(saved: SavedSettings): boolean {
  return Boolean(saved.guide_mark_color_is_default);
}

/**
 * The settings a profile holds, as they are saved right now, odd values and
 * all. `_current_profile_settings` on the desktop.
 */
export function currentProfileSettings(saved: SavedSettings): Record<ProfileKey, unknown> {
  return buildValues(saved);
}

/**
 * What a profile saved at this moment would hold. A guide mark colour that
 * still follows the Light/Dark theme is stored as null, so applying the
 * profile later does not freeze it against the theme.
 * `_snapshot_current_settings` on the desktop.
 */
export function snapshotValues(saved: SavedSettings): Record<ProfileKey, unknown> {
  return buildValues(saved, guideMarkFollowsTheme(saved) ? ['guide_mark_color'] : []);
}

/**
 * The saved settings with a profile put to use. planProfile() decides the
 * values: numbers pulled into range, anything the profile does not hold left
 * as it is, and the guide mark colour resolved against the theme, whose
 * colour the page passes in. The colour goes back through
 * restoreGuideMarkColor(), the one rule that can turn "follows the theme"
 * back on, or mark a colour as picked by hand when it matches the current
 * one. Nothing a profile does not hold is touched: not a transcript, not the
 * colours, not chunking. Speed and Word size are the Defaults for new
 * transcripts. `_apply_profile` on the desktop.
 */
export function applyProfile(
  saved: SavedSettings,
  name: string,
  themeGuideMarkColor: string,
): SavedSettings {
  const profile = getProfile(saved, name);
  if (profile === null) throw new ProfileError(`There is no profile called "${String(name)}".`);
  const plan = planProfile(
    profile.values,
    currentProfileSettings(saved),
    guideMarkFollowsTheme(saved),
    themeGuideMarkColor,
  );
  const { guide_mark_color: color, ...rest } = plan.values;
  return restoreGuideMarkColor({ ...saved, ...rest }, color as string, plan.guideMarkFollowsTheme);
}
