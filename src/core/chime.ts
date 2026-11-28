// Port of core/chime.py: the chime speaker cues play when the speaker
// changes. What each chime sounds like, which pattern of notes each speaker
// gets, and how close together two chimes may be.
//
// Everything here is pure. chimeSamples() works out the samples of one chime
// and never plays anything. The desktop wraps the same samples in a WAV file
// for winsound (chime_wav); the web puts them into an AudioBuffer instead, so
// only the samples are ported, not the file around them. The player that
// plays them lives in src/ui.
//
// The sound is made here rather than shipped as a recording, so there is no
// licence to check and every pitch is just a number. Every note rises over a
// few milliseconds, fades away on its own, and ends exactly at silence, so it
// never clicks.
//
// Speakers are told apart by the shape of their chime as well as its pitch:
// one note, two going up, two going down, one higher note, three going up.

import { pyRound } from './pythonText';
import { UNNAMED_SPEAKER } from './speakers';

export const SAMPLE_RATE = 44100;

// How loud a chime's loudest moment is, as a share of the loudest a sample
// can be. The desktop picked it by ear, because winsound has no volume
// control. The web keeps it, so the two sound the same.
export const CHIME_VOLUME = 0.25;

/** The time from one note of a pattern to the next. */
export const NOTE_STEP_MS = 120;

/** The notes of one chime, in Hz, in the order they play. */
export type ChimeNotes = readonly number[];

// C, E, G and C an octave up, with the A below them for the change chime.
// All from one scale (C major pentatonic), so they sound fine together.
const A4 = 440.0;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

/**
 * The pattern each speaker gets, in order of first appearance. A sixth
 * speaker starts again from the first.
 */
export const SPEAKER_PATTERNS: readonly ChimeNotes[] = Object.freeze([
  Object.freeze([C5]), // one note
  Object.freeze([C5, G5]), // two notes going up
  Object.freeze([G5, C5]), // two notes going down
  Object.freeze([C6]), // one note, an octave higher
  Object.freeze([C5, E5, G5]), // three notes going up
]);

/**
 * The pattern for "one chime for any change", and for a ">>" change (no name,
 * so no pattern of its own) when each speaker has one. A single note below
 * all the speakers' notes, so it does not sound like any of them.
 */
export const CHANGE_PATTERN: ChimeNotes = Object.freeze([A4]);

/**
 * The shortest time between the starts of two chimes. At a high speed with
 * fast back-and-forth, a chime at every change would be constant noise, so a
 * change that comes sooner stays silent. The visual cue still shows it.
 */
export const MIN_CHIME_GAP_MS = 400;

/**
 * How one style sounds. Each partial is [multiple of the note's pitch,
 * strength, how much faster than the main tone it dies away], so the higher
 * ones fade first, the way a real bell's do. decayMs is how quickly the note
 * dies away, attackMs how long it takes to rise, noteMs how long each note
 * lasts in all.
 */
export interface ChimeStyle {
  readonly partials: readonly (readonly [multiple: number, strength: number, speed: number])[];
  readonly decayMs: number;
  readonly attackMs: number;
  readonly noteMs: number;
}

/**
 * The styles, in the order the speaker cues window lists them. The first is
 * the default. Their names are what the settings store.
 */
export const CHIME_STYLES = ['bell', 'soft', 'glass', 'wood'] as const;

export type ChimeStyleName = (typeof CHIME_STYLES)[number];

// A Map, so a name such as "constructor" is never found by accident, as it
// would be on a plain object.
export const STYLES: ReadonlyMap<string, ChimeStyle> = new Map<ChimeStyleName, ChimeStyle>([
  // A small bell: a sine with a quieter octave and a faint third harmonic.
  [
    'bell',
    {
      partials: [
        [1, 1.0, 1.0],
        [2, 0.25, 2.0],
        [3, 0.08, 3.0],
      ],
      decayMs: 110,
      attackMs: 8,
      noteMs: 450,
    },
  ],
  // A plain, rounded tone: just the sine, rising slowly.
  ['soft', { partials: [[1, 1.0, 1.0]], decayMs: 150, attackMs: 15, noteMs: 500 }],
  // Glass: brighter, with partials that are not whole multiples, and rings
  // a little longer.
  [
    'glass',
    {
      partials: [
        [1, 1.0, 1.0],
        [2.76, 0.2, 1.4],
        [5.4, 0.06, 2.0],
      ],
      decayMs: 220,
      attackMs: 6,
      noteMs: 700,
    },
  ],
  // Wood: a short knock, like a marimba, gone almost at once.
  [
    'wood',
    {
      partials: [
        [1, 1.0, 1.0],
        [4, 0.35, 3.0],
        [10, 0.05, 6.0],
      ],
      decayMs: 55,
      attackMs: 2,
      noteMs: 300,
    },
  ],
]);

/** The last stretch of every note, taken down to exact silence. */
export const END_FADE_MS = 40;

/** The loudest a 16-bit sample can be. */
export const FULL_SCALE = 32767;

function styleNamed(style: string): ChimeStyle | undefined {
  return STYLES.get(style);
}

/**
 * How long a chime of these notes lasts in this style, from the start of the
 * first note to the end of the last one. An unknown style throws a plain
 * Error, where Python raises KeyError.
 */
export function chimeLengthMs(notes: ChimeNotes, style: string = CHIME_STYLES[0]): number {
  const sound = styleNamed(style);
  if (sound === undefined) throw new Error(`There is no chime style called ${style}.`);
  return sound.noteMs + NOTE_STEP_MS * (notes.length - 1);
}

/**
 * The samples of one chime, as chime_wav() puts them in its WAV file (mono,
 * 16-bit, SAMPLE_RATE): these notes, NOTE_STEP_MS apart, in this style. The
 * loudest sample is exactly volume times FULL_SCALE, so it never clips, and a
 * volume of 0 gives silence. The same arguments always give the same samples.
 *
 * Throws a RangeError (Python's ValueError) for an unknown style, no notes, a
 * volume outside 0 to 1, or a note that is not above 0 or whose highest
 * partial in this style would be at or above half the sample rate.
 *
 * The maths is the desktop's line for line, in the same order, so the
 * rounding comes out the same. An Int16Array also turns a -0 into 0.
 */
export function chimeSamples(
  notes: ChimeNotes,
  style: string = CHIME_STYLES[0],
  volume: number = CHIME_VOLUME,
): Int16Array {
  const sound = styleNamed(style);
  if (sound === undefined) throw new RangeError(`There is no chime style called ${style}.`);
  if (notes.length === 0) throw new RangeError('A chime needs at least one note.');
  // Written so that NaN is refused too, as Python's chained comparison does.
  if (!(volume >= 0 && volume <= 1)) {
    throw new RangeError(`A chime's volume must be between 0 and 1, not ${volume}.`);
  }
  const highestMultiple = Math.max(...sound.partials.map(([multiple]) => multiple));
  for (const note of notes) {
    const top = note * highestMultiple;
    if (!(top > 0 && top < SAMPLE_RATE / 2)) {
      throw new RangeError(`A ${style} chime can't hold a note of ${note} Hz.`);
    }
  }

  const total = pyRound((SAMPLE_RATE * chimeLengthMs(notes, style)) / 1000);
  const noteLength = pyRound((SAMPLE_RATE * sound.noteMs) / 1000);
  const step = pyRound((SAMPLE_RATE * NOTE_STEP_MS) / 1000);
  const attack = Math.max(1, pyRound((SAMPLE_RATE * sound.attackMs) / 1000));
  const endFade = Math.max(1, pyRound((SAMPLE_RATE * END_FADE_MS) / 1000));
  const decaySeconds = sound.decayMs / 1000;

  const raw = new Float64Array(total);
  notes.forEach((note, index) => {
    const start = index * step;
    const count = Math.min(noteLength, total - start);
    for (let n = 0; n < count; n++) {
      const t = n / SAMPLE_RATE;
      let value = 0.0;
      for (const [multiple, strength, speed] of sound.partials) {
        value +=
          strength *
          Math.exp((-t * speed) / decaySeconds) *
          Math.sin(2 * Math.PI * note * multiple * t);
      }
      // The rise at the start of the note, a half cosine from 0 to 1.
      if (n < attack) value *= 0.5 - 0.5 * Math.cos((Math.PI * n) / attack);
      // The note's last stretch, straight down to exact silence.
      const left = noteLength - 1 - n;
      if (left < endFade) value *= left / endFade;
      raw[start + n]! += value;
    }
  });

  // The loudest sample is set to a whole number first, then everything is
  // scaled to it, so the peak lands on it exactly. Every style's notes last
  // hundreds of milliseconds, so there is always a peak to scale by.
  let peak = 0;
  for (const value of raw) peak = Math.max(peak, Math.abs(value));
  const scale = pyRound(volume * FULL_SCALE) / peak;
  const samples = new Int16Array(total);
  for (let i = 0; i < total; i++) samples[i] = pyRound(raw[i]! * scale);
  return samples;
}

/**
 * The pattern each speaker gets, from SPEAKER_PATTERNS in order of first
 * appearance (pass the speakers of a session's turns, in reading order). A
 * ">>" change has no name, so it gets no pattern here; chimeNotes() gives it
 * the change chime. After the last pattern it starts again from the first.
 */
export function speakerPatterns(speakers: Iterable<string>): Map<string, ChimeNotes> {
  const patterns = new Map<string, ChimeNotes>();
  for (const speaker of speakers) {
    if (speaker === UNNAMED_SPEAKER || patterns.has(speaker)) continue;
    patterns.set(speaker, SPEAKER_PATTERNS[patterns.size % SPEAKER_PATTERNS.length]!);
  }
  return patterns;
}

/**
 * Which notes to play for a change to this speaker, given the sound setting
 * (one of SPEAKER_CUE_SOUNDS in settings.ts) and the patterns from
 * speakerPatterns(), or null for no chime at all.
 *
 * "change" plays the change chime for everyone. "per_speaker" plays each
 * speaker's own pattern, and the change chime for a speaker without one (a
 * ">>" change). "off", or anything else, plays nothing.
 */
export function chimeNotes(
  sound: unknown,
  speaker: string | null,
  patterns: ReadonlyMap<string, ChimeNotes>,
): ChimeNotes | null {
  if (sound === 'change') return CHANGE_PATTERN;
  if (sound === 'per_speaker') {
    return (speaker === null ? undefined : patterns.get(speaker)) ?? CHANGE_PATTERN;
  }
  return null;
}

/**
 * Keeps chimes from piling up or cutting each other off. The player asks
 * allow() with the current time (in milliseconds, from a clock that only goes
 * forward) and the length of the chime it wants to play. A chime is refused
 * while the last one that played is still sounding, and within minGapMs of
 * its start even if it was shorter. A refused chime does not count, so the
 * wait is always measured from the last chime that actually played. A clock
 * that went backwards lets the next chime through rather than silencing them.
 */
export class ChimeGap {
  readonly minGapMs: number;
  private lastMs: number | null = null;
  private holdMs = 0;

  constructor(minGapMs: number = MIN_CHIME_GAP_MS) {
    this.minGapMs = minGapMs;
  }

  allow(nowMs: number, lengthMs = 0): boolean {
    if (this.lastMs !== null) {
      const since = nowMs - this.lastMs;
      if (since >= 0 && since < this.holdMs) return false;
    }
    this.lastMs = nowMs;
    this.holdMs = Math.max(this.minGapMs, lengthMs);
    return true;
  }
}
