// The reading loop. It owns a ReaderSession, a clock and one timer, and it
// decides when the next word shows.
//
// The behaviour is the loop in the desktop app's
// gui/components/reader_display.py, without anything that draws. Two things
// are added for the browser, where a timer is only about on time and a
// hidden tab slows timers down: the loop corrects for a late timer, and it
// holds while the tab is hidden.

import { pyRound, pyStrip } from '../core/pythonText';
import { assembleChunkText, type ReaderSession } from '../core/reader';
import type { ChunkMode } from '../core/models';
import type {
  BookmarkTarget,
  Clock,
  EngineBehaviour,
  PageVisibility,
  ReaderEngine,
  ReaderEngineOptions,
  ReaderEvents,
  ReaderSnapshot,
  ReaderStatus,
  TimerHandle,
} from './contract';

const DEFAULT_BEHAVIOUR: EngineBehaviour = {
  resumeRewindWords: 0,
  scrubPauseEnabled: true,
};

// How many words each side of the current one go into a bookmark's snippet.
const SNIPPET_WORDS_EACH_SIDE = 3;

const EMPTY_SNAPSHOT: ReaderSnapshot = {
  status: 'empty',
  index: 0,
  totalWords: 0,
  chunk: null,
  chunkBounds: null,
  speaker: null,
  remainingMs: 0,
  percent: 0,
  wpm: 0,
  isScrubbing: false,
  isHeldForHiddenTab: false,
};

export class ReaderLoop implements ReaderEngine {
  private readonly clock: Clock;
  private readonly visibility: PageVisibility;
  private readonly events: ReaderEvents;
  private readonly stopWatchingVisibility: () => void;
  private readonly listeners = new Set<() => void>();
  private behaviour: EngineBehaviour;

  private session: ReaderSession | null = null;
  private isPaused = false;
  private isScrubbing = false;
  private scrubWasPlaying = false;

  private timer: TimerHandle | null = null;
  // When the word on screen is due to end, on the clock.
  private dueAt = 0;

  // What this session has added up to since it was last reported.
  private wordsRead = 0;
  private activeMs = 0;
  // When the open stretch of reading time began, or null between them.
  private activeSince: number | null = null;

  private snapshot: ReaderSnapshot = EMPTY_SNAPSHOT;

  constructor(options: ReaderEngineOptions) {
    this.clock = options.clock;
    this.visibility = options.visibility;
    this.events = options.events ?? {};
    this.behaviour = { ...DEFAULT_BEHAVIOUR, ...options.behaviour };
    this.stopWatchingVisibility = this.visibility.subscribe(() => {
      this.handleVisibilityChanged();
    });
  }

  // Arrow functions, so React can be handed them as they are.
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ReaderSnapshot => this.snapshot;

  load(session: ReaderSession, startPaused = false): void {
    this.finalizeSession();
    this.cancelTimer();
    this.session = session;
    this.isPaused = startPaused;
    this.isScrubbing = false;
    this.wordsRead = 0;
    this.activeMs = 0;
    this.activeSince = null;
    this.scheduleFromNow();
    this.changed();
  }

  unload(): void {
    this.finalizeSession();
    this.cancelTimer();
    this.session = null;
    this.isPaused = false;
    this.isScrubbing = false;
    this.changed();
  }

  finalizeSession(): void {
    if (this.session === null) return;
    this.closeActiveSpan();
    this.events.onSessionStats?.({
      wordsRead: this.wordsRead,
      activeSeconds: this.activeMs / 1000,
    });
    this.wordsRead = 0;
    this.activeMs = 0;
    // If reading is still going, time counts again from here, so nothing
    // that was reported is ever reported twice.
    this.syncActiveSpan();
  }

  dispose(): void {
    this.cancelTimer();
    this.stopWatchingVisibility();
    this.listeners.clear();
  }

  togglePause(): void {
    const session = this.session;
    if (session === null || session.isFinished) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.cancelTimer();
    } else {
      // Resuming. With rewind on, step back a few words first, so reading
      // picks up with a little of what came before. The position is
      // reported, so what is saved is where reading really went on from.
      if (this.behaviour.resumeRewindWords > 0) {
        session.seek(-this.behaviour.resumeRewindWords);
        this.reportPosition();
      }
      this.scheduleFromNow();
    }
    this.changed();
  }

  restart(): void {
    const session = this.session;
    if (session === null) return;
    this.cancelTimer();
    session.reset();
    // Restart always leaves reading going, whatever it was doing before.
    this.isPaused = false;
    this.reportPosition();
    this.scheduleFromNow();
    this.changed();
  }

  skip(delta: number, forcePause = false): void {
    const session = this.session;
    if (session === null) return;
    this.cancelTimer();
    session.seek(delta);
    this.reportPosition();
    if (forcePause) this.isPaused = true;
    this.scheduleFromNow();
    this.changed();
  }

  scrubMove(index: number): void {
    const session = this.session;
    if (session === null) return;
    if (!this.isScrubbing) {
      // The first move of a drag remembers whether reading was going, and
      // holds it for the whole drag.
      this.isScrubbing = true;
      this.scrubWasPlaying = !this.isPaused;
      this.isPaused = true;
    }
    this.cancelTimer();
    session.seekTo(index);
    this.reportPosition();
    this.changed();
  }

  scrubEnd(): void {
    const session = this.session;
    if (session === null || !this.isScrubbing) return;
    this.isScrubbing = false;
    const staysPaused =
      this.behaviour.scrubPauseEnabled || !this.scrubWasPlaying || session.isFinished;
    this.isPaused = staysPaused;
    this.scheduleFromNow();
    this.changed();
  }

  jumpTo(index: number): void {
    const session = this.session;
    if (session === null) return;
    this.cancelTimer();
    this.isPaused = true;
    session.seekTo(index);
    this.reportPosition();
    this.changed();
  }

  bookmarkTarget(): BookmarkTarget | null {
    const session = this.session;
    if (session === null || session.isFinished) return null;
    const context = session.peripheralContext(SNIPPET_WORDS_EACH_SIDE, SNIPPET_WORDS_EACH_SIDE);
    const words = [...context.before, context.current ?? '', ...context.after];
    return { index: session.index, snippet: pyStrip(words.join(' ')) };
  }

  // A new speed or pacing choice starts with the next word. The word on
  // screen keeps the time it was given, as on the desktop.
  setWpm(wpm: number): void {
    if (this.session === null) return;
    this.session.setWpm(wpm);
    this.changed();
  }

  setLengthPacingEnabled(enabled: boolean): void {
    if (this.session === null) return;
    this.session.setLengthPacingEnabled(enabled);
    this.changed();
  }

  setWarmUpEnabled(enabled: boolean): void {
    if (this.session === null) return;
    this.session.setWarmUpEnabled(enabled);
    this.changed();
  }

  setChunking(enabled: boolean, size: number, mode?: ChunkMode, charTarget?: number): void {
    if (this.session === null) return;
    this.session.setChunking(enabled, size, mode ?? null, charTarget ?? null);
    this.regrouped();
  }

  setSpeakerCues(enabled: boolean, custom: ReadonlyMap<string, string> | null = null): void {
    if (this.session === null) return;
    this.session.setSpeakerCues(enabled, custom);
    this.regrouped();
  }

  setBehaviour(behaviour: Partial<EngineBehaviour>): void {
    // Read at the next resume or the next scrub release. Nothing on screen
    // changes now.
    this.behaviour = { ...this.behaviour, ...behaviour };
  }

  // The session grouped its words again and may have moved the index to the
  // start of a chunk. The chunk on screen is a different one now, so while
  // reading is going it gets its own full time.
  private regrouped(): void {
    this.reportPosition();
    if (this.isRunning() && !this.isScrubbing) {
      this.cancelTimer();
      this.scheduleFromNow();
    }
    this.changed();
  }

  private isRunning(): boolean {
    return this.session !== null && !this.session.isFinished && !this.isPaused;
  }

  // Running, but the tab is hidden, so the clock is stopped.
  private isHeld(): boolean {
    return this.isRunning() && this.visibility.isHidden();
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clock.clearTimer(this.timer);
      this.timer = null;
    }
  }

  // Gives the chunk on screen its full time, counted from now.
  private scheduleFromNow(): void {
    this.cancelTimer();
    const session = this.session;
    if (session === null || !this.isRunning() || this.isHeld()) return;
    const delay = session.currentChunkDelayMs();
    this.dueAt = this.clock.now() + delay;
    this.timer = this.clock.setTimer(this.handleTimer, delay);
  }

  // Sets the timer for the chunk that follows one that just ended.
  //
  // A timer is never on time, only about on time. So the new chunk's time
  // is counted from when the last one should have ended, not from when the
  // timer got round to firing. A late timer then does not push every word
  // after it later. If the loop is so far behind that the new chunk should
  // be over already (the machine slept, the page was busy), it does not
  // race through what was missed. It starts again from now.
  private scheduleFollowing(): void {
    const session = this.session;
    if (session === null || !this.isRunning() || this.isHeld()) return;
    const delay = session.currentChunkDelayMs();
    const now = this.clock.now();
    let due = this.dueAt + delay;
    if (due <= now) due = now + delay;
    this.dueAt = due;
    this.timer = this.clock.setTimer(this.handleTimer, due - now);
  }

  private handleTimer = (): void => {
    this.timer = null;
    const session = this.session;
    if (session === null || !this.isRunning() || this.isHeld()) return;
    // advance() steps a whole chunk. Count the words passed, the move of
    // the index, so the stats stay in words.
    const before = session.index;
    session.advance();
    this.wordsRead += session.index - before;
    this.reportPosition();
    // Only reading on into a new speaker's turn cues it. A turn always
    // starts a chunk, so the chunk just stepped onto is where to look.
    if (session.speakerTurns.isTurnStart(session.index)) {
      const speaker = session.currentSpeaker;
      if (speaker !== null) this.events.onNewSpeaker?.(speaker);
    }
    this.scheduleFollowing();
    this.changed();
  };

  private handleVisibilityChanged(): void {
    if (this.session === null) return;
    if (this.visibility.isHidden()) {
      this.cancelTimer();
    } else if (this.timer === null) {
      // Back in view. The word on screen gets its full time again. This is
      // not a resume from a pause, so resume rewind does not apply.
      this.scheduleFromNow();
    }
    this.changed();
  }

  private reportPosition(): void {
    if (this.session !== null) this.events.onPositionChanged?.(this.session.index);
  }

  // Reading time counts only while words are advancing in a tab that can
  // be seen: not while paused, not after the last word, not while hidden.
  private syncActiveSpan(): void {
    const shouldCount = this.isRunning() && !this.isHeld();
    if (shouldCount && this.activeSince === null) {
      this.activeSince = this.clock.now();
    } else if (!shouldCount) {
      this.closeActiveSpan();
    }
  }

  private closeActiveSpan(): void {
    if (this.activeSince !== null) {
      this.activeMs += this.clock.now() - this.activeSince;
      this.activeSince = null;
    }
  }

  // Call after anything changed: brings the reading time up to date, makes
  // a new snapshot and tells the listeners.
  private changed(): void {
    this.syncActiveSpan();
    this.snapshot = this.buildSnapshot();
    for (const listener of [...this.listeners]) listener();
  }

  private status(): ReaderStatus {
    if (this.session === null) return 'empty';
    if (this.session.isFinished) return 'finished';
    return this.isPaused ? 'paused' : 'playing';
  }

  private buildSnapshot(): ReaderSnapshot {
    const session = this.session;
    if (session === null) return EMPTY_SNAPSHOT;
    const chunk = session.currentChunk();
    const total = session.totalWords;
    const percent = total > 0 ? pyRound((100 * session.index) / total) : 0;
    return {
      status: this.status(),
      index: session.index,
      totalWords: total,
      chunk: chunk === null ? null : assembleChunkText(chunk),
      chunkBounds: session.currentChunkBounds(),
      speaker: session.currentSpeaker,
      remainingMs: session.remainingMs(),
      percent: Math.max(0, Math.min(100, percent)),
      wpm: session.wpm,
      isScrubbing: this.isScrubbing,
      isHeldForHiddenTab: this.isHeld(),
    };
  }
}
