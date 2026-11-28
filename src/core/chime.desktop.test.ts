// The desktop project's own tests for core/chime.py, ported one by one, each
// under its Python name, from tests/test_chime.py. The fixtures in
// chime.test.ts prove the port against Python's real output. These are the
// second check, and they keep the reason behind each number.
//
// What a chime sounds like can only be judged by ear. These tests check what
// can be measured: the right length, as loud as asked and never louder,
// silent at both ends so it does not click, the notes at the right pitches
// and times, and fading away.
//
// The desktop's chime_wav() returns a WAV file and its tests read the samples
// back out of it. The port returns the samples, so where a test checked the
// file (mono, 16-bit, 44100 Hz) it checks the Int16Array and the sample rate.
import { describe, expect, test } from 'vitest';
import {
  CHANGE_PATTERN,
  CHIME_STYLES,
  CHIME_VOLUME,
  ChimeGap,
  MIN_CHIME_GAP_MS,
  NOTE_STEP_MS,
  SAMPLE_RATE,
  SPEAKER_PATTERNS,
  chimeLengthMs,
  chimeNotes,
  chimeSamples,
  speakerPatterns,
  type ChimeNotes,
} from './chime';
import { pyRound } from './pythonText';
import { SPEAKER_CUE_SOUNDS } from './settings';
import { UNNAMED_SPEAKER } from './speakers';

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const A4 = 440.0;

const samplesOf = chimeSamples;

/** How strongly a pitch is present (one bin of a Fourier transform). */
function strengthAt(samples: ArrayLike<number>, frequencyHz: number): number {
  let real = 0.0;
  let imaginary = 0.0;
  const step = (2 * Math.PI * frequencyHz) / SAMPLE_RATE;
  for (let n = 0; n < samples.length; n++) {
    const value = samples[n]!;
    real += value * Math.cos(step * n);
    imaginary += value * Math.sin(step * n);
  }
  return Math.hypot(real, imaginary);
}

function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0.0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / samples.length);
}

const ms = (milliseconds: number) => pyRound((SAMPLE_RATE * milliseconds) / 1000);

function loudest(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]!));
  return peak;
}

// Two chimes are the same sound when every sample is the same.
const asKey = (samples: Int16Array) => Array.from(samples).join(',');

describe('test_chime.py', () => {
  // ---- The values the chimes are made with ----

  test('the_tuning_values', () => {
    // Pinned as plain numbers, so a change to any of them shows up here.
    expect(SAMPLE_RATE).toBe(44100);
    expect(CHIME_VOLUME).toBe(0.25);
    expect(NOTE_STEP_MS).toBe(120);
    expect(MIN_CHIME_GAP_MS).toBe(400);
    expect(CHIME_STYLES).toEqual(['bell', 'soft', 'glass', 'wood']);
  });

  test('the_speaker_patterns', () => {
    expect(SPEAKER_PATTERNS).toEqual([
      [523.25], // one note
      [523.25, 783.99], // two going up
      [783.99, 523.25], // two going down
      [1046.5], // one higher note
      [523.25, 659.25, 783.99], // three going up
    ]);
    expect(CHANGE_PATTERN).toEqual([440.0]);
  });

  test('every_speaker_pattern_is_different_and_none_is_the_change_chime', () => {
    const keys = SPEAKER_PATTERNS.map((pattern) => pattern.join(','));
    expect(new Set(keys).size).toBe(5);
    expect(keys).not.toContain(CHANGE_PATTERN.join(','));
  });

  test('the_change_chime_is_lower_than_every_speaker_note', () => {
    expect(
      SPEAKER_PATTERNS.every((pattern) => pattern.every((note) => CHANGE_PATTERN[0]! < note)),
    ).toBe(true);
  });

  test.each([
    ['bell', 450],
    ['soft', 500],
    ['glass', 700],
    ['wood', 300],
  ])('how_long_a_chime_lasts[%s]', (style, noteMs) => {
    expect(chimeLengthMs([C5], style)).toBe(noteMs);
    expect(chimeLengthMs([C5, G5], style)).toBe(noteMs + 120);
    expect(chimeLengthMs([C5, E5, G5], style)).toBe(noteMs + 240);
  });

  test('the_default_style_is_bell', () => {
    expect(chimeLengthMs([C5])).toBe(450);
    expect(chimeSamples([C5])).toEqual(chimeSamples([C5], 'bell'));
  });

  // ---- The sound ----

  const shortPatterns: ChimeNotes[] = [[C5], [C5, G5], [C5, E5, G5]];
  const styleAndNotes = CHIME_STYLES.flatMap((style) =>
    shortPatterns.map((notes) => [style, notes] as const),
  );

  test.each(styleAndNotes)(
    'it_is_a_mono_sixteen_bit_wav_of_the_right_length[%s-%j]',
    (style, notes) => {
      const samples = chimeSamples(notes, style);
      expect(samples).toBeInstanceOf(Int16Array);
      expect(SAMPLE_RATE).toBe(44100);
      expect(samples.length).toBe(ms(chimeLengthMs(notes, style)));
    },
  );

  const styleAndVolume = CHIME_STYLES.flatMap((style) =>
    [0.25, 0.5, 0.1, 1.0, 0.123, 0.777].map((volume) => [style, volume] as const),
  );

  test.each(styleAndVolume)(
    'the_loudest_moment_is_exactly_the_volume_asked_for[%s-%s]',
    (style, volume) => {
      const samples = samplesOf([C5, E5, G5], style, volume);
      expect(loudest(samples)).toBe(pyRound(volume * 32767));
    },
  );

  test('the_default_volume_is_a_quarter_of_full_scale', () => {
    expect(loudest(samplesOf([C5]))).toBe(8192);
  });

  test('a_volume_of_zero_is_silence', () => {
    const samples = samplesOf([C5, G5], 'bell', 0);
    expect(samples.length).toBe(ms(570));
    expect(samples.some((value) => value !== 0)).toBe(false);
  });

  const styleAndEveryPattern = CHIME_STYLES.flatMap((style) =>
    [CHANGE_PATTERN, ...SPEAKER_PATTERNS].map((notes) => [style, notes] as const),
  );

  test.each(styleAndEveryPattern)(
    'it_starts_and_ends_in_silence_so_it_does_not_click[%s-%j]',
    (style, notes) => {
      const samples = samplesOf(notes, style);
      const peak = loudest(samples);
      expect(samples[0]).toBe(0);
      expect(samples[samples.length - 1]).toBe(0);
      // It lands gently: the last millisecond is nearly silent.
      expect(loudest(samples.subarray(samples.length - 44))).toBeLessThan(peak * 0.01);
    },
  );

  test.each([
    ['bell', 8],
    ['soft', 15],
    ['glass', 6],
    ['wood', 2],
  ])('each_note_rises_instead_of_starting_at_full_strength[%s]', (style, attackMs) => {
    const samples = samplesOf([C5], style);
    const rise = ms(attackMs);
    // Half way through the rise the sound is still well below where the
    // rise ends.
    expect(loudest(samples.subarray(0, Math.floor(rise / 2)))).toBeLessThan(
      loudest(samples.subarray(0, rise + 1)),
    );
    expect(Math.abs(samples[1]!)).toBeLessThan(8192 * 0.05);
  });

  test.each(CHIME_STYLES)('a_single_note_sounds_at_its_pitch[%s]', (style) => {
    const samples = samplesOf([C5], style);
    const atPitch = strengthAt(samples, C5);
    expect(atPitch).toBeGreaterThan(3 * strengthAt(samples, C5 * 0.8));
    expect(atPitch).toBeGreaterThan(3 * strengthAt(samples, C5 * 1.25));
    expect(atPitch).toBeGreaterThan(strengthAt(samples, 2 * C5));
  });

  test.each(CHIME_STYLES)('the_notes_of_a_pattern_come_in_order[%s]', (style) => {
    const samples = samplesOf([C5, G5], style);
    const step = ms(NOTE_STEP_MS);
    const beforeSecond = samples.subarray(0, step);
    // Before the second note starts, only the first one is sounding.
    expect(strengthAt(beforeSecond, C5)).toBeGreaterThan(5 * strengthAt(beforeSecond, G5));
    // After it starts, the second one is there too...
    const after = samples.subarray(step, step + step);
    expect(strengthAt(after, G5)).toBeGreaterThan(strengthAt(beforeSecond, G5) * 5);
    // ...and the first one keeps ringing under it rather than being cut off.
    // (It keeps 11 to 60 percent of its strength, depending on the style.)
    expect(strengthAt(after, C5)).toBeGreaterThan(strengthAt(beforeSecond, C5) * 0.05);
  });

  test('going_up_and_going_down_are_different_sounds', () => {
    const up = samplesOf([C5, G5]);
    const down = samplesOf([G5, C5]);
    const step = ms(NOTE_STEP_MS);
    expect(strengthAt(up.subarray(0, step), C5)).toBeGreaterThan(
      strengthAt(up.subarray(0, step), G5),
    );
    expect(strengthAt(down.subarray(0, step), G5)).toBeGreaterThan(
      strengthAt(down.subarray(0, step), C5),
    );
  });

  test.each(CHIME_STYLES)('it_fades_away[%s]', (style) => {
    const samples = samplesOf([C5], style);
    const tenth = Math.floor(samples.length / 10);
    const loudness = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) =>
      rms(samples.subarray(i * tenth, (i + 1) * tenth)),
    );
    expect(loudness).toEqual([...loudness].sort((a, b) => b - a));
    expect(loudness[loudness.length - 1]).toBeLessThan(loudness[0]! / 10);
  });

  test('wood_dies_away_faster_than_glass', () => {
    const wood = samplesOf([C5], 'wood');
    const glass = samplesOf([C5], 'glass');
    const window = ms(200);
    // How much is left 200 ms in, against the first 50 ms.
    const left = (samples: Int16Array) =>
      rms(samples.subarray(window, window + ms(50))) / rms(samples.subarray(0, ms(50)));
    expect(left(wood)).toBeLessThan(left(glass) / 3);
  });

  test('the_styles_sound_different', () => {
    const sounds = new Set(CHIME_STYLES.map((style) => asKey(chimeSamples([C5], style))));
    expect(sounds.size).toBe(CHIME_STYLES.length);
  });

  test('glass_has_a_partial_that_bell_does_not', () => {
    const glass = samplesOf([C5], 'glass');
    const bell = samplesOf([C5], 'bell');
    expect(strengthAt(glass, C5 * 2.76)).toBeGreaterThan(5 * strengthAt(bell, C5 * 2.76));
    // It sits at 2.76 times the pitch, not on a whole multiple, which is
    // what makes glass sound like glass.
    expect(strengthAt(glass, C5 * 2.76)).toBeGreaterThan(20 * strengthAt(glass, C5 * 3));
  });

  test.each(['bell', 'wood'])('the_higher_partial_fades_faster_than_the_main_tone[%s]', (style) => {
    const samples = samplesOf([C5], style);
    const multiple = style === 'bell' ? 2 : 4;
    const early = samples.subarray(0, ms(50));
    const late = samples.subarray(ms(100), ms(150));
    const shareEarly = strengthAt(early, C5 * multiple) / strengthAt(early, C5);
    const shareLate = strengthAt(late, C5 * multiple) / strengthAt(late, C5);
    expect(shareLate).toBeLessThan(shareEarly / 2);
  });

  test('soft_is_a_plain_tone_with_no_octave', () => {
    const soft = samplesOf([C5], 'soft');
    const bell = samplesOf([C5], 'bell');
    expect(strengthAt(soft, 2 * C5)).toBeLessThan(strengthAt(bell, 2 * C5) / 10);
  });

  test('the_same_chime_is_the_same_bytes_every_time', () => {
    expect(chimeSamples([C5, G5], 'glass')).toEqual(chimeSamples([C5, G5], 'glass'));
  });

  test('every_speaker_gets_a_different_sound', () => {
    const sounds = new Set(
      [...SPEAKER_PATTERNS, CHANGE_PATTERN].map((pattern) => asKey(chimeSamples(pattern))),
    );
    expect(sounds.size).toBe(6);
  });

  test('making_the_longest_one_is_quick', () => {
    const started = Date.now();
    chimeSamples([C5, E5, G5], 'glass');
    expect((Date.now() - started) / 1000).toBeLessThan(2.0);
  });

  // ---- What it refuses ----

  test('an_unknown_style_is_refused', () => {
    expect(() => chimeSamples([C5], 'trumpet')).toThrow(RangeError);
  });

  test('no_notes_is_refused', () => {
    expect(() => chimeSamples([])).toThrow(RangeError);
  });

  test.each([-0.1, 1.01, 2])('a_volume_outside_zero_to_one_is_refused[%s]', (volume) => {
    expect(() => chimeSamples([C5], 'bell', volume)).toThrow(RangeError);
  });

  test.each([0, -440])('a_note_that_is_not_above_zero_is_refused[%s]', (note) => {
    expect(() => chimeSamples([C5, note])).toThrow(RangeError);
  });

  test.each([
    ['bell', 3],
    ['soft', 1],
    ['glass', 5.4],
    ['wood', 10],
  ])('a_note_too_high_for_the_style_is_refused[%s]', (style, highestMultiple) => {
    // Its highest partial has to stay under half the sample rate.
    const limit = SAMPLE_RATE / 2 / highestMultiple;
    chimeSamples([limit - 1], style);
    expect(() => chimeSamples([limit], style)).toThrow(RangeError);
  });

  // ---- The pattern each speaker gets ----

  // A Python dict compares without its order, so these do too. The fixtures
  // check the order.
  const asObject = (patterns: ReadonlyMap<string, ChimeNotes>) => Object.fromEntries(patterns);

  test('speakers_get_patterns_in_order_of_first_appearance', () => {
    expect(asObject(speakerPatterns(['Ann', 'Bob', 'Ann', 'Carl', 'Bob']))).toEqual({
      Ann: [C5],
      Bob: [C5, G5],
      Carl: [G5, C5],
    });
  });

  test('an_unnamed_change_gets_no_pattern_of_its_own', () => {
    expect(asObject(speakerPatterns([UNNAMED_SPEAKER, 'Ann', UNNAMED_SPEAKER, 'Bob']))).toEqual({
      Ann: [C5],
      Bob: [C5, G5],
    });
  });

  test('a_sixth_speaker_starts_again_from_the_first_pattern', () => {
    const patterns = speakerPatterns(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect([...'ABCDEFG'].map((speaker) => patterns.get(speaker))).toEqual([
      ...SPEAKER_PATTERNS,
      SPEAKER_PATTERNS[0],
      SPEAKER_PATTERNS[1],
    ]);
  });

  test('no_speakers_means_no_patterns', () => {
    expect(speakerPatterns([]).size).toBe(0);
  });

  // ---- Which notes a change plays ----

  const PATTERNS = new Map<string, ChimeNotes>([
    ['Ann', [C5]],
    ['Bob', [C5, G5]],
  ]);

  test('off_plays_nothing', () => {
    expect(chimeNotes('off', 'Ann', PATTERNS)).toBeNull();
  });

  test('one_chime_for_any_change_plays_the_change_chime_for_everyone', () => {
    for (const speaker of ['Ann', 'Bob', UNNAMED_SPEAKER, 'Nobody', null]) {
      expect(chimeNotes('change', speaker, PATTERNS)).toEqual([A4]);
    }
  });

  test('a_chime_per_speaker_plays_their_own_pattern', () => {
    expect(chimeNotes('per_speaker', 'Ann', PATTERNS)).toEqual([C5]);
    expect(chimeNotes('per_speaker', 'Bob', PATTERNS)).toEqual([C5, G5]);
  });

  test('a_chime_per_speaker_plays_the_change_chime_for_an_unnamed_change', () => {
    expect(chimeNotes('per_speaker', UNNAMED_SPEAKER, PATTERNS)).toEqual([A4]);
    expect(chimeNotes('per_speaker', 'Nobody', PATTERNS)).toEqual([A4]);
  });

  test.each(['', 'loud', 'Change', null, 1])(
    'an_unknown_sound_setting_plays_nothing[%j]',
    (sound) => {
      expect(chimeNotes(sound, 'Ann', PATTERNS)).toBeNull();
    },
  );

  test('every_sound_setting_is_handled', () => {
    // The settings' choices and this module's names must agree, or a choice
    // would quietly play nothing.
    const results = Object.fromEntries(
      SPEAKER_CUE_SOUNDS.map((sound) => [sound, chimeNotes(sound, 'Ann', PATTERNS)]),
    );
    expect(results).toEqual({ off: null, change: [A4], per_speaker: [C5] });
  });

  // ---- The wait between chimes ----

  test('the_first_chime_is_always_allowed', () => {
    expect(new ChimeGap().allow(0)).toBe(true);
  });

  test('a_chime_too_soon_after_a_short_one_is_refused', () => {
    const gap = new ChimeGap();
    expect(gap.allow(1000, 300)).toBe(true);
    expect(gap.allow(1001)).toBe(false);
    expect(gap.allow(1399)).toBe(false);
  });

  test('after_a_short_chime_the_minimum_gap_is_enough', () => {
    const gap = new ChimeGap();
    expect(gap.allow(1000, 300)).toBe(true);
    expect(gap.allow(1400)).toBe(true);
  });

  test('a_long_chime_is_never_cut_off', () => {
    const gap = new ChimeGap();
    expect(gap.allow(1000, 940)).toBe(true);
    expect(gap.allow(1400)).toBe(false);
    expect(gap.allow(1939)).toBe(false);
    expect(gap.allow(1940)).toBe(true);
  });

  test('a_chime_with_no_length_given_holds_the_minimum_gap', () => {
    const gap = new ChimeGap();
    expect(gap.allow(0)).toBe(true);
    expect(gap.allow(399)).toBe(false);
    expect(gap.allow(400)).toBe(true);
  });

  test('a_refused_chime_does_not_move_the_wait', () => {
    const gap = new ChimeGap();
    expect(gap.allow(1000, 450)).toBe(true);
    expect(gap.allow(1300, 940)).toBe(false);
    // Measured from the chime that played (1000 + 450), not the refused one.
    expect(gap.allow(1450)).toBe(true);
  });

  test('the_wait_counts_from_the_latest_chime_that_played', () => {
    const gap = new ChimeGap();
    expect(gap.allow(0, 450)).toBe(true);
    expect(gap.allow(500, 300)).toBe(true);
    expect(gap.allow(800)).toBe(false);
    expect(gap.allow(900)).toBe(true);
  });

  test('a_clock_that_went_backwards_does_not_silence_the_chimes', () => {
    const gap = new ChimeGap();
    expect(gap.allow(5000, 940)).toBe(true);
    expect(gap.allow(100)).toBe(true);
  });

  test('the_minimum_gap_can_be_set', () => {
    const gap = new ChimeGap(50);
    expect(gap.minGapMs).toBe(50);
    expect(gap.allow(0)).toBe(true);
    expect(gap.allow(49)).toBe(false);
    expect(gap.allow(50)).toBe(true);
  });

  test('the_default_minimum_gap', () => {
    expect(new ChimeGap().minGapMs).toBe(400);
  });
});
