// The library the page shows, kept current and saved. It holds one Library
// value, changes it through the pure rules in src/core/library.ts, tells
// its listeners, and writes it to a Persistence.
//
// When it saves, as on the desktop: at once after every change, except the
// reading position and the speed, which change many times a second and are
// written at most once a second. Unlike the desktop, a held-back change is
// also written when that second is up, without waiting for the next
// change, because a browser tab can be closed with no warning.
import * as rules from '../core/library';
import { EMPTY_LIBRARY, type Library, type SpeakerCustom, type Transcript } from '../core/models';
import { LIVE_SAVE_INTERVAL_SECONDS } from '../core/storageFormat';
import type { ChunkingChoice, LibraryStore, NewTranscript, Persistence } from './contract';

/** Where the store gets the time and its one timer from. Tests pass their own. */
export interface StoreClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const browserClock: StoreClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

const LIVE_SAVE_INTERVAL_MS = LIVE_SAVE_INTERVAL_SECONDS * 1000;

/**
 * The time now the way the desktop writes a bookmark's created_at: UTC, as
 * Python's isoformat() gives it, like 2026-11-16T15:26:01.123000+00:00.
 */
export function pythonUtcNow(date: Date = new Date()): string {
  return date.toISOString().replace('Z', '000+00:00');
}

export class SavedLibraryStore implements LibraryStore {
  private library: Library = EMPTY_LIBRARY;
  private ready = false;
  private loading: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  private notice: string | null = null;
  private problem: string | null = null;

  // Saving. `unsaved` is true while the library in memory is newer than
  // what was last handed to the persistence.
  private unsaved = false;
  private lastLiveSave = -Infinity;
  private timer: unknown = null;
  private queued: Library | null = null;
  private writing: Promise<void> | null = null;

  private readonly persistence: Persistence<Library>;
  private readonly clock: StoreClock;

  constructor(persistence: Persistence<Library>, clock: StoreClock = browserClock) {
    this.persistence = persistence;
    this.clock = clock;
  }

  /** A store that is ready at once, holding this library. For tests. */
  static ready(
    persistence: Persistence<Library>,
    library: Library = EMPTY_LIBRARY,
    clock?: StoreClock,
  ): SavedLibraryStore {
    const store = new SavedLibraryStore(persistence, clock);
    store.library = library;
    store.ready = true;
    return store;
  }

  /**
   * Read what was saved. Safe to call more than once: the reading happens
   * one time. Until it is done the store holds an empty library and
   * isReady() is false, and the page should not let anything be changed.
   */
  load(): Promise<void> {
    this.loading ??= this.readSaved();
    return this.loading;
  }

  private async readSaved(): Promise<void> {
    try {
      const result = await this.persistence.read();
      if (result.kind === 'ok') {
        // The same tidying an import gets: a library with no Spaces gets
        // the default one, and the open Space stays inside the list.
        this.library = rules.replaceAll(result.value);
      } else if (result.kind === 'damaged') {
        this.notice =
          'The saved library could not be read, so the app started empty. ' +
          (result.keptAs === null
            ? 'A copy of it could not be kept.'
            : `What was there is kept in this browser as "${result.keptAs}".`);
      }
    } catch {
      this.problem =
        'This browser is not letting the app save here. ' +
        'You can use it, but everything is gone when the page closes.';
    }
    this.ready = true;
    this.tell();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Library => this.library;

  isReady = (): boolean => this.ready;

  damagedNotice = (): string | null => this.notice;

  clearDamagedNotice(): void {
    if (this.notice === null) return;
    this.notice = null;
    this.tell();
  }

  /** Why the last save did not work, or null. Cleared by the next save that does. */
  saveProblem = (): string | null => this.problem;

  /**
   * Write anything not yet written, and wait until every write is done.
   * Call it when a reading session ends and when the page is hidden.
   */
  flush(): Promise<void> {
    if (this.unsaved) this.saveNow();
    return this.writing ?? Promise.resolve();
  }

  // ---- Spaces ----

  addSpace(name: string): string {
    this.apply(rules.addSpace(this.library, name));
    return rules.currentSpace(this.library);
  }

  switchToSpace(name: string): string {
    this.apply(rules.switchToSpace(this.library, name));
    return rules.currentSpace(this.library);
  }

  renameSpace(oldName: string, newName: string): boolean {
    return this.apply(rules.renameSpace(this.library, oldName, newName));
  }

  deleteSpace(name: string): boolean {
    return this.apply(rules.deleteSpace(this.library, name));
  }

  // ---- Transcripts ----

  addTranscript({ title, space, ...fields }: NewTranscript): Transcript {
    this.apply(rules.addTranscript(this.library, title, space, fields));
    return this.library.transcripts.at(-1) as Transcript;
  }

  deleteTranscript(id: number): void {
    this.apply(rules.deleteTranscript(this.library, id));
  }

  setTitle(id: number, title: string): void {
    this.apply(rules.setTitle(this.library, id, title));
  }

  setSpace(id: number, space: string): void {
    this.apply(rules.setSpace(this.library, id, space));
  }

  setText(id: number, rawText: string): void {
    this.apply(rules.setText(this.library, id, rawText));
  }

  setDraftText(id: number, draftText: string): void {
    this.apply(rules.setDraftText(this.library, id, draftText));
  }

  setPosition(id: number, position: number): void {
    this.apply(rules.setPosition(this.library, id, position), 'live');
  }

  setWpm(id: number, wpm: number): void {
    this.apply(rules.setWpm(this.library, id, wpm), 'live');
  }

  setPaused(id: number, isPaused: boolean): void {
    this.apply(rules.setPaused(this.library, id, isPaused));
  }

  setStopped(id: number, isStopped: boolean): void {
    this.apply(rules.setStopped(this.library, id, isStopped));
  }

  setFontColor(id: number, color: string): void {
    this.apply(rules.setFontColor(this.library, id, color));
  }

  setHighlightColor(id: number, color: string): void {
    this.apply(rules.setHighlightColor(this.library, id, color));
  }

  setBackgroundColor(id: number, color: string): void {
    this.apply(rules.setBackgroundColor(this.library, id, color));
  }

  setFontSize(id: number, fontSize: number): void {
    this.apply(rules.setFontSize(this.library, id, fontSize));
  }

  setChunking(id: number, choice: ChunkingChoice): void {
    this.apply(
      rules.setChunking(
        this.library,
        id,
        choice.enabled,
        choice.size,
        choice.mode,
        choice.charTarget,
      ),
    );
  }

  setSpeakers(id: number, custom: SpeakerCustom): void {
    this.apply(rules.setSpeakers(this.library, id, custom));
  }

  setNormalization(id: number, preNormalizeText: string, normalizedText: string): void {
    this.apply(rules.setNormalization(this.library, id, preNormalizeText, normalizedText));
  }

  resyncDefaultReadingColors(
    fontColor: string,
    highlightColor: string,
    backgroundColor: string,
  ): void {
    this.apply(
      rules.resyncDefaultReadingColors(this.library, fontColor, highlightColor, backgroundColor),
    );
  }

  // ---- Bookmarks ----

  addBookmark(id: number, index: number, snippet: string): void {
    const now = pythonUtcNow(new Date(this.clock.now()));
    this.apply(rules.addBookmark(this.library, id, index, snippet, now));
  }

  removeBookmark(id: number, index: number): void {
    this.apply(rules.removeBookmark(this.library, id, index));
  }

  setBookmarkLabel(id: number, index: number, label: string): void {
    this.apply(rules.setBookmarkLabel(this.library, id, index, label));
  }

  // ---- Reading totals ----

  addSessionStats(id: number, wordsRead: number, activeSeconds: number): void {
    this.apply(rules.addSessionStats(this.library, id, wordsRead, activeSeconds));
  }

  // ---- Importing ----

  replaceAll(library: Library): void {
    this.apply(rules.replaceAll(library));
  }

  mergeAll(library: Library): void {
    this.apply(rules.mergeAll(this.library, library));
  }

  // ---- Inside ----

  /**
   * Take the library a rule gave back. If it is the one we had, nothing
   * happened. Otherwise keep it, tell the listeners and save: at once, or
   * for a 'live' change at most once a second. Says whether it changed.
   */
  private apply(next: Library, pace: 'now' | 'live' = 'now'): boolean {
    if (next === this.library || !this.ready) return false;
    this.library = next;
    this.unsaved = true;
    this.tell();
    if (pace === 'now') {
      this.saveNow();
    } else {
      this.saveSoon();
    }
    return true;
  }

  private saveSoon(): void {
    const wait = this.lastLiveSave + LIVE_SAVE_INTERVAL_MS - this.clock.now();
    if (wait <= 0) {
      this.lastLiveSave = this.clock.now();
      this.saveNow();
    } else if (this.timer === null) {
      this.timer = this.clock.setTimeout(() => {
        this.timer = null;
        this.lastLiveSave = this.clock.now();
        if (this.unsaved) this.saveNow();
      }, wait);
    }
  }

  private saveNow(): void {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
    this.unsaved = false;
    // Only the newest library is worth writing. If a write is under way,
    // this one waits its turn and replaces any other that was waiting.
    this.queued = this.library;
    this.writing ??= this.writeQueued();
  }

  private async writeQueued(): Promise<void> {
    while (this.queued !== null) {
      const library = this.queued;
      this.queued = null;
      let problem: string | null = null;
      try {
        await this.persistence.write(library);
      } catch {
        problem =
          'The last change could not be saved in this browser. ' +
          'Export your data from Settings to keep a copy.';
      }
      if (problem !== this.problem) {
        this.problem = problem;
        this.tell();
      }
    }
    this.writing = null;
  }

  private tell(): void {
    for (const listener of this.listeners) listener();
  }
}
