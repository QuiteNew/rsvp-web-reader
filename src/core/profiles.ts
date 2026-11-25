// Reading profiles: named snapshots of the app-wide settings that decide how
// the reader feels, so something like "Fast skim" and "Careful read" can be
// switched between in one go. Ported from core/profiles.py of the desktop
// app, checked against fixtures/core/profiles.json.
//
// This is the pure part. It knows which settings a profile holds, what a
// valid value for each one looks like, and what makes a good profile name.
// Saving and loading belong to the settings store.
//
// A profile only holds app-wide settings: the guide marks, the pacing
// options, resume rewind, the surrounding words, skip behaviour, the
// scrubber and paragraph switches, the +/- step, the letter spacing level,
// and the Speed and Word size that new transcripts start from. It never
// holds anything that belongs to a transcript, and it never changes the
// transcript that is open. Keeping different texts apart is what Spaces are
// for.
//
// Left out on purpose: the colours, chunking, the Light/Dark/System mode, the
// OpenDyslexic switch and bold word starts. A key missing from a saved profile
// means "leave that setting alone", which is also how a profile saved before
// a setting joined the list keeps working.
//
// The keys are the snake_case names the settings are saved under, as on the
// desktop, because profiles are saved and exported in that form and a
// desktop export has to load here unchanged.
//
// One difference from Python cannot be helped. Python tells 10 from 10.0 and
// takes only the first as a whole number. JSON.parse() reads both as 10, so a
// hand-edited file with 10.0 keeps that value here where the desktop drops it.

import { isPyPrintable, pyCasefold, pyLength, pySplit } from './pythonText';

export const MAX_NAME_LENGTH = 30;

/** Every setting a profile can hold, each saved under the same name. */
export const PROFILE_KEYS = [
  'highlight_offset_px',
  'guide_mark_horizontal_enabled',
  'guide_mark_thickness_px',
  'guide_mark_length_percent',
  'guide_mark_color',
  'length_pacing_enabled',
  'warm_up_enabled',
  'resume_rewind_enabled',
  'resume_rewind_words',
  'peripheral_context_enabled',
  'skip_word_count',
  'pause_on_skip',
  'default_wpm',
  'default_font_size',
  'font_size_step',
  'split_long_paragraphs_enabled',
  'scrub_pause_enabled',
  'letter_spacing_level',
] as const;

export type ProfileKey = (typeof PROFILE_KEYS)[number];

/**
 * Colours that can follow the Light/Dark theme. A profile stores null for
 * one of these when it was still following the theme at the moment the
 * profile was saved, and a "#RRGGBB" value only for a colour picked by hand.
 * Without that, applying a profile would freeze the colour against the theme.
 */
export const THEME_COLOR_KEYS: readonly ProfileKey[] = ['guide_mark_color'];

/** A value a loaded profile can hold: null only for a theme colour. */
export type ProfileValue = number | boolean | string | null;

/** What a profile holds. A missing key means "leave that setting alone". */
export type ProfileValues = Readonly<Partial<Record<ProfileKey, ProfileValue>>>;

/** One saved profile, in the form it is saved and exported in. */
export interface Profile {
  readonly name: string;
  readonly values: ProfileValues;
}

/**
 * Thrown by the store's profile changes when a name is not allowed or the
 * profile asked for does not exist. The message is written to be shown to
 * the user as it is. Python's ProfileError is a ValueError, which the port
 * maps to RangeError.
 */
export class ProfileError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileError';
  }
}

type Kind = 'int' | 'bool' | 'color';

// A Map and not a plain object: a plain object would also answer for
// "constructor", "toString" and the other names every object inherits.
const KINDS: ReadonlyMap<string, Kind> = new Map<ProfileKey, Kind>([
  ['highlight_offset_px', 'int'],
  ['guide_mark_horizontal_enabled', 'bool'],
  ['guide_mark_thickness_px', 'int'],
  ['guide_mark_length_percent', 'int'],
  ['guide_mark_color', 'color'],
  ['length_pacing_enabled', 'bool'],
  ['warm_up_enabled', 'bool'],
  ['resume_rewind_enabled', 'bool'],
  ['resume_rewind_words', 'int'],
  ['peripheral_context_enabled', 'bool'],
  ['skip_word_count', 'int'],
  ['pause_on_skip', 'bool'],
  ['default_wpm', 'int'],
  ['default_font_size', 'int'],
  ['font_size_step', 'int'],
  ['split_long_paragraphs_enabled', 'bool'],
  ['scrub_pause_enabled', 'bool'],
  ['letter_spacing_level', 'int'],
]);

// Python's re.fullmatch: the whole text, and no line break after it either.
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

// What Python calls a dict, as JSON.parse() gives it: an object that is not
// a list.
function isDict(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---- Names ----

/**
 * Trim the name and squeeze any run of spaces, tabs or line breaks down to a
 * single space, by Python's idea of a space. Anything that is not text comes
 * back as an empty string, which nameProblem() then rejects.
 */
export function cleanName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return pySplit(name).join(' ');
}

/**
 * Why this name cannot be used, as a short message for the user, or null
 * when it is fine. Names are compared without regard to case, the way
 * Python's casefold() sees it, so "fast skim" clashes with "Fast skim" and
 * "STRASSE" with "Straße".
 *
 * existingNames is every profile name already saved. When a profile is being
 * renamed, pass its current name as ownName, so that keeping the name or only
 * changing its capitals is not reported as a clash with itself.
 */
export function nameProblem(
  name: unknown,
  existingNames: readonly unknown[],
  ownName: unknown = null,
): string | null {
  const cleaned = cleanName(name);
  if (cleaned === '') return 'Give the profile a name.';
  if (pyLength(cleaned) > MAX_NAME_LENGTH) return `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  if (!isPyPrintable(cleaned)) return "That name has a character that can't be shown.";

  const own = ownName === null || ownName === undefined ? null : pyCasefold(cleanName(ownName));
  const wanted = pyCasefold(cleaned);
  for (const existing of existingNames) {
    const folded = pyCasefold(cleanName(existing));
    // Only text can clean to something that is not empty, so existing is a
    // string whenever this matches.
    if (folded === wanted && folded !== own) {
      return `There is already a profile called "${String(existing)}".`;
    }
  }
  return null;
}

// ---- Values ----

/**
 * Whether value is something a profile may hold for this key. This checks
 * the kind of value only (a whole number, a true or false, a "#RRGGBB"
 * colour). It does not check ranges: those are applied when a profile is
 * applied.
 */
export function valueIsValid(key: string, value: unknown): boolean {
  const kind = KINDS.get(key);
  if (kind === undefined) return false;
  if (THEME_COLOR_KEYS.includes(key as ProfileKey) && value === null) return true;
  switch (kind) {
    case 'bool':
      return typeof value === 'boolean';
    case 'int':
      // In Python a bool is a kind of int, and True must not pass as 1. Here
      // a boolean is never a number, so that takes care of itself.
      return typeof value === 'number' && Number.isInteger(value);
    case 'color':
      return typeof value === 'string' && HEX_COLOR.test(value);
  }
}

/**
 * Keep only the entries of values that are a known key with a valid value,
 * in the order of PROFILE_KEYS. Anything else is dropped without a fuss, so
 * a hand-edited or damaged save cannot put junk into the reader. Not a dict
 * at all gives an empty one.
 */
export function sanitizeValues(values: unknown): ProfileValues {
  if (!isDict(values)) return {};
  const kept: Partial<Record<ProfileKey, ProfileValue>> = {};
  for (const key of PROFILE_KEYS) {
    if (Object.hasOwn(values, key) && valueIsValid(key, values[key])) {
      kept[key] = values[key] as ProfileValue;
    }
  }
  return kept;
}

/**
 * Take a snapshot of the current settings as a profile's values.
 *
 * settingsValues holds the app-wide settings under their saved names. Other
 * keys in it are ignored, so all the saved settings can be passed in. The
 * values are copied as they are, without checking them, as on the desktop.
 * followingTheme names the colour keys that are still following the theme,
 * which are stored as null.
 *
 * Every key in PROFILE_KEYS has to be there. A missing one throws, since that
 * would mean the caller and this module disagree about what a profile holds.
 */
export function buildValues(
  settingsValues: Readonly<Record<string, unknown>>,
  followingTheme: readonly string[] = [],
): Record<ProfileKey, unknown> {
  const values: Partial<Record<ProfileKey, unknown>> = {};
  for (const key of PROFILE_KEYS) {
    if (!Object.hasOwn(settingsValues, key)) {
      throw new Error(`The settings have no ${key}, which every profile holds`);
    }
    values[key] = settingsValues[key];
  }
  for (const key of followingTheme) {
    if (!THEME_COLOR_KEYS.includes(key as ProfileKey)) {
      throw new RangeError(`'${key}' is not a colour that can follow the theme`);
    }
    values[key as ProfileKey] = null;
  }
  return values as Record<ProfileKey, unknown>;
}

// ---- Loading saved profiles ----

/**
 * Rebuild one profile from its saved form, or null when it cannot be used:
 * not a dict, no usable name, or values that are not a dict. Invalid entries
 * inside the values are dropped, see sanitizeValues().
 */
export function profileFromDict(raw: unknown): Profile | null {
  if (!isDict(raw)) return null;
  const name = cleanName(Object.hasOwn(raw, 'name') ? raw.name : null);
  if (name === '' || pyLength(name) > MAX_NAME_LENGTH || !isPyPrintable(name)) return null;
  const values = Object.hasOwn(raw, 'values') ? raw.values : null;
  if (!isDict(values)) return null;
  return { name, values: sanitizeValues(values) };
}

/**
 * Turn whatever was saved under "profiles" into a clean list. Unusable
 * entries are skipped, and when two share a name (ignoring case) the first
 * one is kept. Anything that is not a list gives an empty list. Loading
 * never fails because of a bad profile, which matters because a failed
 * settings load falls back to the defaults for everything.
 */
export function cleanProfileList(raw: unknown): Profile[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: Profile[] = [];
  const seen = new Set<string>();
  for (const item of raw as readonly unknown[]) {
    const profile = profileFromDict(item);
    if (profile === null) continue;
    const folded = pyCasefold(profile.name);
    if (seen.has(folded)) continue;
    seen.add(folded);
    cleaned.push(profile);
  }
  return cleaned;
}
