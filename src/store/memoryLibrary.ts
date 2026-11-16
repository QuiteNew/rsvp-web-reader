// A library that lives in memory only. It is gone when the page reloads.
//
// This is a stand-in, so the sidebar can be built and tried before saving
// exists. It covers only the part of LibraryStore the page uses today. In
// phase 3 it is replaced by the real store: the rules move to src/core as
// pure functions with golden fixtures, and the data is kept in the browser.
//
// The rules here were read from the desktop app's core/transcript_store.py.
// They are tested, but not yet proven against the Python with fixtures. One
// known gap: names are trimmed with JavaScript's trim(), which does not
// strip exactly the same characters as Python's strip().

import { EMPTY_LIBRARY, TRANSCRIPT_DEFAULTS, type Library, type Transcript } from '../core/models';
import type { LibraryStore, NewTranscript } from './contract';

export type LibraryShell = Pick<
  LibraryStore,
  | 'subscribe'
  | 'getSnapshot'
  | 'addSpace'
  | 'switchToSpace'
  | 'renameSpace'
  | 'deleteSpace'
  | 'addTranscript'
  | 'deleteTranscript'
  | 'setTitle'
  | 'setText'
  | 'setPosition'
  | 'setWpm'
>;

export function currentSpace(library: Library): string {
  return library.spaces[library.currentSpaceIndex] ?? library.spaces[0] ?? '';
}

export class MemoryLibraryStore implements LibraryShell {
  private library: Library;
  private readonly listeners = new Set<() => void>();

  constructor(start: Library = EMPTY_LIBRARY) {
    this.library = start;
  }

  // Arrow functions, so React can be handed them as they are.
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Library => this.library;

  addSpace(name: string): string {
    const cleaned = name.trim();
    if (cleaned !== '' && !this.library.spaces.includes(cleaned)) {
      const spaces = [...this.library.spaces, cleaned];
      this.change({ spaces, currentSpaceIndex: spaces.length - 1 });
    }
    return currentSpace(this.library);
  }

  switchToSpace(name: string): string {
    const index = this.library.spaces.indexOf(name);
    if (index !== -1 && index !== this.library.currentSpaceIndex) {
      this.change({ currentSpaceIndex: index });
    }
    return currentSpace(this.library);
  }

  renameSpace(oldName: string, newName: string): boolean {
    const cleaned = newName.trim();
    const { spaces } = this.library;
    if (!spaces.includes(oldName)) return false;
    if (cleaned === '' || cleaned === oldName || spaces.includes(cleaned)) return false;
    this.change({
      spaces: spaces.map((space) => (space === oldName ? cleaned : space)),
      // The Space's transcripts move along with its new name.
      transcripts: this.library.transcripts.map((transcript) =>
        transcript.space === oldName ? { ...transcript, space: cleaned } : transcript,
      ),
    });
    return true;
  }

  deleteSpace(name: string): boolean {
    const { spaces, transcripts } = this.library;
    if (!spaces.includes(name) || spaces.length <= 1) return false;
    // Only an empty Space can go. Its transcripts are never deleted with it.
    if (transcripts.some((transcript) => transcript.space === name)) return false;
    const current = currentSpace(this.library);
    const remaining = spaces.filter((space) => space !== name);
    // If the current Space was the one deleted, the first one becomes
    // current. Otherwise the current Space stays current.
    const index = current === name ? 0 : remaining.indexOf(current);
    this.change({ spaces: remaining, currentSpaceIndex: index });
    return true;
  }

  addTranscript(given: NewTranscript): Transcript {
    const transcript: Transcript = { ...TRANSCRIPT_DEFAULTS, ...given, id: this.library.nextId };
    this.change({
      nextId: this.library.nextId + 1,
      transcripts: [...this.library.transcripts, transcript],
    });
    return transcript;
  }

  deleteTranscript(id: number): void {
    if (!this.has(id)) return;
    this.change({
      transcripts: this.library.transcripts.filter((transcript) => transcript.id !== id),
    });
  }

  setTitle(id: number, title: string): void {
    this.update(id, { title });
  }

  setText(id: number, rawText: string): void {
    this.update(id, { rawText });
  }

  setPosition(id: number, position: number): void {
    this.update(id, { position });
  }

  setWpm(id: number, wpm: number): void {
    this.update(id, { wpm });
  }

  private has(id: number): boolean {
    return this.library.transcripts.some((transcript) => transcript.id === id);
  }

  // A method given an id that does not exist does nothing.
  // Neither does one that would change nothing, so nobody is told to draw
  // the same thing again.
  private update(id: number, changes: Partial<Transcript>): void {
    const now = this.library.transcripts.find((transcript) => transcript.id === id);
    if (now === undefined) return;
    const keys = Object.keys(changes) as (keyof Transcript)[];
    if (keys.every((key) => now[key] === changes[key])) return;
    this.change({
      transcripts: this.library.transcripts.map((transcript) =>
        transcript.id === id ? { ...transcript, ...changes } : transcript,
      ),
    });
  }

  // Every change makes a new Library object, so React sees it.
  private change(changes: Partial<Library>): void {
    this.library = { ...this.library, ...changes };
    for (const listener of [...this.listeners]) listener();
  }
}
