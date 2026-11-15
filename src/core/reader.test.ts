import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import type { OrpWord } from './orp';
import {
  ReaderSession,
  assembleChunkText,
  type PeripheralContext,
  type ReaderOptions,
} from './reader';

// ReaderSession keeps state, so its fixtures are scenarios: the text and
// options a session is made with, then steps. After every step the fixture
// holds what the Python session showed. tools/fixtures/generate.py has the
// two functions, light() and detail(), that these mirror.

type FrameList = [string, string, string];
type Light = [number, boolean, number, number, number, string | null, [number, number] | null];
type Detail = Record<string, unknown>;
type Step = [method: string, args: unknown[], light: Light, detail: Detail | null];

interface Scenario {
  text: string;
  options: Record<string, unknown>;
  total_words: number;
  frames?: FrameList[];
  start: [Light, Detail];
  steps: Step[];
}

function toOptions(python: Record<string, unknown>): ReaderOptions {
  return {
    wpm: python['wpm'] as number | undefined,
    startIndex: python['start_index'] as number | undefined,
    lengthPacingEnabled: python['length_pacing_enabled'] as boolean | undefined,
    warmUpEnabled: python['warm_up_enabled'] as boolean | undefined,
    chunkEnabled: python['chunk_enabled'] as boolean | undefined,
    chunkSize: python['chunk_size'] as number | undefined,
    chunkMode: python['chunk_mode'] as string | undefined,
    chunkCharTarget: python['chunk_char_target'] as number | undefined,
    speakerCuesEnabled: python['speaker_cues_enabled'] as boolean | undefined,
    speakerCustom: python['speaker_custom'],
  };
}

function frameList(frame: OrpWord): FrameList {
  return [frame.before, frame.focus, frame.after];
}

function contextList(context: PeripheralContext): unknown[] {
  return [context.before, context.current, context.after];
}

function light(session: ReaderSession): Light {
  const bounds = session.currentChunkBounds();
  return [
    session.index,
    session.isFinished,
    session.currentDelayMs(),
    session.currentChunkDelayMs(),
    session.remainingMs(),
    session.currentSpeaker,
    bounds === null ? null : [bounds[0], bounds[1]],
  ];
}

// Only the parts the fixture recorded at this step are compared.
function detail(session: ReaderSession, recorded: Detail): Detail {
  const frame = session.currentFrame();
  const answer: Detail = {
    frame: frame === null ? null : frameList(frame),
    chunk: session.currentChunk()?.map(frameList) ?? null,
    around: contextList(session.peripheralContext(2, 3)),
    around_chunk: contextList(session.chunkPeripheralContext(2, 3)),
    around_none: contextList(session.peripheralContext(-1, 0)),
  };
  // "one per word" stands for a list as long as the text that says nothing
  // new: every chunk is one word. Build that list here and compare it.
  const ranges = session.chunkRanges().map(([start, end]) => [start, end]);
  const onePerWord = ranges.every(([start, end], word) => start === word && end === word + 1);
  if ('chunks' in recorded) {
    answer['chunks'] =
      recorded['chunks'] === 'one per word' && onePerWord ? 'one per word' : ranges;
  }
  if ('chunk_texts' in recorded) {
    const texts = session.chunkTexts().map((text) => [text.before, text.focus, text.after]);
    const plain = session.frames.map(frameList);
    answer['chunk_texts'] =
      recorded['chunk_texts'] === 'one per word' && JSON.stringify(texts) === JSON.stringify(plain)
        ? 'one per word'
        : texts;
  }
  if ('turn_starts' in recorded) {
    answer['turn_starts'] = session.speakerTurns.starts;
    answer['turn_speakers'] = session.speakerTurns.speakers;
  }
  return answer;
}

function act(session: ReaderSession, method: string, args: unknown[]): void {
  switch (method) {
    case 'advance':
      return session.advance();
    case 'seek':
      return session.seek(args[0] as number);
    case 'seek_to':
      return session.seekTo(args[0] as number);
    case 'reset':
      return session.reset();
    case 'set_wpm':
      return session.setWpm(args[0] as number);
    case 'set_length_pacing_enabled':
      return session.setLengthPacingEnabled(args[0] as boolean);
    case 'set_warm_up_enabled':
      return session.setWarmUpEnabled(args[0] as boolean);
    case 'set_chunking':
      return session.setChunking(
        args[0] as boolean,
        args[1] as number,
        args[2] as string | null,
        args[3] as number | null,
      );
    case 'set_speaker_cues':
      return session.setSpeakerCues(args[0] as boolean, args[1]);
    default:
      throw new Error(`The fixture uses a method this test does not know: ${method}`);
  }
}

describe('against the Python fixtures', () => {
  const fixture = loadFixture('reader');
  const scenarios = fixture.functions['scenarios'] as unknown as Scenario[];

  test('every scenario plays out exactly as it did in Python', () => {
    expect(scenarios.length).toBeGreaterThan(300);
    const differences: unknown[] = [];
    let steps = 0;

    scenarios.forEach((scenario, number) => {
      const where = {
        scenario: number,
        text: scenario.text.slice(0, 40),
        options: scenario.options,
      };
      const session = new ReaderSession(scenario.text, toOptions(scenario.options));

      const compare = (step: string, python: unknown, typescript: unknown) => {
        if (JSON.stringify(typescript) !== JSON.stringify(python)) {
          differences.push({ ...where, step, python, typescript });
        }
      };

      compare('total words', scenario.total_words, session.totalWords);
      if (scenario.frames) {
        compare('frames', scenario.frames, session.frames.map(frameList));
      }
      compare('start', scenario.start[0], light(session));
      compare('start detail', scenario.start[1], detail(session, scenario.start[1]));

      scenario.steps.forEach(([method, args, expectedLight, expectedDetail], stepNumber) => {
        steps += 1;
        act(session, method, args);
        const label = `step ${stepNumber}: ${method}(${JSON.stringify(args).slice(1, -1)})`;
        compare(label, expectedLight, light(session));
        if (expectedDetail !== null) {
          compare(`${label} detail`, expectedDetail, detail(session, expectedDetail));
        }
      });
    });

    expect(steps).toBeGreaterThan(5000);
    expect(differences.slice(0, 3), `${differences.length} differences`).toEqual([]);
  });

  test('assembleChunkText', () => {
    expectToMatchFixture(fixture, 'assemble_chunk_text', ([frames]) => {
      const text = assembleChunkText(
        (frames as FrameList[]).map(([before, focus, after]) => ({ before, focus, after })),
      );
      return [text.before, text.focus, text.after];
    });
  });
});

// A few examples that read on their own. The desktop tests for the reader
// (test_reader.py, test_chunking.py, test_seeking.py and
// test_reader_speaker_cues.py) are still to be ported, see docs/STATUS.md.

describe('examples', () => {
  const text = 'Welcome to the show. Today we read fast, really fast!';

  test('a session starts on the first word and ends after the last', () => {
    const session = new ReaderSession(text);
    expect(session.totalWords).toBe(10);
    expect(session.currentFrame()).toEqual({ before: 'We', focus: 'l', after: 'come' });
    for (let word = 0; word < 10; word += 1) session.advance();
    expect(session.isFinished).toBe(true);
    expect(session.currentFrame()).toBeNull();
    expect(session.remainingMs()).toBe(0);
  });

  test('punctuation stays on the word but does not move the ORP letter', () => {
    const session = new ReaderSession('"Hello," she said.');
    expect(session.currentFrame()).toEqual({ before: '"H', focus: 'e', after: 'llo,"' });
  });

  test('a sentence end holds 2.5 times as long, a clause 1.5 times', () => {
    const session = new ReaderSession(text, { wpm: 300 });
    expect(session.currentDelayMs()).toBe(200);
    session.seekTo(3); // "show."
    expect(session.currentDelayMs()).toBe(500);
    session.seekTo(7); // "fast,"
    expect(session.currentDelayMs()).toBe(300);
  });

  test('a chunk never crosses a sentence end', () => {
    const session = new ReaderSession(text, { chunkEnabled: true, chunkSize: 3 });
    expect(session.chunkRanges()).toEqual([
      [0, 3],
      [3, 4],
      [4, 7],
      [7, 10],
    ]);
  });

  test('seeking lands on the start of a chunk', () => {
    const session = new ReaderSession(text, { chunkEnabled: true, chunkSize: 3 });
    session.seekTo(5);
    expect(session.index).toBe(4);
  });

  test('with speaker cues the last word of a turn holds longer', () => {
    const spoken = 'Ann: hi there\nBob: hello\nAnn: bye\nBob: bye';
    const off = new ReaderSession(spoken);
    const on = new ReaderSession(spoken, { speakerCuesEnabled: true });
    off.seekTo(2);
    on.seekTo(2); // "there", the last word before Bob
    expect(off.currentDelayMs()).toBe(200);
    expect(on.currentDelayMs()).toBe(700);
    expect(on.currentSpeaker).toBe('Ann');
    expect(off.currentSpeaker).toBeNull();
    expect(on.totalWords).toBe(off.totalWords);
  });

  test('an emoji is one character of a word', () => {
    const session = new ReaderSession('a😀b');
    expect(session.currentFrame()).toEqual({ before: 'a', focus: '😀', after: 'b' });
  });
});
