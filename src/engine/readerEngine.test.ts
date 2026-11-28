// Tests for the reading loop. Time is a clock the test moves by hand, so
// nothing here waits, and nothing depends on a real timer being on time.
//
// The rules tested are the ones in contract.ts. Most come from the desktop
// app's reader_display.py. The late timer and the hidden tab are new here.

import { describe, expect, test } from 'vitest';

import { ReaderSession, type ReaderOptions } from '../core/reader';
import { FakeClock, FakeVisibility } from '../testing/fakeClock';
import type { EngineBehaviour, SessionStats } from './contract';
import { ReaderLoop } from './readerEngine';

// Five plain words. At 300 words a minute each one shows for 200 ms.
const FIVE_WORDS = 'one two three four five';
const WORD_MS = 200;

// Four turns, starting at words 0, 4, 8 and 12. A label shows for 300 ms,
// a plain word for 200, and the last word before a new speaker for 700.
const TWO_SPEAKERS = [
  'Alice: hello there friend',
  'Bob: hi again you',
  'Alice: fine thanks much',
  'Bob: good then bye',
].join('\n');

interface Rig {
  readonly clock: FakeClock;
  readonly visibility: FakeVisibility;
  readonly engine: ReaderLoop;
  readonly positions: number[];
  readonly stats: SessionStats[];
  readonly speakers: string[];
}

function makeRig(behaviour?: Partial<EngineBehaviour>): Rig {
  const clock = new FakeClock();
  const visibility = new FakeVisibility();
  const positions: number[] = [];
  const stats: SessionStats[] = [];
  const speakers: string[] = [];
  const engine = new ReaderLoop({
    clock,
    visibility,
    behaviour,
    events: {
      onPositionChanged: (index) => positions.push(index),
      onSessionStats: (sessionStats) => stats.push(sessionStats),
      onNewSpeaker: (speaker) => speakers.push(speaker),
    },
  });
  return { clock, visibility, engine, positions, stats, speakers };
}

function loaded(
  text = FIVE_WORDS,
  options: ReaderOptions = {},
  behaviour?: Partial<EngineBehaviour>,
): Rig {
  const rig = makeRig(behaviour);
  rig.engine.load(new ReaderSession(text, options));
  return rig;
}

// The word on screen, put back together.
function shown(rig: Rig): string | null {
  const chunk = rig.engine.getSnapshot().chunk;
  return chunk === null ? null : chunk.before + chunk.focus + chunk.after;
}

describe('snapshots', () => {
  test('nothing loaded is the empty snapshot', () => {
    const { engine } = makeRig();
    const snapshot = engine.getSnapshot();
    expect(snapshot.status).toBe('empty');
    expect(snapshot.chunk).toBeNull();
    expect(snapshot.totalWords).toBe(0);
  });

  test('the snapshot is the same object until something changes', () => {
    const rig = loaded();
    const first = rig.engine.getSnapshot();
    expect(rig.engine.getSnapshot()).toBe(first);
    rig.clock.advance(WORD_MS - 1);
    expect(rig.engine.getSnapshot()).toBe(first);
    rig.clock.advance(1);
    expect(rig.engine.getSnapshot()).not.toBe(first);
  });

  test('listeners hear every change, until they stop listening', () => {
    const rig = makeRig();
    let calls = 0;
    const stop = rig.engine.subscribe(() => {
      calls += 1;
    });
    rig.engine.load(new ReaderSession(FIVE_WORDS));
    expect(calls).toBe(1);
    rig.clock.advance(WORD_MS);
    expect(calls).toBe(2);
    stop();
    rig.clock.advance(WORD_MS);
    expect(calls).toBe(2);
  });

  test('the snapshot carries the word split around its focus letter', () => {
    const rig = loaded('reading');
    // A seven letter word has its focus on the third letter.
    expect(rig.engine.getSnapshot().chunk).toEqual({ before: 're', focus: 'a', after: 'ding' });
    expect(rig.engine.getSnapshot().chunkBounds).toEqual([0, 1]);
  });

  test('percent and time left follow the position', () => {
    const rig = loaded();
    expect(rig.engine.getSnapshot()).toMatchObject({ percent: 0, remainingMs: 1000, wpm: 300 });
    rig.clock.advance(WORD_MS * 2);
    expect(rig.engine.getSnapshot()).toMatchObject({ index: 2, percent: 40, remainingMs: 600 });
  });

  test('percent rounds a half to the even number, as Python does', () => {
    // 1 of 8 words is 12.5 percent. Python rounds that to 12, not 13.
    const rig = loaded('a b c d e f g h');
    rig.clock.advance(WORD_MS);
    expect(rig.engine.getSnapshot().percent).toBe(12);
  });

  test('an empty text loads as finished, at zero percent', () => {
    const rig = loaded('');
    expect(rig.engine.getSnapshot()).toMatchObject({ status: 'finished', percent: 0, chunk: null });
    expect(rig.clock.pending).toBe(0);
  });
});

describe('the text of every chunk, for fitting the font', () => {
  test('is empty with nothing loaded', () => {
    expect(makeRig().engine.chunkTexts()).toEqual([]);
  });

  test('has one entry per word, and per group after the words are grouped', () => {
    const rig = loaded();
    expect(rig.engine.chunkTexts().map((t) => t.before + t.focus + t.after)).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
    ]);
    rig.engine.setChunking(true, 2);
    expect(rig.engine.chunkTexts().map((t) => t.before + t.focus + t.after)).toEqual([
      'one two',
      'three four',
      'five',
    ]);
  });
});

describe('the surrounding-words line', () => {
  test('it is off until asked for, and the snapshot has none', () => {
    const rig = loaded();
    expect(rig.engine.getSnapshot().context).toBeNull();
  });

  test('on, it carries one word before and two after, as on the desktop', () => {
    const rig = loaded();
    rig.engine.setPeripheralContext(true);
    rig.clock.advance(WORD_MS);
    expect(rig.engine.getSnapshot().context).toEqual({
      before: ['one'],
      current: 'two',
      after: ['three', 'four'],
    });
  });

  test('the counts can be set, and a count below zero is zero', () => {
    const rig = loaded();
    rig.engine.setPeripheralContext(true, 2, -1);
    rig.engine.jumpTo(2);
    expect(rig.engine.getSnapshot().context).toEqual({
      before: ['one', 'two'],
      current: 'three',
      after: [],
    });
  });

  test('around a chunk it is the words before its first and after its last', () => {
    const rig = makeRig();
    rig.engine.load(new ReaderSession('a b c d e f g', { chunkEnabled: true, chunkSize: 2 }));
    rig.engine.setPeripheralContext(true, 1, 2);
    rig.engine.jumpTo(2);
    expect(rig.engine.getSnapshot().context).toEqual({
      before: ['b'],
      current: 'c',
      after: ['e', 'f'],
    });
  });

  test('it can be set before a session is loaded and is kept for it', () => {
    const rig = makeRig();
    rig.engine.setPeripheralContext(true);
    rig.engine.load(new ReaderSession(FIVE_WORDS, {}));
    expect(rig.engine.getSnapshot().context?.current).toBe('one');
  });

  test('it is switched off again, and gone when finished', () => {
    const rig = loaded();
    rig.engine.setPeripheralContext(true);
    expect(rig.engine.getSnapshot().context).not.toBeNull();
    rig.engine.setPeripheralContext(false);
    expect(rig.engine.getSnapshot().context).toBeNull();
    rig.engine.setPeripheralContext(true);
    rig.engine.jumpTo(5);
    expect(rig.engine.getSnapshot().status).toBe('finished');
    expect(rig.engine.getSnapshot().context).toBeNull();
  });
});

describe('playing', () => {
  test('load shows the first word and starts playing', () => {
    const rig = loaded();
    expect(rig.engine.getSnapshot().status).toBe('playing');
    expect(shown(rig)).toBe('one');
    expect(rig.clock.nextDelay).toBe(WORD_MS);
  });

  test('load can start paused', () => {
    const rig = makeRig();
    rig.engine.load(new ReaderSession(FIVE_WORDS), true);
    expect(rig.engine.getSnapshot().status).toBe('paused');
    expect(shown(rig)).toBe('one');
    expect(rig.clock.pending).toBe(0);
  });

  test('a word stays for its whole time and then gives way', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS - 1);
    expect(shown(rig)).toBe('one');
    rig.clock.advance(1);
    expect(shown(rig)).toBe('two');
    expect(rig.positions).toEqual([1]);
  });

  test('reading runs to the end and stops there', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS * 5);
    expect(rig.engine.getSnapshot()).toMatchObject({
      status: 'finished',
      index: 5,
      percent: 100,
      chunk: null,
      remainingMs: 0,
    });
    expect(rig.clock.pending).toBe(0);
    expect(rig.positions).toEqual([1, 2, 3, 4, 5]);
  });

  test('the loop never holds more than one timer', () => {
    const rig = loaded();
    rig.engine.skip(1);
    rig.engine.skip(1);
    rig.engine.togglePause();
    rig.engine.togglePause();
    rig.engine.restart();
    rig.engine.setChunking(true, 2);
    expect(rig.clock.pending).toBe(1);
  });

  test('a longer pause in the text is a longer wait', () => {
    // The word that ends a sentence shows for 500 ms at this speed.
    const rig = loaded('one two three. four five');
    rig.clock.advance(WORD_MS * 2);
    expect(shown(rig)).toBe('three.');
    rig.clock.advance(499);
    expect(shown(rig)).toBe('three.');
    rig.clock.advance(1);
    expect(shown(rig)).toBe('four');
  });
});

describe('pause and resume', () => {
  test('pause holds the word and resume gives it its full time again', () => {
    const rig = loaded();
    rig.clock.advance(150);
    rig.engine.togglePause();
    expect(rig.engine.getSnapshot().status).toBe('paused');
    rig.clock.advance(10_000);
    expect(shown(rig)).toBe('one');
    rig.engine.togglePause();
    expect(rig.engine.getSnapshot().status).toBe('playing');
    expect(rig.clock.nextDelay).toBe(WORD_MS);
  });

  test('toggling does nothing with no session, or once finished', () => {
    const rig = makeRig();
    rig.engine.togglePause();
    expect(rig.engine.getSnapshot().status).toBe('empty');
    rig.engine.load(new ReaderSession(FIVE_WORDS));
    rig.clock.advance(WORD_MS * 5);
    rig.engine.togglePause();
    expect(rig.engine.getSnapshot().status).toBe('finished');
    expect(rig.clock.pending).toBe(0);
    // The toggle left no hidden pause behind: a skip back reads on.
    rig.engine.skip(-2);
    expect(rig.engine.getSnapshot().status).toBe('playing');
  });

  test('resume rewind steps back first and reports where it landed', () => {
    const rig = loaded(FIVE_WORDS, {}, { resumeRewindWords: 2 });
    rig.clock.advance(WORD_MS * 3);
    rig.engine.togglePause();
    rig.positions.length = 0;
    rig.engine.togglePause();
    expect(shown(rig)).toBe('two');
    expect(rig.positions).toEqual([1]);
  });

  test('resume rewind stops at the first word', () => {
    const rig = loaded(FIVE_WORDS, {}, { resumeRewindWords: 5 });
    rig.clock.advance(WORD_MS);
    rig.engine.togglePause();
    rig.engine.togglePause();
    expect(rig.engine.getSnapshot().index).toBe(0);
  });

  test('pausing does not rewind, only resuming does', () => {
    const rig = loaded(FIVE_WORDS, {}, { resumeRewindWords: 2 });
    rig.clock.advance(WORD_MS * 3);
    rig.engine.togglePause();
    expect(rig.engine.getSnapshot().index).toBe(3);
  });

  test('a changed rewind setting is read at the next resume', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS * 3);
    rig.engine.togglePause();
    rig.engine.setBehaviour({ resumeRewindWords: 1 });
    expect(rig.engine.getSnapshot().index).toBe(3);
    rig.engine.togglePause();
    expect(rig.engine.getSnapshot().index).toBe(2);
  });
});

describe('restart', () => {
  test('restart goes back to the first word and plays', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS * 2);
    rig.engine.restart();
    expect(rig.engine.getSnapshot()).toMatchObject({ status: 'playing', index: 0 });
    expect(rig.clock.nextDelay).toBe(WORD_MS);
    expect(rig.positions.at(-1)).toBe(0);
  });

  test('restart plays even from a pause', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS * 2);
    rig.engine.togglePause();
    rig.engine.restart();
    expect(rig.engine.getSnapshot()).toMatchObject({ status: 'playing', index: 0 });
  });

  test('restart plays again after the end', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS * 5);
    rig.engine.restart();
    expect(rig.engine.getSnapshot()).toMatchObject({ status: 'playing', index: 0 });
    rig.clock.advance(WORD_MS);
    expect(shown(rig)).toBe('two');
  });

  test('restart does nothing with no session', () => {
    const rig = makeRig();
    rig.engine.restart();
    expect(rig.engine.getSnapshot().status).toBe('empty');
    expect(rig.positions).toEqual([]);
  });
});

describe('skip', () => {
  test('a skip while playing keeps playing, with a full wait for the new word', () => {
    const rig = loaded();
    rig.clock.advance(150);
    rig.engine.skip(2);
    expect(rig.engine.getSnapshot()).toMatchObject({ status: 'playing', index: 2 });
    expect(rig.clock.nextDelay).toBe(WORD_MS);
    expect(rig.positions).toEqual([2]);
  });

  test('a skip while paused stays paused', () => {
    const rig = loaded();
    rig.engine.togglePause();
    rig.engine.skip(2);
    expect(rig.engine.getSnapshot()).toMatchObject({ status: 'paused', index: 2 });
    expect(rig.clock.pending).toBe(0);
  });

  test('a skip can be told to pause', () => {
    const rig = loaded();
    rig.engine.skip(2, true);
    expect(rig.engine.getSnapshot()).toMatchObject({ status: 'paused', index: 2 });
    expect(rig.clock.pending).toBe(0);
  });

  test('a skip back stops at the first word', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS);
    rig.engine.skip(-10);
    expect(rig.engine.getSnapshot().index).toBe(0);
  });

  test('a skip back from the end goes on reading, as on the desktop', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS * 5);
    rig.engine.skip(-2);
    expect(rig.engine.getSnapshot().status).toBe('playing');
    expect(rig.clock.nextDelay).toBe(WORD_MS);
  });
});

describe('scrubbing', () => {
  test('a drag holds reading and follows the thumb', () => {
    const rig = loaded();
    rig.engine.scrubMove(3);
    expect(rig.engine.getSnapshot()).toMatchObject({
      status: 'paused',
      index: 3,
      isScrubbing: true,
    });
    rig.engine.scrubMove(1);
    expect(rig.engine.getSnapshot().index).toBe(1);
    rig.clock.advance(10_000);
    expect(rig.engine.getSnapshot().index).toBe(1);
    expect(rig.positions).toEqual([3, 1]);
  });

  test('letting go stays paused when scrub pause is on', () => {
    const rig = loaded(FIVE_WORDS, {}, { scrubPauseEnabled: true });
    rig.engine.scrubMove(3);
    rig.engine.scrubEnd();
    expect(rig.engine.getSnapshot()).toMatchObject({ status: 'paused', isScrubbing: false });
    expect(rig.clock.pending).toBe(0);
  });

  test('letting go reads on when scrub pause is off and reading was going', () => {
    const rig = loaded(FIVE_WORDS, {}, { scrubPauseEnabled: false });
    rig.engine.scrubMove(3);
    rig.engine.scrubEnd();
    expect(rig.engine.getSnapshot().status).toBe('playing');
    expect(rig.clock.nextDelay).toBe(WORD_MS);
  });

  test('letting go stays paused when reading was paused before the drag', () => {
    const rig = loaded(FIVE_WORDS, {}, { scrubPauseEnabled: false });
    rig.engine.togglePause();
    rig.engine.scrubMove(3);
    rig.engine.scrubEnd();
    expect(rig.engine.getSnapshot().status).toBe('paused');
  });

  test('a drag past the last word ends as finished, with no timer', () => {
    const rig = loaded(FIVE_WORDS, {}, { scrubPauseEnabled: false });
    rig.engine.scrubMove(99);
    rig.engine.scrubEnd();
    expect(rig.engine.getSnapshot().status).toBe('finished');
    expect(rig.clock.pending).toBe(0);
  });

  test('letting go without a drag before it changes nothing', () => {
    const rig = loaded();
    const before = rig.engine.getSnapshot();
    rig.engine.scrubEnd();
    expect(rig.engine.getSnapshot()).toBe(before);
    expect(rig.clock.nextDelay).toBe(WORD_MS);
  });

  test('jumping to a word lands paused on it', () => {
    const rig = loaded();
    rig.engine.jumpTo(3);
    expect(rig.engine.getSnapshot()).toMatchObject({ status: 'paused', index: 3 });
    expect(shown(rig)).toBe('four');
    expect(rig.clock.pending).toBe(0);
    expect(rig.positions).toEqual([3]);
  });
});

describe('bookmark target', () => {
  test('gives the current word and the words around it', () => {
    const rig = loaded('a b c d e f g h i j');
    rig.engine.jumpTo(5);
    expect(rig.engine.bookmarkTarget()).toEqual({ index: 5, snippet: 'c d e f g h i' });
  });

  test('works at the first word, with nothing before it', () => {
    const rig = loaded();
    expect(rig.engine.bookmarkTarget()).toEqual({ index: 0, snippet: 'one two three four' });
  });

  test('is null with no session, and once finished', () => {
    const rig = makeRig();
    expect(rig.engine.bookmarkTarget()).toBeNull();
    rig.engine.load(new ReaderSession(FIVE_WORDS));
    rig.clock.advance(WORD_MS * 5);
    expect(rig.engine.bookmarkTarget()).toBeNull();
  });
});

describe('session stats', () => {
  test('words read counts only the words reading moved through itself', () => {
    const rig = loaded('a b c d e f g h i j');
    rig.clock.advance(WORD_MS * 2);
    rig.engine.skip(5);
    rig.clock.advance(WORD_MS);
    rig.engine.unload();
    expect(rig.stats).toEqual([{ wordsRead: 3, activeSeconds: 0.6 }]);
  });

  test('a chunk of three words counts as three', () => {
    const rig = loaded('one two three four five six seven', { chunkEnabled: true, chunkSize: 3 });
    rig.clock.advance(600);
    expect(rig.engine.getSnapshot().index).toBe(3);
    rig.engine.unload();
    expect(rig.stats[0]?.wordsRead).toBe(3);
  });

  test('paused time is not reading time', () => {
    const rig = loaded();
    rig.clock.advance(300);
    rig.engine.togglePause();
    rig.clock.advance(60_000);
    rig.engine.togglePause();
    rig.clock.advance(100);
    rig.engine.unload();
    expect(rig.stats[0]?.activeSeconds).toBeCloseTo(0.4);
  });

  test('time after the last word is not reading time', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS * 5);
    rig.clock.advance(60_000);
    rig.engine.unload();
    expect(rig.stats).toEqual([{ wordsRead: 5, activeSeconds: 1 }]);
  });

  test('time spent dragging the scrubber is not reading time', () => {
    const rig = loaded();
    rig.clock.advance(100);
    rig.engine.scrubMove(2);
    rig.clock.advance(5000);
    rig.engine.scrubEnd();
    rig.engine.unload();
    expect(rig.stats[0]?.activeSeconds).toBeCloseTo(0.1);
  });

  test('finalize reports once and then counts from zero', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS * 2);
    rig.engine.finalizeSession();
    rig.clock.advance(WORD_MS);
    rig.engine.unload();
    expect(rig.stats).toEqual([
      { wordsRead: 2, activeSeconds: 0.4 },
      { wordsRead: 1, activeSeconds: 0.2 },
    ]);
  });

  test('finalize with nothing loaded reports nothing', () => {
    const rig = makeRig();
    rig.engine.finalizeSession();
    rig.engine.unload();
    expect(rig.stats).toEqual([]);
  });

  test('loading a new session reports the one it replaces', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS);
    rig.engine.load(new ReaderSession('other text here'));
    expect(rig.stats).toEqual([{ wordsRead: 1, activeSeconds: 0.2 }]);
    expect(shown(rig)).toBe('other');
    expect(rig.clock.pending).toBe(1);
  });

  test('unload goes back to empty', () => {
    const rig = loaded();
    rig.engine.unload();
    expect(rig.engine.getSnapshot().status).toBe('empty');
    expect(rig.clock.pending).toBe(0);
  });
});

describe('a timer that is late', () => {
  test('the next word makes up for a late timer', () => {
    const rig = loaded();
    // The first timer was due at 200 and fires at 250.
    rig.clock.advanceLate(250);
    expect(shown(rig)).toBe('two');
    // The second word is still due at 400, so 150 from now.
    expect(rig.clock.nextDelay).toBe(150);
  });

  test('timers on time stay on the beat', () => {
    const rig = loaded();
    rig.clock.advance(WORD_MS * 3);
    expect(rig.clock.nextDelay).toBe(WORD_MS);
    expect(rig.clock.now()).toBe(600);
  });

  test('a very late timer does not race through the words it missed', () => {
    const rig = loaded();
    // Due at 200, fires at 2000: nine word times late.
    rig.clock.advanceLate(2000);
    expect(shown(rig)).toBe('two');
    expect(rig.clock.nextDelay).toBe(WORD_MS);
  });
});

describe('a hidden tab', () => {
  test('reading holds while the tab is hidden', () => {
    const rig = loaded();
    rig.clock.advance(100);
    rig.visibility.setHidden(true);
    expect(rig.engine.getSnapshot()).toMatchObject({ status: 'playing', isHeldForHiddenTab: true });
    expect(rig.clock.pending).toBe(0);
    rig.clock.advance(60_000);
    expect(shown(rig)).toBe('one');
  });

  test('reading goes on when the tab is shown, with a full wait', () => {
    const rig = loaded();
    rig.clock.advance(100);
    rig.visibility.setHidden(true);
    rig.clock.advance(60_000);
    rig.visibility.setHidden(false);
    expect(rig.engine.getSnapshot()).toMatchObject({
      status: 'playing',
      isHeldForHiddenTab: false,
    });
    expect(rig.clock.nextDelay).toBe(WORD_MS);
    rig.clock.advance(WORD_MS);
    expect(shown(rig)).toBe('two');
  });

  test('a short look away still gives the word its full time', () => {
    const rig = loaded();
    rig.clock.advance(100);
    rig.visibility.setHidden(true);
    rig.clock.advance(50);
    rig.visibility.setHidden(false);
    expect(rig.clock.nextDelay).toBe(WORD_MS);
  });

  test('coming back is not a resume, so there is no rewind', () => {
    const rig = loaded(FIVE_WORDS, {}, { resumeRewindWords: 2 });
    rig.clock.advance(WORD_MS * 3);
    rig.visibility.setHidden(true);
    rig.visibility.setHidden(false);
    expect(rig.engine.getSnapshot().index).toBe(3);
  });

  test('hidden time is not reading time', () => {
    const rig = loaded();
    rig.clock.advance(100);
    rig.visibility.setHidden(true);
    rig.clock.advance(60_000);
    rig.visibility.setHidden(false);
    rig.clock.advance(100);
    rig.engine.unload();
    expect(rig.stats[0]?.activeSeconds).toBeCloseTo(0.2);
  });

  test('a paused session stays paused when the tab is shown', () => {
    const rig = loaded();
    rig.engine.togglePause();
    rig.visibility.setHidden(true);
    expect(rig.engine.getSnapshot().isHeldForHiddenTab).toBe(false);
    rig.visibility.setHidden(false);
    expect(rig.engine.getSnapshot().status).toBe('paused');
    expect(rig.clock.pending).toBe(0);
  });

  test('a session loaded in a hidden tab waits for the tab', () => {
    const rig = makeRig();
    rig.visibility.setHidden(true);
    rig.engine.load(new ReaderSession(FIVE_WORDS));
    expect(rig.clock.pending).toBe(0);
    rig.visibility.setHidden(false);
    expect(rig.clock.nextDelay).toBe(WORD_MS);
  });

  test('nothing happens on a visibility change with no session', () => {
    const rig = makeRig();
    const before = rig.engine.getSnapshot();
    rig.visibility.setHidden(true);
    expect(rig.engine.getSnapshot()).toBe(before);
  });
});

describe('speakers', () => {
  test('reading on into a new turn fires the event with the speaker', () => {
    const rig = loaded(TWO_SPEAKERS, { speakerCuesEnabled: true });
    expect(rig.engine.getSnapshot().speaker).toBe('Alice');
    // Alice's turn is 300 + 200 + 200 + 700 ms long.
    rig.clock.advance(1399);
    expect(rig.speakers).toEqual([]);
    rig.clock.advance(1);
    expect(rig.speakers).toEqual(['Bob']);
    expect(rig.engine.getSnapshot()).toMatchObject({ index: 4, speaker: 'Bob' });
  });

  test('a skip or a scrub onto a turn fires nothing', () => {
    const rig = loaded(TWO_SPEAKERS, { speakerCuesEnabled: true });
    rig.engine.skip(4);
    rig.engine.scrubMove(8);
    rig.engine.scrubEnd();
    rig.engine.jumpTo(12);
    expect(rig.speakers).toEqual([]);
  });

  test('nothing fires with speaker cues off', () => {
    const rig = loaded(TWO_SPEAKERS);
    rig.clock.advance(60_000);
    expect(rig.engine.getSnapshot().status).toBe('finished');
    expect(rig.speakers).toEqual([]);
  });

  test('speakers() lists the speaker of each turn, for the chimes', () => {
    expect(makeRig().engine.speakers()).toEqual([]);
    const rig = loaded(TWO_SPEAKERS, { speakerCuesEnabled: true });
    expect(rig.engine.speakers()).toEqual(['Alice', 'Bob', 'Alice', 'Bob']);
    rig.engine.setSpeakerCues(false);
    expect(rig.engine.speakers()).toEqual([]);
    // The keys of a custom list are label keys, as labelKey() makes them.
    rig.engine.setSpeakerCues(
      true,
      new Map([
        ['alice', 'Alice'],
        ['bob', 'Robert'],
      ]),
    );
    expect(rig.engine.speakers()).toEqual(['Alice', 'Robert', 'Alice', 'Robert']);
    rig.engine.unload();
    expect(rig.engine.speakers()).toEqual([]);
  });

  test('turning cues on mid-read takes effect from the next turn', () => {
    const rig = loaded(TWO_SPEAKERS);
    rig.engine.setSpeakerCues(true);
    expect(rig.engine.getSnapshot().speaker).toBe('Alice');
    rig.clock.advance(1400);
    expect(rig.speakers).toEqual(['Bob']);
  });
});

describe('settings changed while reading', () => {
  test('a new speed starts with the next word', () => {
    const rig = loaded();
    rig.clock.advance(50);
    rig.engine.setWpm(600);
    expect(rig.engine.getSnapshot().wpm).toBe(600);
    // The word on screen keeps the 200 ms it was given.
    expect(rig.clock.nextDelay).toBe(150);
    rig.clock.advance(150);
    expect(rig.clock.nextDelay).toBe(100);
  });

  test('a new speed changes the time left at once', () => {
    const rig = loaded();
    rig.engine.setWpm(600);
    expect(rig.engine.getSnapshot().remainingMs).toBe(500);
  });

  test('new chunking gives the chunk on screen its full time', () => {
    const rig = loaded('one two three four five six seven');
    rig.clock.advance(WORD_MS + 50);
    rig.engine.setChunking(true, 3);
    // Word 1 now sits in the chunk of words 0 to 2, so reading snaps back.
    expect(rig.engine.getSnapshot()).toMatchObject({ index: 0, chunkBounds: [0, 3] });
    expect(shown(rig)).toBe('one two three');
    expect(rig.clock.nextDelay).toBe(600);
    expect(rig.positions.at(-1)).toBe(0);
  });

  test('new chunking while paused sets no timer', () => {
    const rig = loaded('one two three four five six seven');
    rig.engine.togglePause();
    rig.engine.setChunking(true, 3);
    expect(rig.clock.pending).toBe(0);
    expect(shown(rig)).toBe('one two three');
  });

  test('setters do nothing with no session', () => {
    const rig = makeRig();
    const before = rig.engine.getSnapshot();
    rig.engine.setWpm(500);
    rig.engine.setLengthPacingEnabled(true);
    rig.engine.setWarmUpEnabled(true);
    rig.engine.setChunking(true, 2);
    rig.engine.setSpeakerCues(true);
    rig.engine.skip(1);
    rig.engine.scrubMove(1);
    rig.engine.jumpTo(1);
    expect(rig.engine.getSnapshot()).toBe(before);
  });
});

describe('dispose', () => {
  test('dispose stops the timer and all listening', () => {
    const rig = loaded();
    rig.engine.dispose();
    expect(rig.clock.pending).toBe(0);
    expect(rig.visibility.listenerCount).toBe(0);
  });
});
