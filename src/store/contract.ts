// What the store promises to the UI.
//
// The store keeps the library (transcripts and Spaces) and the settings in
// the browser, and gives them back on the next visit. The UI reads a
// snapshot and calls the methods here. It never touches IndexedDB or
// localStorage itself.
//
// This file is types only. The implementation comes in phase 3. The rules
// in the comments are taken from the desktop app's core/transcript_store.py,
// core/storage.py, core/settings_store.py and core/data_bundle.py.
//
// The split to keep in phase 3: the rules for changing a library (what
// renaming a Space does to its transcripts, where a new bookmark goes) are
// pure, so they belong in src/core and get golden fixtures. This layer only
// holds the current value, saves it and loads it.

import type { Library, Settings, SpeakerCustom, Transcript } from '../core/models';
import type { SavedSettings } from '../core/savedShapes';

// Where a value is kept. One for the library, one for the settings. The
// rest of the store is written against this, so tests can use one that
// lives in memory.
export interface Persistence<T> {
  read(): Promise<ReadResult<T>>;
  write(value: T): Promise<void>;
}

// 'ok'       the saved value, checked and cleaned.
// 'missing'  nothing was saved yet. Start from the defaults.
// 'damaged'  something was saved but could not be read. It has been copied
//            aside under keptAs before anything is written over it, and
//            the app tells the person once.
export type ReadResult<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'missing' }
  | { readonly kind: 'damaged'; readonly keptAs: string | null };

// What a new transcript is given. The UI passes the new-transcript
// defaults from Settings here. Anything left out gets the value in
// TRANSCRIPT_DEFAULTS.
export type NewTranscript = Pick<Transcript, 'title' | 'space'> &
  Partial<
    Pick<
      Transcript,
      | 'wpm'
      | 'fontColor'
      | 'highlightColor'
      | 'backgroundColor'
      | 'fontSize'
      | 'chunkingEnabled'
      | 'chunkSize'
      | 'chunkMode'
      | 'chunkCharTarget'
    >
  >;

export interface ChunkingChoice {
  readonly enabled: boolean;
  readonly size: number;
  readonly mode: Transcript['chunkMode'];
  readonly charTarget: number;
}

// The transcripts and Spaces.
//
// Every method changes the value in memory at once, so the next
// getSnapshot() already shows it, and then saves in the background. Only
// setPosition() and setWpm() save on a throttle (at most once a second),
// because they are called for every word. flush() writes whatever is still
// waiting.
export interface LibraryStore {
  // For useSyncExternalStore. The snapshot is a new object after every
  // change and the same object until then.
  subscribe(listener: () => void): () => void;
  getSnapshot(): Library;
  // Set when the saved library could not be read at start. The app shows a
  // notice once and then calls clearDamagedNotice().
  damagedNotice(): string | null;
  clearDamagedNotice(): void;
  // Writes anything still waiting. Call when a session ends and when the
  // page is being hidden or closed.
  flush(): Promise<void>;

  // Spaces are known by their name alone.
  //
  // Adds a Space and switches to it. The name is trimmed. An empty name or
  // one already taken changes nothing. Returns the current Space's name
  // afterwards, either way.
  addSpace(name: string): string;
  // Does nothing for a name that does not exist. Returns the current
  // Space's name afterwards.
  switchToSpace(name: string): string;
  // Renames a Space and moves its transcripts along. Refused, with false,
  // when the old name does not exist, or the new name is empty, the same,
  // or taken.
  renameSpace(oldName: string, newName: string): boolean;
  // Deletes a Space only when it has no transcripts and is not the last
  // one. false when refused. If it was the current Space, the first one
  // becomes current.
  deleteSpace(name: string): boolean;

  // Transcripts. A method given an id that does not exist does nothing.
  addTranscript(transcript: NewTranscript): Transcript;
  deleteTranscript(id: number): void;
  setTitle(id: number, title: string): void;
  setSpace(id: number, space: string): void;
  setText(id: number, rawText: string): void;
  setDraftText(id: number, draftText: string): void;
  setPosition(id: number, position: number): void;
  setWpm(id: number, wpm: number): void;
  setPaused(id: number, isPaused: boolean): void;
  setStopped(id: number, isStopped: boolean): void;
  setFontColor(id: number, color: string): void;
  setHighlightColor(id: number, color: string): void;
  setBackgroundColor(id: number, color: string): void;
  setFontSize(id: number, fontSize: number): void;
  setChunking(id: number, choice: ChunkingChoice): void;
  setSpeakers(id: number, custom: SpeakerCustom): void;
  setNormalization(id: number, preNormalizeText: string, normalizedText: string): void;
  // Gives the theme's colours to every transcript whose colours still
  // follow the theme. Called when Light or Dark changes.
  resyncDefaultReadingColors(
    fontColor: string,
    highlightColor: string,
    backgroundColor: string,
  ): void;

  // Bookmarks. One per word index, kept sorted by index.
  addBookmark(id: number, index: number, snippet: string): void;
  removeBookmark(id: number, index: number): void;
  setBookmarkLabel(id: number, index: number, label: string): void;

  // Adds one finished session to the transcript's totals. The words and
  // the time are always added. It counts as a time read only from 3
  // seconds of reading up.
  addSessionStats(id: number, wordsRead: number, activeSeconds: number): void;

  // Used by a bundle import. replaceAll throws the current library away.
  // mergeAll adds the bundle's Spaces that are not here yet, and all its
  // transcripts with new ids, and leaves the current Space alone.
  replaceAll(library: Library): void;
  mergeAll(library: Library): void;
}

// The app-wide settings. A value outside its range is pulled back into it
// before it is saved. On the desktop the Settings window does that, not the
// store. Here it is withChanges() in src/core/settings.ts.
//
// They are kept in localStorage, which answers at once, so every change is
// written before the method returns and there is nothing to flush.
export interface SettingsStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Settings;
  // The settings in the desktop's shape, for an export file.
  saved(): SavedSettings;
  damagedNotice(): string | null;
  clearDamagedNotice(): void;
  // Why the last save did not work, or null.
  saveProblem(): string | null;

  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  // Several at once, as one change and one save.
  update(changes: Partial<Settings>): void;
  // A guide mark colour picked by hand. It stops following the theme.
  setGuideMarkColor(color: string): void;
  // Used by a bundle import in Replace mode. Takes the "settings" part of
  // the file as it is. Profiles already here are kept when the file has none.
  replaceFromBundle(settings: SavedSettings): void;
}

// An export file, or a file being imported. On disk it has the desktop
// app's shape: { bundle_format, data, settings }, with snake_case names.
// Reading and writing that shape is pure and lives in src/core.
export interface Bundle {
  readonly library: Library;
  // null when the file's settings could not be used. The library is still
  // imported.
  readonly settings: Settings | null;
}

export type BundleReadResult =
  | { readonly kind: 'ok'; readonly bundle: Bundle }
  // message is written for the person and is shown as it is.
  | { readonly kind: 'error'; readonly message: string };

// 'replace' throws away what is stored and takes the bundle's library and
// settings. 'expand' adds the bundle's library and leaves the settings.
export type ImportMode = 'replace' | 'expand';

export interface BundleService {
  // The text of an export file for what is stored now.
  exportText(): string;
  readText(text: string): BundleReadResult;
  apply(bundle: Bundle, mode: ImportMode): void;
}

// Whether the browser promised not to clear this site's data on its own.
// 'unsupported' when the browser has no way to ask.
export type PersistenceGrant = 'granted' | 'denied' | 'unsupported';

export interface StorageHealth {
  // Asks the browser to keep the data. Safe to call more than once.
  requestPersistence(): Promise<PersistenceGrant>;
}
