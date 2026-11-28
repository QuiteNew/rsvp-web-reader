// Plays the speaker cue chimes that src/core/chime.ts makes. The web side of
// the desktop's gui/chime_player.py.
//
// On the desktop, winsound plays WAV files written into a temporary folder.
// A browser plays samples straight from memory through Web Audio, so there
// are no files here: the samples of each chime are kept in a Map instead.
//
// Making a chime takes a few milliseconds (measured at 3 to 15 ms each in
// Node), and all six of a style up to about 55 ms. That is too long to do at
// the moment a new speaker starts without holding up the word on screen. So,
// as on the desktop, prepare() makes the chimes of a style ahead of time, one
// chime per task so the page never stalls, and play() only plays a chime that
// is ready. One that is not ready is skipped, never waited for: a missed
// chime is better than a stuck reader. play(..., true) is for the Listen
// button, where the person has just asked to hear it and a short wait is
// fine.
//
// A browser lets a page make sound only after a click or a key press on it.
// unlock() has to be called from such an event. Until then nothing plays.
//
// Nothing here ever throws. A browser without Web Audio, a sound device that
// fails, or a chime that cannot be made all mean the chime is silent, never
// that reading stops.

import {
  CHANGE_PATTERN,
  SAMPLE_RATE,
  SPEAKER_PATTERNS,
  chimeSamples,
  type ChimeNotes,
} from '../core/chime';
import { pyRound } from '../core/pythonText';

/** What actually makes the sound. The desktop's WinsoundBackend, for the web. */
export interface ChimeBackend {
  /** Let sound start. Call it from a click or a key press. */
  unlock(): void;
  /** Whether a chime started now would be heard now, and not later. */
  readonly canPlayNow: boolean;
  /** Start playing these samples and return at once. A chime already playing is stopped. */
  play(samples: Float32Array<ArrayBuffer>, sampleRate: number): void;
  /** Stop whatever is playing. */
  stop(): void;
  /** Stop, and give the sound device back. */
  close(): void;
}

/** The parts of an AudioContext the backend uses, so a test can hand in its own. */
export interface ChimeAudioContext {
  readonly state: string;
  readonly destination: AudioNode;
  resume(): Promise<void>;
  close(): Promise<void>;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
}

/** The context's methods a buffer needs, so an OfflineAudioContext works too. */
type BufferMaker = Pick<BaseAudioContext, 'createBuffer'>;

/** A mono buffer holding these samples at this rate. */
export function chimeBuffer(
  context: BufferMaker,
  samples: Float32Array<ArrayBuffer>,
  sampleRate: number,
): AudioBuffer {
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

/**
 * The samples of a chime as Web Audio wants them, from -1 to 1. A 16-bit
 * sample divided by 32768 is exact in a 32-bit float, so the sound is the
 * desktop's sample for sample.
 */
export function chimeFloats(notes: ChimeNotes, style: string): Float32Array<ArrayBuffer> {
  const whole = chimeSamples(notes, style);
  const floats = new Float32Array(whole.length);
  whole.forEach((value, index) => {
    floats[index] = value / 32768;
  });
  return floats;
}

/** Web Audio. The context is made the first time unlock() is called. */
export class WebAudioBackend implements ChimeBackend {
  private context: ChimeAudioContext | null = null;
  private playing: AudioBufferSourceNode | null = null;
  // A resume() asked for by a click and not finished yet. A chime started in
  // that moment plays as soon as it finishes, a few milliseconds later.
  private resuming = false;
  private closed = false;

  private readonly makeContext: () => ChimeAudioContext;

  constructor(makeContext: () => ChimeAudioContext = () => new AudioContext()) {
    this.makeContext = makeContext;
  }

  unlock(): void {
    if (this.closed) return;
    try {
      this.context ??= this.makeContext();
      if (this.context.state !== 'running') {
        this.resuming = true;
        this.context.resume().then(
          () => (this.resuming = false),
          () => (this.resuming = false),
        );
      }
    } catch {
      // No sound device, or a browser that refused. The chimes stay silent.
    }
  }

  get canPlayNow(): boolean {
    // A context that is suspended (never unlocked, or suspended by the
    // browser) would keep a chime and play it whenever it starts again, long
    // after the speaker changed. So only "running", or a resume on its way.
    return this.context !== null && (this.context.state === 'running' || this.resuming);
  }

  play(samples: Float32Array<ArrayBuffer>, sampleRate: number): void {
    const context = this.context;
    if (context === null) return;
    const source = context.createBufferSource();
    source.buffer = chimeBuffer(context, samples, sampleRate);
    source.connect(context.destination);
    this.stop();
    this.playing = source;
    source.onended = () => {
      if (this.playing === source) this.playing = null;
    };
    source.start();
  }

  stop(): void {
    const source = this.playing;
    this.playing = null;
    if (source === null) return;
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stop();
    const context = this.context;
    this.context = null;
    if (context !== null) context.close().catch(() => undefined);
  }
}

/** The backend for this browser, or null where there is no Web Audio. */
export function defaultBackend(): ChimeBackend | null {
  return typeof AudioContext === 'function' ? new WebAudioBackend() : null;
}

/** The key a chime is kept under: its style and its notes in hundredths of a hertz. */
export function chimeKey(notes: ChimeNotes, style: string): string {
  return [style, ...notes.map((note) => String(pyRound(note * 100)))].join('-');
}

/** Runs a task later, on its own. A test hands in one it runs by hand. */
export type Scheduler = (task: () => void) => void;

const later: Scheduler = (task) => {
  setTimeout(task, 0);
};

/** Makes the chimes when they are needed, and plays them. */
export class ChimePlayer {
  private readonly ready = new Map<string, Float32Array<ArrayBuffer>>();
  private readonly waiting: [ChimeNotes, string][] = [];
  private working = false;
  private closed = false;

  private readonly backend: ChimeBackend | null;
  private readonly schedule: Scheduler;

  constructor(backend: ChimeBackend | null = defaultBackend(), schedule: Scheduler = later) {
    this.backend = backend;
    this.schedule = schedule;
  }

  /** Whether this browser can play the chimes at all. */
  get available(): boolean {
    return this.backend !== null && !this.closed;
  }

  /** Let sound start. Call it from a click or a key press. */
  unlock(): void {
    if (!this.available) return;
    try {
      this.backend?.unlock();
    } catch {
      // Silence, not an error.
    }
  }

  /**
   * Start making every chime of this style (each speaker's pattern and the
   * change chime), one per task, so they are ready by the time reading
   * reaches a new speaker. Chimes already made or on their way are left as
   * they are.
   */
  prepare(style: string): void {
    if (!this.available) return;
    for (const notes of [...SPEAKER_PATTERNS, CHANGE_PATTERN]) {
      const key = chimeKey(notes, style);
      const queued = this.waiting.some(([n, s]) => chimeKey(n, s) === key);
      if (!this.ready.has(key) && !queued) this.waiting.push([notes, style]);
    }
    this.workOn();
  }

  /** Whether this chime has been made. */
  isReady(notes: ChimeNotes, style: string): boolean {
    return this.ready.has(chimeKey(notes, style));
  }

  /**
   * Play this chime. True if it started playing. If it has not been made
   * yet, reading (wait false) skips it and starts making this style for next
   * time, while the Listen button (wait true) makes it there and then. False
   * whenever nothing could be played, never an error.
   */
  play(notes: ChimeNotes, style: string, wait = false): boolean {
    if (!this.available || this.backend === null) return false;
    let samples = this.ready.get(chimeKey(notes, style));
    if (samples === undefined) {
      if (!wait) {
        this.prepare(style);
        return false;
      }
      samples = this.make(notes, style);
      if (samples === undefined) return false;
    }
    try {
      if (!this.backend.canPlayNow) return false;
      this.backend.play(samples, SAMPLE_RATE);
    } catch {
      // A sound device that failed. Silence, not an error.
      return false;
    }
    return true;
  }

  /** Stop any chime and give the sound device back. Safe to call twice; nothing plays afterwards. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.backend?.close();
    } catch {
      // Closing goes on whatever the device does.
    }
  }

  private make(notes: ChimeNotes, style: string): Float32Array<ArrayBuffer> | undefined {
    try {
      const samples = chimeFloats(notes, style);
      this.ready.set(chimeKey(notes, style), samples);
      return samples;
    } catch {
      // An unknown style or a note out of range: no chime.
      return undefined;
    }
  }

  private workOn(): void {
    if (this.working || this.waiting.length === 0) return;
    this.working = true;
    this.schedule(() => {
      this.working = false;
      const next = this.waiting.shift();
      if (next === undefined || this.closed) return;
      const [notes, style] = next;
      if (!this.isReady(notes, style)) this.make(notes, style);
      this.workOn();
    });
  }
}
