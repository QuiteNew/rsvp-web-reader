// Tests for the chime player. The desktop's tests/test_chime_player.py is
// about WAV files in a temporary folder, a background thread and winsound,
// none of which exist in a browser. Where one of its tests checks something
// the web player also promises, it is kept under its Python name with the
// files read as "the chimes the player keeps". The rest are for the web:
// unlocking sound with a click, and never playing a chime late.
//
// Web Audio itself is not in jsdom, so WebAudioBackend is tested against a
// stand-in context here, and against the real one in e2e/chime.spec.ts.
import { describe, expect, test, vi } from 'vitest';
import { CHANGE_PATTERN, CHIME_STYLES, SPEAKER_PATTERNS, chimeSamples } from '../core/chime';
import {
  ChimePlayer,
  WebAudioBackend,
  chimeFloats,
  chimeKey,
  defaultBackend,
  type ChimeAudioContext,
  type ChimeBackend,
  type Scheduler,
} from './chimePlayer';

const ALL_PATTERNS = [...SPEAKER_PATTERNS, CHANGE_PATTERN];

class FakeBackend implements ChimeBackend {
  canPlayNow = true;
  unlocked = 0;
  played: [Float32Array, number][] = [];
  stopped = 0;
  closed = 0;
  private readonly fail: boolean;
  constructor(fail = false) {
    this.fail = fail;
  }
  unlock(): void {
    this.unlocked += 1;
  }
  play(samples: Float32Array, sampleRate: number): void {
    if (this.fail) throw new Error('no sound device');
    this.played.push([samples, sampleRate]);
  }
  stop(): void {
    this.stopped += 1;
  }
  close(): void {
    this.closed += 1;
  }
}

/** A scheduler the test runs by hand, so "in the background" is exact. */
function handScheduler() {
  const tasks: (() => void)[] = [];
  const schedule: Scheduler = (task) => tasks.push(task);
  return {
    schedule,
    tasks,
    runOne: () => tasks.shift()?.(),
    runAll: () => {
      while (tasks.length > 0) tasks.shift()?.();
    },
  };
}

function setUp() {
  const backend = new FakeBackend();
  const clock = handScheduler();
  const player = new ChimePlayer(backend, clock.schedule);
  return { backend, clock, player };
}

describe('test_chime_player.py, as far as a browser has it', () => {
  test('a_file_name_holds_the_style_and_the_notes', () => {
    expect(chimeKey([523.25], 'bell')).toBe('bell-52325');
    expect(chimeKey([523.25, 783.99], 'glass')).toBe('glass-52325-78399');
  });

  test('every_chime_of_every_style_has_its_own_file_name', () => {
    const names = new Set(
      CHIME_STYLES.flatMap((style) => ALL_PATTERNS.map((notes) => chimeKey(notes, style))),
    );
    expect(names.size).toBe(24);
  });

  test.each(CHIME_STYLES)('prepare_makes_every_chime_of_a_style[%s]', (style) => {
    const { clock, player } = setUp();
    player.prepare(style);
    clock.runAll();
    for (const notes of ALL_PATTERNS) {
      expect(player.isReady(notes, style)).toBe(true);
      expect(player.play(notes, style)).toBe(true);
    }
  });

  test('prepare_works_in_the_background', () => {
    // One chime per task, so the page is never held up for more than one.
    const { clock, player } = setUp();
    player.prepare('bell');
    expect(player.isReady(SPEAKER_PATTERNS[0]!, 'bell')).toBe(false);
    expect(clock.tasks).toHaveLength(1);
    clock.runOne();
    expect(player.isReady(SPEAKER_PATTERNS[0]!, 'bell')).toBe(true);
    expect(player.isReady(SPEAKER_PATTERNS[1]!, 'bell')).toBe(false);
    let tasks = 1;
    while (clock.tasks.length > 0) {
      clock.runOne();
      tasks += 1;
    }
    expect(tasks).toBe(6);
    expect(ALL_PATTERNS.every((notes) => player.isReady(notes, 'bell'))).toBe(true);
  });

  test('preparing_twice_leaves_the_files_alone', () => {
    const { backend, clock, player } = setUp();
    player.prepare('bell');
    clock.runAll();
    player.play(SPEAKER_PATTERNS[0]!, 'bell');
    const first = backend.played[0]![0];
    player.prepare('bell');
    expect(clock.tasks).toHaveLength(0);
    player.play(SPEAKER_PATTERNS[0]!, 'bell');
    expect(backend.played[1]![0]).toBe(first);
  });

  test('preparing_twice_before_the_work_is_done_queues_each_chime_once', () => {
    const { clock, player } = setUp();
    player.prepare('bell');
    player.prepare('bell');
    let tasks = 0;
    while (clock.tasks.length > 0) {
      clock.runOne();
      tasks += 1;
    }
    expect(tasks).toBe(6);
  });

  test('two_styles_live_side_by_side', () => {
    const { clock, player } = setUp();
    player.prepare('bell');
    player.prepare('wood');
    clock.runAll();
    const ready = CHIME_STYLES.flatMap((style) =>
      ALL_PATTERNS.filter((notes) => player.isReady(notes, style)),
    );
    expect(ready).toHaveLength(12);
  });

  test('nothing_is_ready_before_anything_is_made', () => {
    const { clock, player } = setUp();
    expect(player.isReady(SPEAKER_PATTERNS[0]!, 'bell')).toBe(false);
    // Asking makes nothing.
    expect(clock.tasks).toHaveLength(0);
  });

  test('a_ready_chime_plays_its_own_file', () => {
    const { backend, clock, player } = setUp();
    player.prepare('bell');
    clock.runAll();
    expect(player.play(SPEAKER_PATTERNS[1]!, 'bell')).toBe(true);
    const [samples, rate] = backend.played.at(-1)!;
    expect(rate).toBe(44100);
    expect(samples).toEqual(chimeFloats(SPEAKER_PATTERNS[1]!, 'bell'));
  });

  test('a_chime_that_is_not_ready_is_skipped_and_made_for_next_time', () => {
    const { backend, clock, player } = setUp();
    expect(player.play(SPEAKER_PATTERNS[0]!, 'soft')).toBe(false);
    expect(backend.played).toEqual([]);
    clock.runAll();
    expect(player.isReady(SPEAKER_PATTERNS[0]!, 'soft')).toBe(true);
    expect(player.isReady(CHANGE_PATTERN, 'soft')).toBe(true);
    expect(player.play(SPEAKER_PATTERNS[0]!, 'soft')).toBe(true);
  });

  test('the_preview_makes_the_chime_there_and_then', () => {
    const { backend, player } = setUp();
    expect(player.play(SPEAKER_PATTERNS[4]!, 'glass', true)).toBe(true);
    expect(backend.played.at(-1)![0]).toEqual(chimeFloats(SPEAKER_PATTERNS[4]!, 'glass'));
  });

  test('a_missing_sound_device_means_silence_not_an_error', () => {
    const player = new ChimePlayer(new FakeBackend(true), handScheduler().schedule);
    expect(player.play(CHANGE_PATTERN, 'bell', true)).toBe(false);
  });

  test('a_chime_that_cannot_be_made_means_silence_not_an_error', () => {
    const { backend, clock, player } = setUp();
    expect(player.play([0], 'bell', true)).toBe(false);
    expect(player.play(CHANGE_PATTERN, 'trumpet', true)).toBe(false);
    player.prepare('trumpet');
    expect(() => clock.runAll()).not.toThrow();
    expect(player.isReady(CHANGE_PATTERN, 'trumpet')).toBe(false);
    expect(backend.played).toEqual([]);
  });

  test('without_a_backend_nothing_is_available', () => {
    const clock = handScheduler();
    const player = new ChimePlayer(null, clock.schedule);
    expect(player.available).toBe(false);
    player.prepare('bell');
    player.unlock();
    expect(clock.tasks).toHaveLength(0);
    expect(player.play(CHANGE_PATTERN, 'bell', true)).toBe(false);
  });

  test('closing_stops_the_sound', () => {
    const { backend, player } = setUp();
    player.close();
    expect(backend.closed).toBe(1);
  });

  test('nothing_plays_after_closing', () => {
    const { backend, clock, player } = setUp();
    player.prepare('bell');
    clock.runAll();
    player.close();
    expect(player.available).toBe(false);
    expect(player.play(CHANGE_PATTERN, 'bell')).toBe(false);
    expect(backend.played).toEqual([]);
  });

  test('closing_twice_is_harmless', () => {
    const { backend, player } = setUp();
    player.close();
    player.close();
    expect(backend.closed).toBe(1);
  });

  test('a_sound_device_that_fails_to_stop_does_not_stop_the_closing', () => {
    class CloseFails extends FakeBackend {
      override close(): void {
        throw new Error('no sound device');
      }
    }
    const player = new ChimePlayer(new CloseFails(), handScheduler().schedule);
    player.play(CHANGE_PATTERN, 'bell', true);
    expect(() => player.close()).not.toThrow();
    expect(player.available).toBe(false);
  });

  test('closing_stops_the_background_work', () => {
    const { clock, player } = setUp();
    player.prepare('glass');
    clock.runOne();
    player.close();
    clock.runAll();
    expect(player.isReady(SPEAKER_PATTERNS[0]!, 'glass')).toBe(true);
    expect(player.isReady(SPEAKER_PATTERNS[1]!, 'glass')).toBe(false);
  });
});

describe('the web player', () => {
  test('a chime is the desktop samples, from -1 to 1', () => {
    const whole = chimeSamples(SPEAKER_PATTERNS[2]!, 'wood');
    const floats = chimeFloats(SPEAKER_PATTERNS[2]!, 'wood');
    expect(floats).toHaveLength(whole.length);
    // Exact both ways: a 16-bit sample over 32768 fits a 32-bit float.
    expect(Array.from(floats, (value) => value * 32768)).toEqual(Array.from(whole));
    expect(Math.max(...Array.from(floats, Math.abs))).toBe(0.25);
  });

  test('a chime is not played while sound cannot start now', () => {
    // It would be kept and played whenever sound starts: a late chime.
    const { backend, player } = setUp();
    backend.canPlayNow = false;
    expect(player.play(CHANGE_PATTERN, 'bell', true)).toBe(false);
    expect(backend.played).toEqual([]);
    // It was still made, for the next time.
    expect(player.isReady(CHANGE_PATTERN, 'bell')).toBe(true);
  });

  test('unlock is passed on, and a backend that fails to unlock is harmless', () => {
    const { backend, player } = setUp();
    player.unlock();
    expect(backend.unlocked).toBe(1);
    class UnlockFails extends FakeBackend {
      override unlock(): void {
        throw new Error('refused');
      }
    }
    expect(() => new ChimePlayer(new UnlockFails()).unlock()).not.toThrow();
  });

  test('the default is no backend where the browser has no Web Audio', () => {
    // jsdom has none. The real browsers are in e2e/chime.spec.ts.
    expect(typeof globalThis.AudioContext).toBe('undefined');
    expect(defaultBackend()).toBeNull();
    expect(new ChimePlayer().available).toBe(false);
  });
});

// ---- WebAudioBackend, against a stand-in context ----

class FakeSource {
  buffer: unknown = null;
  connectedTo: unknown = null;
  started = 0;
  stopped = 0;
  onended: (() => void) | null = null;
  connect(node: unknown) {
    this.connectedTo = node;
  }
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
  }
}

class FakeContext {
  state = 'suspended';
  destination = { name: 'speakers' };
  sources: FakeSource[] = [];
  resumes = 0;
  closes = 0;
  private finishResume: (() => void) | null = null;
  resume(): Promise<void> {
    this.resumes += 1;
    return new Promise((resolve) => {
      this.finishResume = () => {
        this.state = 'running';
        resolve();
      };
    });
  }
  async finishResuming() {
    this.finishResume?.();
    await Promise.resolve();
    await Promise.resolve();
  }
  close(): Promise<void> {
    this.closes += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return {
      channels,
      length,
      sampleRate,
      data,
      copyToChannel: (samples: Float32Array, channel: number) => {
        expect(channel).toBe(0);
        data.set(samples);
      },
    };
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

function webAudio() {
  const context = new FakeContext();
  const makeContext = vi.fn(() => context as unknown as ChimeAudioContext);
  return { context, makeContext, backend: new WebAudioBackend(makeContext) };
}

describe('WebAudioBackend', () => {
  test('no sound device is asked for before the first unlock', () => {
    const { makeContext, backend } = webAudio();
    expect(backend.canPlayNow).toBe(false);
    backend.play(new Float32Array(4), 44100);
    expect(makeContext).not.toHaveBeenCalled();
  });

  test('unlock makes the context once and resumes it', async () => {
    const { context, makeContext, backend } = webAudio();
    backend.unlock();
    // A chime asked for in the same click plays as soon as the resume is done.
    expect(backend.canPlayNow).toBe(true);
    await context.finishResuming();
    expect(context.state).toBe('running');
    expect(backend.canPlayNow).toBe(true);
    backend.unlock();
    expect(makeContext).toHaveBeenCalledTimes(1);
    expect(context.resumes).toBe(1);
  });

  test('a context the browser suspended later plays nothing until the next unlock', async () => {
    const { context, backend } = webAudio();
    backend.unlock();
    await context.finishResuming();
    context.state = 'suspended';
    expect(backend.canPlayNow).toBe(false);
    backend.unlock();
    expect(backend.canPlayNow).toBe(true);
    expect(context.resumes).toBe(2);
  });

  test('a resume that fails leaves sound off', async () => {
    const context = new FakeContext();
    context.resume = () => Promise.reject(new Error('not allowed'));
    const backend = new WebAudioBackend(() => context as unknown as ChimeAudioContext);
    backend.unlock();
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.canPlayNow).toBe(false);
  });

  test('play puts the samples in a mono buffer at their rate and starts it', () => {
    const { context, backend } = webAudio();
    backend.unlock();
    const samples = chimeFloats(CHANGE_PATTERN, 'soft');
    backend.play(samples, 44100);
    const [source] = context.sources;
    const buffer = source!.buffer as { channels: number; sampleRate: number; data: Float32Array };
    expect(buffer.channels).toBe(1);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.data).toEqual(samples);
    expect(source!.connectedTo).toBe(context.destination);
    expect(source!.started).toBe(1);
  });

  test('a new chime stops the one still playing, as winsound does', () => {
    const { context, backend } = webAudio();
    backend.unlock();
    backend.play(new Float32Array(4), 44100);
    backend.play(new Float32Array(4), 44100);
    expect(context.sources[0]!.stopped).toBe(1);
    expect(context.sources[1]!.stopped).toBe(0);
  });

  test('a chime that ended is not stopped again', () => {
    const { context, backend } = webAudio();
    backend.unlock();
    backend.play(new Float32Array(4), 44100);
    context.sources[0]!.onended?.();
    backend.stop();
    expect(context.sources[0]!.stopped).toBe(0);
  });

  test('close stops the chime and gives the context back, and nothing unlocks after', () => {
    const { context, makeContext, backend } = webAudio();
    backend.unlock();
    backend.play(new Float32Array(4), 44100);
    backend.close();
    backend.close();
    expect(context.sources[0]!.stopped).toBe(1);
    expect(context.closes).toBe(1);
    backend.unlock();
    expect(makeContext).toHaveBeenCalledTimes(1);
    expect(backend.canPlayNow).toBe(false);
  });

  test('a browser that refuses a context means silence', () => {
    const backend = new WebAudioBackend(() => {
      throw new Error('no sound device');
    });
    expect(() => backend.unlock()).not.toThrow();
    expect(backend.canPlayNow).toBe(false);
  });
});
