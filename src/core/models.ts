// The shapes of saved data, from the desktop app's core/models.py.
//
// These are the shapes the app works with in memory, with camelCase names.
// The desktop app's files use snake_case names (raw_text, font_color).
// Turning one into the other is the job of the bundle reader in phase 3,
// and nothing else should know the snake_case names.
//
// The defaults are the dataclass defaults from models.py. They are also the
// right values for a field that is missing from an old save file.

// A reading position saved on purpose. A transcript holds at most one
// bookmark per word index, and keeps them sorted by index.
export interface Bookmark {
  // The word index it points at.
  readonly index: number;
  // A short piece of the text around it, taken when it was made.
  readonly snippet: string;
  // An ISO 8601 time, or '' for a bookmark from before this was recorded.
  readonly createdAt: string;
  // A name the reader gave it. When empty, lists show the snippet.
  readonly label: string;
}

export type ChunkMode = 'fixed' | 'adaptive';

// The speakers picked by hand, or null for Auto. Maps a label's key, as
// labelKey() in speakers.ts makes it, to the name shown for it.
export type SpeakerCustom = Readonly<Record<string, string>> | null;

export interface Transcript {
  // Never reused, even after a transcript is deleted.
  readonly id: number;
  readonly title: string;
  // The name of the Space it belongs to.
  readonly space: string;
  // The saved text that gets read.
  readonly rawText: string;
  readonly wpm: number;
  // The word index reading was last at.
  readonly position: number;
  readonly fontColor: string;
  readonly highlightColor: string;
  readonly backgroundColor: string;
  readonly fontSize: number;
  readonly isPaused: boolean;
  // Text sitting in the edit box that was not saved yet.
  readonly draftText: string;
  // True when the last session was stopped, so it opens on the edit box.
  readonly isStopped: boolean;
  // Whether each colour still follows the theme, or was picked by hand.
  readonly fontColorIsDefault: boolean;
  readonly highlightColorIsDefault: boolean;
  readonly backgroundColorIsDefault: boolean;
  // Sessions that had some real reading time.
  readonly timesRead: number;
  // Words the reader moved through on its own. Skipping does not count.
  readonly totalWordsRead: number;
  // Time spent reading, without the time spent paused.
  readonly totalTimeSpentSeconds: number;
  // What the Normalize button needs to undo itself. Both empty when there
  // is nothing to undo.
  readonly preNormalizeText: string;
  readonly normalizedText: string;
  readonly chunkingEnabled: boolean;
  // 2 to 5. Off is the job of chunkingEnabled, so this never drops to 1.
  readonly chunkSize: number;
  readonly chunkMode: ChunkMode;
  // 15 to 60 characters, used in adaptive mode.
  readonly chunkCharTarget: number;
  readonly bookmarks: readonly Bookmark[];
  readonly speakerCustom: SpeakerCustom;
}

// Everything in Transcript that has a default. A new transcript is these
// values, with the id, title and space filled in, and then the defaults
// from Settings laid over the top.
export const TRANSCRIPT_DEFAULTS: Omit<Transcript, 'id' | 'title' | 'space'> = {
  rawText: '',
  wpm: 300,
  position: 0,
  fontColor: '#FFFFFF',
  highlightColor: '#E74C3C',
  backgroundColor: '#1E1E1E',
  fontSize: 32,
  isPaused: false,
  draftText: '',
  isStopped: false,
  fontColorIsDefault: true,
  highlightColorIsDefault: true,
  backgroundColorIsDefault: true,
  timesRead: 0,
  totalWordsRead: 0,
  totalTimeSpentSeconds: 0,
  preNormalizeText: '',
  normalizedText: '',
  chunkingEnabled: false,
  chunkSize: 2,
  chunkMode: 'fixed',
  chunkCharTarget: 30,
  bookmarks: [],
  speakerCustom: null,
};

export const BOOKMARK_DEFAULTS: Omit<Bookmark, 'index'> = {
  snippet: '',
  createdAt: '',
  label: '',
};

// The name of the Space that always exists.
export const DEFAULT_SPACE = 'General';

// All the transcripts and Spaces: what the desktop app keeps in data.json.
export interface Library {
  // The id the next new transcript gets.
  readonly nextId: number;
  // Which entry of `spaces` is selected.
  readonly currentSpaceIndex: number;
  // Never empty. The first one is DEFAULT_SPACE on a new install.
  readonly spaces: readonly string[];
  // Every transcript, across all Spaces.
  readonly transcripts: readonly Transcript[];
}

export const EMPTY_LIBRARY: Library = {
  nextId: 1,
  currentSpaceIndex: 0,
  spaces: [DEFAULT_SPACE],
  transcripts: [],
};

// The app-wide settings: what the desktop app keeps in settings.json, less
// the ones that only mean something for a desktop window (its size and
// place, the sidebar and band sizes, free resizing and the data folder).
//
// This is the shape only. The default values and the allowed ranges come
// in phase 3, from settings_store.py, with fixtures.
export interface Settings {
  // What a new transcript starts with.
  readonly defaultWpm: number;
  readonly defaultFontColor: string;
  readonly defaultHighlightColor: string;
  readonly defaultBackgroundColor: string;
  readonly defaultFontSize: number;
  readonly defaultChunkingEnabled: boolean;
  readonly defaultChunkSize: number;
  readonly defaultChunkMode: ChunkMode;
  readonly defaultChunkCharTarget: number;
  // Pixels the plus and minus buttons change the word size by.
  readonly fontSizeStep: number;

  // How reading behaves, for every transcript.
  readonly skipWordCount: number;
  readonly pauseOnSkip: boolean;
  readonly lengthPacingEnabled: boolean;
  readonly warmUpEnabled: boolean;
  readonly resumeRewindEnabled: boolean;
  readonly resumeRewindWords: number;
  readonly scrubPauseEnabled: boolean;
  readonly peripheralContextEnabled: boolean;
  readonly splitLongParagraphsEnabled: boolean;

  // How the reader looks.
  readonly appearanceMode: 'light' | 'dark' | 'system';
  // Positive moves the focus letter up, negative down.
  readonly highlightOffsetPx: number;
  readonly guideMarkHorizontalEnabled: boolean;
  readonly guideMarkThicknessPx: number;
  readonly guideMarkLengthPercent: number;
  readonly guideMarkColor: string;
  readonly guideMarkColorIsDefault: boolean;
  readonly dyslexiaFontEnabled: boolean;
  // 0 is Off, then Small, Medium and Large.
  readonly letterSpacingLevel: number;
  readonly boldStartsEnabled: boolean;

  // Speaker cues.
  readonly speakerCuesEnabled: boolean;
  readonly speakerCueSound: 'off' | 'change' | 'per_speaker';
  readonly speakerCueStyle: 'bell' | 'soft' | 'glass' | 'wood';
  readonly speakerCueNameTagEnabled: boolean;
  readonly speakerCueTagPosition: 'above' | 'top_right';
  readonly speakerCueFlashEnabled: boolean;

  // Picking up where you left off.
  readonly reopenLastTranscript: boolean;
  readonly lastTranscriptId: number | null;
  readonly transcriptSort:
    'title_az' | 'title_za' | 'newest' | 'oldest' | 'most_read' | 'most_time';

  // Saved reading profiles. Their shape is settled in phase 6, from
  // core/profiles.py. Until then they are carried along untouched.
  readonly profiles: readonly unknown[];
}
