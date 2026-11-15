// A clock and a tab that a test moves by hand, so tests of the reading
// loop do not wait for real time and never depend on a timer being on time.

import type { Clock, PageVisibility, TimerHandle } from '../engine/contract';

interface PendingTimer {
  readonly handle: TimerHandle;
  readonly at: number;
  readonly callback: () => void;
}

export class FakeClock implements Clock {
  private time = 0;
  private nextHandle = 1;
  private timers: PendingTimer[] = [];

  now(): number {
    return this.time;
  }

  setTimer(callback: () => void, delayMs: number): TimerHandle {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.timers.push({ handle, at: this.time + Math.max(0, delayMs), callback });
    return handle;
  }

  clearTimer(handle: TimerHandle): void {
    this.timers = this.timers.filter((timer) => timer.handle !== handle);
  }

  /** How many timers are waiting. The loop should never hold more than one. */
  get pending(): number {
    return this.timers.length;
  }

  /** How long until the next timer is due, or null when none is waiting. */
  get nextDelay(): number | null {
    const next = this.earliest();
    return next === null ? null : next.at - this.time;
  }

  /** Moves time on, firing every timer that comes due, each exactly on time. */
  advance(ms: number): void {
    const end = this.time + ms;
    for (;;) {
      const next = this.earliest();
      if (next === null || next.at > end) break;
      this.time = next.at;
      this.clearTimer(next.handle);
      next.callback();
    }
    this.time = end;
  }

  /**
   * Moves time on without firing anything, then fires the one timer that
   * is overdue. This is a timer that came late: the page was busy, or the
   * machine slept.
   */
  advanceLate(ms: number): void {
    this.time += ms;
    const next = this.earliest();
    if (next !== null && next.at <= this.time) {
      this.clearTimer(next.handle);
      next.callback();
    }
  }

  private earliest(): PendingTimer | null {
    let best: PendingTimer | null = null;
    for (const timer of this.timers) {
      if (best === null || timer.at < best.at) best = timer;
    }
    return best;
  }
}

export class FakeVisibility implements PageVisibility {
  private hidden = false;
  private readonly listeners = new Set<() => void>();

  isHidden(): boolean {
    return this.hidden;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** How many are listening. Zero after the engine is disposed. */
  get listenerCount(): number {
    return this.listeners.size;
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    for (const listener of [...this.listeners]) listener();
  }
}
