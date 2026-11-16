// The library rules against the desktop's TranscriptStore. The fixture
// holds scripts: calls made one after another on a store that starts
// empty, with what each call gave back and the whole state after it.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { STORE_STEPS as STEPS } from '../testing/storeSteps';
import * as rules from './library';
import { EMPTY_LIBRARY, TRANSCRIPT_DEFAULTS, type Library, type Transcript } from './models';
import { toSavedData } from './storageFormat';

const fixture = loadFixture('library');

type Call = readonly [name: string, ...args: unknown[]];

function play(script: readonly Call[]): unknown[] {
  let library = EMPTY_LIBRARY;
  return script.map(([name, ...args]) => {
    const step = STEPS[name];
    if (step === undefined) throw new Error(`No port of ${name}`);
    const [after, answer] = step(library, args);
    library = after;
    return [answer, toSavedData(library)];
  });
}

describe('against the Python fixtures', () => {
  test('every script plays out as it did on the desktop store', () => {
    expectToMatchFixture(fixture, 'play', ([script]) => play(script as Call[]));
  });

  test('the scripts use every ported method', () => {
    const used = new Set(
      (fixture.functions.play ?? []).flatMap(([args]) => (args[0] as Call[]).map(([name]) => name)),
    );
    expect([...used].sort()).toEqual(Object.keys(STEPS).sort());
  });

  test('MIN_ACTIVE_SECONDS_TO_COUNT_AS_READ', () => {
    const recorded = (fixture.functions.constants ?? [])[0]?.[1];
    expect(rules.MIN_ACTIVE_SECONDS_TO_COUNT_AS_READ).toBe(recorded);
  });
});

function transcript(id: number, fields: Partial<Transcript> = {}): Transcript {
  return { ...TRANSCRIPT_DEFAULTS, id, title: `T${id}`, space: 'General', ...fields };
}

const TWO: Library = {
  nextId: 3,
  currentSpaceIndex: 0,
  spaces: ['General', 'Work'],
  transcripts: [transcript(1), transcript(2, { space: 'Work' })],
};

// Not in the Python tests: what being pure means here.
describe('the rules are pure', () => {
  test('a refused change gives back the very same library', () => {
    expect(rules.addSpace(TWO, 'Work')).toBe(TWO);
    expect(rules.addSpace(TWO, '  ')).toBe(TWO);
    expect(rules.switchToSpace(TWO, 'Gone')).toBe(TWO);
    expect(rules.renameSpace(TWO, 'Work', 'General')).toBe(TWO);
    expect(rules.deleteSpace(TWO, 'Work')).toBe(TWO);
    expect(rules.deleteTranscript(TWO, 9)).toBe(TWO);
    expect(rules.setTitle(TWO, 9, 'x')).toBe(TWO);
    expect(rules.setSpace(TWO, 1, 'Gone')).toBe(TWO);
    expect(rules.setPosition(TWO, 1, 0)).toBe(TWO);
    expect(rules.setWpm(TWO, 1, 300)).toBe(TWO);
    expect(rules.removeBookmark(TWO, 1, 4)).toBe(TWO);
    expect(rules.setBookmarkLabel(TWO, 1, 4, 'x')).toBe(TWO);
    expect(rules.resyncDefaultReadingColors(TWO, '#FFFFFF', '#E74C3C', '#1E1E1E')).toBe(TWO);
  });

  test('a change leaves the library it was given as it was', () => {
    const before = JSON.stringify(TWO);
    rules.addSpace(TWO, 'Books');
    rules.renameSpace(TWO, 'Work', 'Office');
    rules.addTranscript(TWO, 'New', 'Work');
    rules.deleteTranscript(TWO, 1);
    rules.setText(TWO, 1, 'words');
    rules.addBookmark(TWO, 1, 3, 'words', 'NOW');
    rules.addSessionStats(TWO, 1, 10, 30);
    expect(JSON.stringify(TWO)).toBe(before);
  });

  test('only the changed transcript is a new object', () => {
    const after = rules.setText(TWO, 1, 'words');
    expect(after.transcripts[0]).not.toBe(TWO.transcripts[0]);
    expect(after.transcripts[1]).toBe(TWO.transcripts[1]);
  });

  test('a new transcript is the last one and takes the next id', () => {
    const after = rules.addTranscript(TWO, 'New', 'Work', { wpm: 450 });
    expect(after.transcripts.at(-1)).toEqual(
      transcript(3, { title: 'New', space: 'Work', wpm: 450 }),
    );
    expect(after.nextId).toBe(4);
  });
});
