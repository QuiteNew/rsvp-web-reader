// The shapes of saved data as they are written, with the desktop app's own
// snake_case names. Types only, no code. Read from core/models.py,
// core/storage.py and core/data_bundle.py of the desktop project.
//
// The rest of the web app uses the camelCase shapes in models.ts. One
// module, core/storageFormat.ts in phase 3, turns one into the other, and
// nothing else should name a key from this file.
//
// These say what a file written by the desktop app holds. A file being
// read is not trusted to match them: it comes in as unknown and goes
// through the port of parse_data() first.

/** What "bundle_format" must be. Another number is refused with a message. */
export type BundleFormat = 1;

export interface SavedBookmark {
  index: number;
  snippet: string;
  created_at: string;
  label: string;
}

export interface SavedTranscript {
  // Required. A transcript without one of these three makes the whole
  // file unreadable.
  id: number;
  title: string;
  space: string;
  // Everything below may be missing in an older file and then gets the
  // default in TRANSCRIPT_DEFAULTS, with one exception noted further down.
  raw_text: string;
  wpm: number;
  position: number;
  font_color: string;
  highlight_color: string;
  background_color: string;
  font_size: number;
  is_paused: boolean;
  draft_text: string;
  is_stopped: boolean;
  // The exception: when missing these three become false, not the default
  // true, so an old transcript keeps the colours it has.
  font_color_is_default: boolean;
  highlight_color_is_default: boolean;
  background_color_is_default: boolean;
  times_read: number;
  total_words_read: number;
  total_time_spent_seconds: number;
  pre_normalize_text: string;
  normalized_text: string;
  chunking_enabled: boolean;
  chunk_size: number;
  chunk_mode: string;
  chunk_char_target: number;
  bookmarks: SavedBookmark[];
  // null is Auto. An object is the transcript's own list, label key to name.
  speaker_custom: Record<string, string> | null;
}

/** data.json on the desktop, and the "data" part of a bundle. */
export interface SavedData {
  next_id: number;
  current_space_index: number;
  spaces: string[];
  transcripts: SavedTranscript[];
}

/**
 * The "settings" part of a bundle: the desktop settings without
 * data_directory. Kept loose on purpose. The desktop has many settings the
 * web app does not use, and each side drops the keys it does not know.
 */
export type SavedSettings = Record<string, unknown>;

/** An export file. */
export interface SavedBundle {
  bundle_format: BundleFormat;
  data: SavedData;
  settings: SavedSettings;
}
