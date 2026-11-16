// Reading and writing saved data in the desktop app's shape. Ported from
// parse_data() and save_state() in core/storage.py of the desktop app.
//
// This is the only module that knows the snake_case names of the saved
// shape (savedShapes.ts). Everything else uses the camelCase Library of
// models.ts. The same reader serves the browser's saved record and the
// "data" part of an export file, as on the desktop.
import {
  BOOKMARK_DEFAULTS,
  TRANSCRIPT_DEFAULTS,
  type Bookmark,
  type Library,
  type Transcript,
} from './models';
import type { SavedBookmark, SavedData, SavedTranscript } from './savedShapes';
import { cleanCustomSpeakers } from './speakers';

/**
 * Position and speed change many times a second while reading. The store
 * saves those at most once in this many seconds, and everything else at
 * once. LIVE_SAVE_INTERVAL_SECONDS on the desktop.
 */
export const LIVE_SAVE_INTERVAL_SECONDS = 1.0;

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One camelCase name and the snake_case name it is saved under. */
type Names<T> = readonly (readonly [keyof T & string, string])[];

const BOOKMARK_NAMES: Names<Bookmark> = [
  ['index', 'index'],
  ['snippet', 'snippet'],
  ['createdAt', 'created_at'],
  ['label', 'label'],
];

const TRANSCRIPT_NAMES: Names<Transcript> = [
  ['id', 'id'],
  ['title', 'title'],
  ['space', 'space'],
  ['rawText', 'raw_text'],
  ['wpm', 'wpm'],
  ['position', 'position'],
  ['fontColor', 'font_color'],
  ['highlightColor', 'highlight_color'],
  ['backgroundColor', 'background_color'],
  ['fontSize', 'font_size'],
  ['isPaused', 'is_paused'],
  ['draftText', 'draft_text'],
  ['isStopped', 'is_stopped'],
  ['fontColorIsDefault', 'font_color_is_default'],
  ['highlightColorIsDefault', 'highlight_color_is_default'],
  ['backgroundColorIsDefault', 'background_color_is_default'],
  ['timesRead', 'times_read'],
  ['totalWordsRead', 'total_words_read'],
  ['totalTimeSpentSeconds', 'total_time_spent_seconds'],
  ['preNormalizeText', 'pre_normalize_text'],
  ['normalizedText', 'normalized_text'],
  ['chunkingEnabled', 'chunking_enabled'],
  ['chunkSize', 'chunk_size'],
  ['chunkMode', 'chunk_mode'],
  ['chunkCharTarget', 'chunk_char_target'],
  ['bookmarks', 'bookmarks'],
  ['speakerCustom', 'speaker_custom'],
];

// Transcript fields added after there was saved data. A file from before
// them has no such key. For these three a missing key reads as false, not
// the default true: the transcript already has its own colours, and this
// keeps them from being quietly replaced.
const COLOR_DEFAULT_FLAGS = [
  'font_color_is_default',
  'highlight_color_is_default',
  'background_color_is_default',
];

/** Thrown inside parseData for anything that makes Python give up. */
class Unreadable extends Error {}

/**
 * The items of a saved list, the way Python's "for item in value" sees
 * them. Python walks more than lists: an empty string or an empty object
 * has nothing in it and passes, while one with something in it hands out
 * text, which is never a transcript or a bookmark.
 */
function itemsOf(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (value === '' || (isObject(value) && Object.keys(value).length === 0)) return [];
  throw new Unreadable();
}

/**
 * The fields named in `names` that `saved` has, under their camelCase
 * names. A key that is not in `names` is dropped, so a field added by a
 * newer version does no harm.
 */
function known<T>(saved: Loose, names: Names<T>): Partial<Record<keyof T, unknown>> {
  const found: Partial<Record<keyof T, unknown>> = {};
  for (const [camel, snake] of names) {
    if (Object.hasOwn(saved, snake)) found[camel] = saved[snake];
  }
  return found;
}

function readBookmark(saved: unknown): Bookmark {
  if (!isObject(saved) || !Object.hasOwn(saved, 'index')) throw new Unreadable();
  return { ...BOOKMARK_DEFAULTS, ...known(saved, BOOKMARK_NAMES) } as Bookmark;
}

function readTranscript(saved: unknown): Transcript {
  if (!isObject(saved)) throw new Unreadable();
  const fields = known(saved, TRANSCRIPT_NAMES);
  for (const required of ['id', 'title', 'space'] as const) {
    if (!(required in fields)) throw new Unreadable();
  }
  const flags: Loose = {};
  for (const [camel, snake] of TRANSCRIPT_NAMES) {
    if (COLOR_DEFAULT_FLAGS.includes(snake) && !(camel in fields)) flags[camel] = false;
  }
  if ('bookmarks' in fields) {
    fields.bookmarks = itemsOf(fields.bookmarks).map(readBookmark);
  }
  // A list of the transcript's own is cleaned the same way as when it is
  // set, so a damaged one reads as Auto, or loses just its bad entries.
  if ('speakerCustom' in fields) {
    const cleaned = cleanCustomSpeakers(fields.speakerCustom);
    fields.speakerCustom = cleaned === null ? null : Object.fromEntries(cleaned);
  }
  return { ...TRANSCRIPT_DEFAULTS, ...flags, ...fields } as Transcript;
}

/**
 * Check and tidy saved data, whether it is the browser's own record or the
 * "data" part of an export file. Gives the library, or null when the data
 * cannot be used, which the caller treats as damaged.
 *
 * What it does, as the desktop does:
 * - Keys it does not know are dropped, on a transcript and on a bookmark.
 * - A missing field gets its default. The three colour flags get false.
 * - A transcript without id, title or space, a bookmark without index, or
 *   anything that is not an object where one belongs, makes it all null.
 *
 * What it does not do, as the desktop does not: check the values. A speed
 * of "fast", a negative Space index or a Space that is not in the list all
 * pass, so the type of the answer is a promise the data may break. See
 * "Export and import rules" in docs/handoff/phase-3.md.
 */
export function parseData(data: unknown): Library | null {
  if (!isObject(data)) return null;
  for (const key of ['transcripts', 'next_id', 'current_space_index', 'spaces']) {
    if (!Object.hasOwn(data, key)) return null;
  }
  try {
    return {
      nextId: data.next_id,
      currentSpaceIndex: data.current_space_index,
      spaces: data.spaces,
      transcripts: itemsOf(data.transcripts).map(readTranscript),
    } as Library;
  } catch (error) {
    if (error instanceof Unreadable) return null;
    throw error;
  }
}

function renamed<T>(value: T, names: Names<T>): Loose {
  const saved: Loose = {};
  for (const [camel, snake] of names) {
    saved[snake] = value[camel];
  }
  return saved;
}

/**
 * The library in the shape it is saved and exported in: what save_state()
 * and export_state() write on the desktop, before it is turned into text.
 */
export function toSavedData(library: Library): SavedData {
  return {
    next_id: library.nextId,
    current_space_index: library.currentSpaceIndex,
    // A list is copied. Anything else is unchecked data that parseData let
    // through, and it goes back out as it came in.
    spaces: Array.isArray(library.spaces)
      ? [...library.spaces]
      : (library.spaces as unknown as string[]),
    transcripts: library.transcripts.map((transcript) => {
      const saved = renamed(transcript, TRANSCRIPT_NAMES);
      saved.bookmarks = transcript.bookmarks.map((bookmark) => renamed(bookmark, BOOKMARK_NAMES));
      return saved as unknown as SavedTranscript & { bookmarks: SavedBookmark[] };
    }),
  };
}
