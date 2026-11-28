// The app-wide settings: their defaults, their ranges and the rules for
// reading, replacing and changing them. Ported from core/settings_store.py
// of the desktop app.
//
// The settings are kept the way the desktop writes them to settings.json
// and into an export file: one object with snake_case names (SavedSettings).
// That object is never tidied beyond what the desktop does, so an export
// made here is the export the desktop would have made. What the page reads
// is a second thing, the Settings from settingsView(), and that one is
// always safe to use: a wrong kind of value reads as the default and a
// number outside its range is pulled back into it.
//
// data_directory is the one desktop setting that is not here. It is a
// folder on one computer, and the desktop leaves it out of an export too.
import { CHIME_STYLES } from './chime';
import type { Settings } from './models';
import { cleanProfileList } from './profiles';
import type { SavedSettings } from './savedShapes';
import { DEFAULT_SORT, knownSort } from './transcriptSort';

export type Range = readonly [low: number, high: number];

export const WPM_RANGE: Range = [100, 1000];
export const SKIP_WORD_COUNT_RANGE: Range = [1, 50];
export const FONT_SIZE_RANGE: Range = [16, 96];
export const FONT_SIZE_STEP_RANGE: Range = [1, 10];
export const HIGHLIGHT_OFFSET_RANGE: Range = [-3, 3];
export const GUIDE_MARK_THICKNESS_RANGE: Range = [2, 6];
export const GUIDE_MARK_LENGTH_PERCENT_RANGE: Range = [15, 60];
export const RESUME_REWIND_WORDS_RANGE: Range = [1, 5];
/** Words flashed together in fixed chunking. 1 is left out: that is "off". */
export const CHUNK_SIZE_RANGE: Range = [2, 5];
/** The width of an adaptive chunk, in characters. */
export const CHUNK_CHAR_TARGET_RANGE: Range = [15, 60];
/** 0 is Off, then Small, Medium and Large. */
export const LETTER_SPACING_LEVEL_RANGE: Range = [0, 3];

// The first of each is the default.
export const SPEAKER_CUE_SOUNDS = ['off', 'change', 'per_speaker'] as const;
export const SPEAKER_CUE_TAG_POSITIONS = ['above', 'top_right'] as const;
// The chime styles live with the chime, as on the desktop, and are passed on
// here with the other choices.
export { CHIME_STYLES };
export const APPEARANCE_MODES = ['light', 'dark', 'system'] as const;
export const CHUNK_MODES = ['fixed', 'adaptive'] as const;

/**
 * Every setting with the value a new install has, in the desktop's order.
 * The window and layout sizes mean nothing in a browser. They are kept so
 * that an export made here has everything the desktop expects.
 */
export const DEFAULT_SAVED_SETTINGS: Readonly<SavedSettings> = Object.freeze({
  window_width: 1000,
  window_height: 650,
  window_x: null,
  window_y: null,
  window_maximized: false,
  sidebar_width: 220,
  bottom_band_height: 100,
  default_wpm: 300,
  default_font_color: '#3B2E27',
  default_highlight_color: '#D98A3D',
  default_background_color: '#F6EFE3',
  default_font_size: 32,
  default_chunking_enabled: false,
  default_chunk_size: 2,
  default_chunk_mode: 'fixed',
  default_chunk_char_target: 30,
  font_size_step: 1,
  highlight_offset_px: 0,
  freeform_resize_enabled: false,
  skip_word_count: 10,
  pause_on_skip: false,
  length_pacing_enabled: false,
  appearance_mode: 'light',
  guide_mark_horizontal_enabled: false,
  guide_mark_thickness_px: 2,
  guide_mark_length_percent: 35,
  guide_mark_color: '#3B2E27',
  guide_mark_color_is_default: true,
  split_long_paragraphs_enabled: false,
  resume_rewind_enabled: false,
  resume_rewind_words: 3,
  warm_up_enabled: false,
  scrub_pause_enabled: true,
  peripheral_context_enabled: false,
  dyslexia_font_enabled: false,
  letter_spacing_level: 0,
  bold_starts_enabled: false,
  speaker_cues_enabled: false,
  speaker_cue_sound: 'off',
  speaker_cue_style: 'bell',
  speaker_cue_name_tag_enabled: true,
  speaker_cue_tag_position: 'above',
  speaker_cue_flash_enabled: true,
  reopen_last_transcript: true,
  last_transcript_id: null,
  transcript_sort: DEFAULT_SORT,
  profiles: [],
});

/**
 * The given settings laid over the defaults, in the desktop's order. A key
 * that is not a setting is dropped: one a newer version added, one that was
 * removed long ago, a typo in a file edited by hand. Dropping it keeps
 * every other setting. `AppSettings(**_known_settings(data))` on the
 * desktop.
 */
function overDefaults(data: SavedSettings): SavedSettings {
  const settings: SavedSettings = {};
  for (const key of Object.keys(DEFAULT_SAVED_SETTINGS)) {
    settings[key] = Object.hasOwn(data, key) ? data[key] : DEFAULT_SAVED_SETTINGS[key];
  }
  return settings;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The settings in what was saved, or null when it is not settings at all
 * (a list, a number, nothing). `parsed` is the saved text after JSON.parse.
 * `_read_settings_file` on the desktop.
 */
export function loadSavedSettings(parsed: unknown): SavedSettings | null {
  if (!isObject(parsed)) return null;
  const data: SavedSettings = { ...parsed };
  // guide_mark_color is older than guide_mark_color_is_default. Where the
  // flag is missing, the colour still follows the theme if it is the one
  // colour that was ever the default.
  if (!Object.hasOwn(data, 'guide_mark_color_is_default')) {
    const color = Object.hasOwn(data, 'guide_mark_color')
      ? data.guide_mark_color
      : DEFAULT_SAVED_SETTINGS.guide_mark_color;
    data.guide_mark_color_is_default = color === DEFAULT_SAVED_SETTINGS.guide_mark_color;
  }
  // Clean the saved profiles instead of trusting them. A bad entry is
  // dropped on its own, so one damaged profile cannot make the whole load
  // fail and put every other setting back to its default.
  data.profiles = cleanProfileList(data.profiles);
  return overDefaults(data);
}

/**
 * The settings after an import in Replace mode: the file's settings, with
 * the default for any it does not have. Profiles are the exception. A file
 * with a "profiles" key replaces them, each entry checked, and anything
 * that is not a list there means no profiles. A file from before profiles
 * existed has no such key, and then the ones already here are kept.
 * `replace_from_bundle` on the desktop.
 */
export function replaceFromBundle(current: SavedSettings, incoming: SavedSettings): SavedSettings {
  return overDefaults({
    ...incoming,
    profiles: Object.hasOwn(incoming, 'profiles')
      ? cleanProfileList(incoming.profiles)
      : current.profiles,
  });
}

/**
 * A guide mark colour picked by hand. From then on it no longer follows
 * the theme, unless it is the colour it already had.
 */
export function setGuideMarkColor(saved: SavedSettings, color: string): SavedSettings {
  if (color === saved.guide_mark_color) return saved;
  return { ...saved, guide_mark_color: color, guide_mark_color_is_default: false };
}

/**
 * Put back a guide mark colour that was recorded earlier (a reading
 * profile), with whether it follows the theme.
 */
export function restoreGuideMarkColor(
  saved: SavedSettings,
  color: string,
  followsTheme: boolean,
): SavedSettings {
  if (saved.guide_mark_color === color && saved.guide_mark_color_is_default === followsTheme) {
    return saved;
  }
  return { ...saved, guide_mark_color: color, guide_mark_color_is_default: followsTheme };
}

/** Give the guide marks the theme's colour, if they still follow the theme. */
export function resyncGuideMarkColorDefault(saved: SavedSettings, color: string): SavedSettings {
  // Python's truthiness: the desktop tests the flag with a plain `if`.
  if (!saved.guide_mark_color_is_default || saved.guide_mark_color === color) return saved;
  return { ...saved, guide_mark_color: color };
}

// ---- What the page reads ----

function fallback<K extends string>(key: K): unknown {
  return DEFAULT_SAVED_SETTINGS[key];
}

/** A whole number inside its range. Anything else that is not a whole number is the default. */
function whole(saved: SavedSettings, key: string, [low, high]: Range): number {
  const value = saved[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback(key) as number;
  return Math.max(low, Math.min(high, value));
}

/** On only when it is true, or off only when it is false, whichever keeps the default. */
function flag(saved: SavedSettings, key: string): boolean {
  return fallback(key) === true ? saved[key] !== false : saved[key] === true;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function color(saved: SavedSettings, key: string): string {
  const value = saved[key];
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : (fallback(key) as string);
}

function choice<T extends string>(saved: SavedSettings, key: string, choices: readonly T[]): T {
  const value = saved[key];
  return choices.includes(value as T) ? (value as T) : (fallback(key) as T);
}

/**
 * The settings as the page uses them. Where the desktop checks a setting
 * when it reads it, this checks it the same way. The desktop reads the
 * rest as they are, because its Settings window only ever writes good
 * values. Here a saved value can come from any file, so every one is
 * checked: the wrong kind of value reads as the default, and a number
 * outside its range reads as the nearest end of it.
 */
export function settingsView(saved: SavedSettings): Settings {
  const lastId = saved.last_transcript_id;
  return {
    defaultWpm: whole(saved, 'default_wpm', WPM_RANGE),
    defaultFontColor: color(saved, 'default_font_color'),
    defaultHighlightColor: color(saved, 'default_highlight_color'),
    defaultBackgroundColor: color(saved, 'default_background_color'),
    defaultFontSize: whole(saved, 'default_font_size', FONT_SIZE_RANGE),
    defaultChunkingEnabled: flag(saved, 'default_chunking_enabled'),
    defaultChunkSize: whole(saved, 'default_chunk_size', CHUNK_SIZE_RANGE),
    defaultChunkMode: choice(saved, 'default_chunk_mode', CHUNK_MODES),
    defaultChunkCharTarget: whole(saved, 'default_chunk_char_target', CHUNK_CHAR_TARGET_RANGE),
    fontSizeStep: whole(saved, 'font_size_step', FONT_SIZE_STEP_RANGE),

    skipWordCount: whole(saved, 'skip_word_count', SKIP_WORD_COUNT_RANGE),
    pauseOnSkip: flag(saved, 'pause_on_skip'),
    lengthPacingEnabled: flag(saved, 'length_pacing_enabled'),
    warmUpEnabled: flag(saved, 'warm_up_enabled'),
    resumeRewindEnabled: flag(saved, 'resume_rewind_enabled'),
    resumeRewindWords: whole(saved, 'resume_rewind_words', RESUME_REWIND_WORDS_RANGE),
    scrubPauseEnabled: flag(saved, 'scrub_pause_enabled'),
    peripheralContextEnabled: flag(saved, 'peripheral_context_enabled'),
    splitLongParagraphsEnabled: flag(saved, 'split_long_paragraphs_enabled'),

    appearanceMode: choice(saved, 'appearance_mode', APPEARANCE_MODES),
    highlightOffsetPx: whole(saved, 'highlight_offset_px', HIGHLIGHT_OFFSET_RANGE),
    guideMarkHorizontalEnabled: flag(saved, 'guide_mark_horizontal_enabled'),
    guideMarkThicknessPx: whole(saved, 'guide_mark_thickness_px', GUIDE_MARK_THICKNESS_RANGE),
    guideMarkLengthPercent: whole(
      saved,
      'guide_mark_length_percent',
      GUIDE_MARK_LENGTH_PERCENT_RANGE,
    ),
    guideMarkColor: color(saved, 'guide_mark_color'),
    guideMarkColorIsDefault: flag(saved, 'guide_mark_color_is_default'),
    dyslexiaFontEnabled: flag(saved, 'dyslexia_font_enabled'),
    letterSpacingLevel: whole(saved, 'letter_spacing_level', LETTER_SPACING_LEVEL_RANGE),
    boldStartsEnabled: flag(saved, 'bold_starts_enabled'),

    speakerCuesEnabled: flag(saved, 'speaker_cues_enabled'),
    speakerCueSound: choice(saved, 'speaker_cue_sound', SPEAKER_CUE_SOUNDS),
    speakerCueStyle: choice(saved, 'speaker_cue_style', CHIME_STYLES),
    speakerCueNameTagEnabled: flag(saved, 'speaker_cue_name_tag_enabled'),
    speakerCueTagPosition: choice(saved, 'speaker_cue_tag_position', SPEAKER_CUE_TAG_POSITIONS),
    speakerCueFlashEnabled: flag(saved, 'speaker_cue_flash_enabled'),

    reopenLastTranscript: flag(saved, 'reopen_last_transcript'),
    // Only a whole number is an id. Anything else reads as no transcript.
    lastTranscriptId: typeof lastId === 'number' && Number.isInteger(lastId) ? lastId : null,
    transcriptSort: knownSort(saved.transcript_sort),

    // Already clean when they were read. Cleaning a clean list changes
    // nothing, and it is what lets the type promise a list of profiles.
    profiles: cleanProfileList(saved.profiles),
  };
}

/** defaultWpm to default_wpm: the name a setting is saved under. */
export function savedName(key: keyof Settings): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * The settings with some of them changed. Each new value is cleaned the
 * way settingsView() cleans, so nothing out of range is ever saved from
 * the page. Gives the same object back when nothing changes.
 *
 * A guide mark colour picked by hand goes through setGuideMarkColor(),
 * which also knows about following the theme.
 */
export function withChanges(saved: SavedSettings, changes: Partial<Settings>): SavedSettings {
  const keys = Object.keys(changes) as (keyof Settings)[];
  const next: SavedSettings = { ...saved };
  for (const key of keys) next[savedName(key)] = changes[key];
  const cleaned = settingsView(next);
  let changed = false;
  for (const key of keys) {
    const name = savedName(key);
    // Profiles handed in here were made by profiles.ts, so they are taken
    // as they are.
    next[name] = key === 'profiles' ? changes.profiles : cleaned[key];
    if (next[name] !== saved[name]) changed = true;
  }
  return changed ? next : saved;
}
