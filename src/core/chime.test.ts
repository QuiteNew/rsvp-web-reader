import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture, type FixtureCase } from '../testing/fixtures';
import {
  CHANGE_PATTERN,
  CHIME_STYLES,
  CHIME_VOLUME,
  ChimeGap,
  END_FADE_MS,
  FULL_SCALE,
  MIN_CHIME_GAP_MS,
  NOTE_STEP_MS,
  SAMPLE_RATE,
  SPEAKER_PATTERNS,
  STYLES,
  chimeLengthMs,
  chimeNotes,
  chimeSamples,
  speakerPatterns,
  type ChimeNotes,
} from './chime';

const fixture = loadFixture('chime');

// The fixture keeps these about each chime, as the generator's
// chime_samples() works them out from the desktop's WAV file.
const START_SAMPLES = 64;
const SPACING = 997;

function littleEndianBytes(samples: Int16Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((value, index) => view.setInt16(index * 2, value, true));
  return bytes;
}

function summary(samples: Int16Array) {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  return {
    frames: samples.length,
    peak,
    sha256: createHash('sha256').update(littleEndianBytes(samples)).digest('hex'),
    start: Array.from(samples.subarray(0, START_SAMPLES)),
    spaced: Array.from(samples).filter((_, index) => index % SPACING === 0),
  };
}

const asPairs = (patterns: ReadonlyMap<string, ChimeNotes>) =>
  [...patterns].map(([name, notes]) => [name, [...notes]]);

describe('against the Python fixtures', () => {
  test('the constants', () => {
    expectToMatchFixture(fixture, 'sample_rate', () => SAMPLE_RATE);
    expectToMatchFixture(fixture, 'chime_volume', () => CHIME_VOLUME);
    expectToMatchFixture(fixture, 'note_step_ms', () => NOTE_STEP_MS);
    expectToMatchFixture(fixture, 'speaker_patterns_table', () =>
      SPEAKER_PATTERNS.map((notes) => [...notes]),
    );
    expectToMatchFixture(fixture, 'change_pattern', () => [...CHANGE_PATTERN]);
    expectToMatchFixture(fixture, 'min_chime_gap_ms', () => MIN_CHIME_GAP_MS);
    expectToMatchFixture(fixture, 'chime_styles', () => [...CHIME_STYLES]);
    expectToMatchFixture(fixture, 'end_fade_ms', () => END_FADE_MS);
    expectToMatchFixture(fixture, 'full_scale', () => FULL_SCALE);
  });

  test('the style table, in the order of CHIME_STYLES', () => {
    expectToMatchFixture(fixture, 'styles', () =>
      [...STYLES].map(([name, style]) => [
        name,
        [
          style.partials.map((partial) => [...partial]),
          style.decayMs,
          style.attackMs,
          style.noteMs,
        ],
      ]),
    );
  });

  // Python raises KeyError for an unknown style here, which is not a
  // ValueError, so the port throws a plain Error and not a RangeError. Those
  // cases are checked on their own below.
  const lengthCases = fixture.functions.chime_length_ms ?? [];
  const raisesKeyError = (entry: FixtureCase) => entry.length === 3 && entry[2] === 'KeyError';

  test('chime_length_ms', () => {
    const plain = {
      ...fixture,
      functions: { chime_length_ms: lengthCases.filter((entry) => !raisesKeyError(entry)) },
    };
    expectToMatchFixture(plain, 'chime_length_ms', ([notes, style]) =>
      chimeLengthMs(notes as number[], style as string | undefined),
    );
  });

  test('chime_length_ms with an unknown style', () => {
    const unknown = lengthCases.filter(raisesKeyError);
    expect(unknown.length).toBeGreaterThan(0);
    for (const [[notes, style]] of unknown) {
      const run = () => chimeLengthMs(notes as number[], style as string);
      expect(run).toThrow(Error);
      expect(run).not.toThrow(RangeError);
    }
  });

  test('chime_wav, sample for sample', () => {
    expectToMatchFixture(fixture, 'chime_wav', (args) =>
      summary(chimeSamples(...(args as [number[], string?, number?]))),
    );
  });

  test('speaker_patterns, in order', () => {
    expectToMatchFixture(fixture, 'speaker_patterns', ([speakers]) =>
      asPairs(speakerPatterns(speakers as string[])),
    );
  });

  test('chime_notes', () => {
    expectToMatchFixture(fixture, 'chime_notes', ([sound, speaker, pairs]) => {
      const patterns = new Map(pairs as [string, number[]][]);
      const notes = chimeNotes(sound, speaker as string | null, patterns);
      return notes === null ? null : [...notes];
    });
  });

  test('ChimeGap', () => {
    expectToMatchFixture(fixture, 'chime_gap', ([minGap, steps]) => {
      const gap = minGap === null ? new ChimeGap() : new ChimeGap(minGap as number);
      return (steps as [number, number?][]).map((step) => gap.allow(...step));
    });
  });
});

describe('what the fixtures cannot hold', () => {
  test('a volume that is not a number is refused, as Python refuses NaN', () => {
    expect(() => chimeSamples([523.25], 'bell', Number.NaN)).toThrow(RangeError);
    expect(() => chimeSamples([Number.NaN], 'bell')).toThrow(RangeError);
  });

  test('a volume of 0 gives samples of 0, never -0', () => {
    const samples = chimeSamples([523.25], 'bell', 0);
    expect(Array.from(samples).some((value) => Object.is(value, -0))).toBe(false);
    expect(samples.every((value) => value === 0)).toBe(true);
  });

  test('a style name that a plain object would have is not a style', () => {
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(() => chimeSamples([523.25], name)).toThrow(RangeError);
      expect(() => chimeLengthMs([523.25], name)).toThrow(Error);
    }
  });

  test('a speaker named like an object key gets a pattern of its own', () => {
    const patterns = speakerPatterns(['constructor', '__proto__']);
    expect(asPairs(patterns)).toEqual([
      ['constructor', [523.25]],
      ['__proto__', [523.25, 783.99]],
    ]);
    expect(chimeNotes('per_speaker', 'toString', patterns)).toEqual([440]);
  });

  test('the tables cannot be changed by accident', () => {
    expect(Object.isFrozen(SPEAKER_PATTERNS)).toBe(true);
    expect(SPEAKER_PATTERNS.every((notes) => Object.isFrozen(notes))).toBe(true);
    expect(Object.isFrozen(CHANGE_PATTERN)).toBe(true);
  });
});
