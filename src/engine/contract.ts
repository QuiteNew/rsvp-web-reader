// What the engine promises to the UI.
//
// The engine is the reading loop. It owns a ReaderSession from core, a
// clock and one timer, and it decides when the next word shows. The UI
// never advances the session itself. It calls the methods here and draws
// whatever the snapshot says.
//
// This file is types only. The class that implements them is ReaderLoop in
// src/engine/readerEngine.ts. The rules written in the comments are taken
// from the desktop app's gui/components/reader_display.py, which is the
// reference for how the loop behaves.

import type { ChunkMode } from '../core/models';
import type { ChunkRange, ChunkText, PeripheralContext, ReaderSession } from '../core/reader';

// The engine never calls setTimeout or performance.now() itself. It gets
// them through this, so a test can hand in a clock it moves by hand.
export interface Clock {
  // Milliseconds from a fixed start that never jumps backwards. In the
  // browser this is performance.now().
  now(): number;
  // Calls back once, after about delayMs. Never trust it to be on time.
  setTimer(callback: () => void, delayMs: number): TimerHandle;
  clearTimer(handle: TimerHandle): void;
}

export type TimerHandle = number;

// Tells the engine when the tab is hidden, so it can stop the clock. In
// the browser this wraps document.visibilityState.
export interface PageVisibility {
  isHidden(): boolean;
  // Returns a function that stops the listening.
  subscribe(listener: () => void): () => void;
}

// 'empty'     no session is loaded.
// 'playing'   words are advancing.
// 'paused'    a session is loaded and waiting.
// 'finished'  the index is past the last word. Restart or a seek leaves it.
export type ReaderStatus = 'empty' | 'playing' | 'paused' | 'finished';

// Everything the screen needs to draw one moment of reading.
//
// A snapshot never changes. Every change makes a new one, and getSnapshot()
// returns the very same object until then. React's useSyncExternalStore
// needs exactly that to know when to draw again.
export interface ReaderSnapshot {
  readonly status: ReaderStatus;
  // The word index reading is at. Equal to totalWords once finished.
  readonly index: number;
  readonly totalWords: number;
  // The text to flash, split around the focus letter. With chunking off it
  // is one word. null when empty or finished.
  readonly chunk: ChunkText | null;
  // The first word of the chunk and one past its last. null with chunk.
  readonly chunkBounds: ChunkRange | null;
  // The speaker of the current word, when speaker cues are on and the
  // transcript has speakers. Otherwise null.
  readonly speaker: string | null;
  // The words around the chunk, for the surrounding-words line: some before
  // it, its first word, and some after it. Only built when the line is
  // switched on (setPeripheralContext). null when it is off, when empty and
  // when finished.
  readonly context: PeripheralContext | null;
  // Estimated time left at the current speed, in milliseconds.
  readonly remainingMs: number;
  // How far through, 0 to 100, rounded the way Python rounds. 100 once
  // finished, 0 for an empty transcript.
  readonly percent: number;
  readonly wpm: number;
  // True between the first scrubMove() and the scrubEnd() after it.
  readonly isScrubbing: boolean;
  // True while the tab is hidden and the engine is holding a session that
  // was playing. It goes on by itself when the tab is shown again.
  readonly isHeldForHiddenTab: boolean;
}

// What one reading session added up to. Handed to onSessionStats, and from
// there to the store, which adds it to the transcript's totals.
export interface SessionStats {
  // Words the reader moved through on its own. Skips and scrubs do not
  // count.
  readonly wordsRead: number;
  // Time spent playing, in seconds. Paused time, time after the last word
  // and time in a hidden tab do not count.
  readonly activeSeconds: number;
}

// Things that happen once, which the UI or the store may want to react to.
// A snapshot says how things are. These say that something just happened.
export interface ReaderEvents {
  // The index moved, for any reason. The store saves it.
  onPositionChanged?(index: number): void;
  // A session ended: stopped, replaced, or the page is closing. Called at
  // most once per stretch of reading, never with numbers already reported.
  onSessionStats?(stats: SessionStats): void;
  // Reading moved on its own into a new speaker's turn. A skip or a scrub
  // that lands on one does not fire this. The UI plays the chime and the
  // flash from here.
  onNewSpeaker?(speaker: string): void;
}

// Settings the engine itself acts on. They are not part of the session.
export interface EngineBehaviour {
  // On resume, step back this many words first. 0 means off.
  readonly resumeRewindWords: number;
  // After a scrub, stay paused on the word it landed on. When false,
  // reading goes on if it was playing before the scrub.
  readonly scrubPauseEnabled: boolean;
}

export interface ReaderEngineOptions {
  readonly clock: Clock;
  readonly visibility: PageVisibility;
  readonly events?: ReaderEvents;
  readonly behaviour?: Partial<EngineBehaviour>;
}

// A word index and a short piece of the text around it, for a new bookmark.
export interface BookmarkTarget {
  readonly index: number;
  readonly snippet: string;
}

export interface ReaderEngine {
  // The two functions useSyncExternalStore wants. subscribe() returns a
  // function that stops the listening.
  subscribe(listener: () => void): () => void;
  getSnapshot(): ReaderSnapshot;

  // Takes over a session and shows its current word. Any session already
  // loaded is ended first, and its stats reported. Starts playing unless
  // startPaused is true.
  load(session: ReaderSession, startPaused?: boolean): void;
  // Ends the session, reports its stats and goes back to 'empty'.
  unload(): void;
  // Reports the stats gathered so far without ending the session, then
  // starts counting from zero. For when the page is closing mid-read.
  // Safe to call with nothing loaded.
  finalizeSession(): void;
  // Stops the timer and all listening. The engine is not used after this.
  dispose(): void;

  // Does nothing when empty or finished. On resume with rewind on, steps
  // back first and reports the new position.
  togglePause(): void;
  // Back to the first word, and always playing afterwards, whatever the
  // state was.
  restart(): void;
  // Moves by words (or by chunks worth of words, the session decides) and
  // keeps the play state, unless forcePause is true.
  skip(delta: number, forcePause?: boolean): void;
  // A drag on the progress bar. Holds reading for the whole drag. Call as
  // often as the thumb moves.
  scrubMove(index: number): void;
  // The drag ended. Stays paused if scrubPauseEnabled is on, if reading
  // was paused before the drag, or if it landed past the end. Does
  // nothing without a scrubMove() before it.
  scrubEnd(): void;
  // Goes to a word and lands paused. Bookmarks use this.
  jumpTo(index: number): void;
  // null when there is no live word: empty or finished.
  bookmarkTarget(): BookmarkTarget | null;

  // Changes that reach into the session. Each one makes a new snapshot.
  // A new speed or pacing choice starts with the next word, and the word
  // on screen keeps the time it was given. A change to chunking or speaker
  // cues groups the words again, so the chunk on screen gets its full time
  // from now.
  setWpm(wpm: number): void;
  setLengthPacingEnabled(enabled: boolean): void;
  setWarmUpEnabled(enabled: boolean): void;
  setChunking(enabled: boolean, size: number, mode?: ChunkMode, charTarget?: number): void;
  setSpeakerCues(enabled: boolean, custom?: ReadonlyMap<string, string> | null): void;
  setBehaviour(behaviour: Partial<EngineBehaviour>): void;
  // Turns the surrounding-words line on or off and says how many words go
  // on each side. Counts below 0 are taken as 0. It works with no session
  // loaded and is kept for the next one.
  setPeripheralContext(enabled: boolean, before?: number, after?: number): void;
}
