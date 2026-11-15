import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import {
  SpeakerTurns,
  autoSpeakers,
  buildTurns,
  cleanCustomSpeakers,
  labelKey,
  scanSpeakers,
  speakerCandidates,
  speakerRowName,
  speakerRows,
  speakersToSave,
  transcriptSpeakers,
  type SpeakerRow,
} from './speakers';

// The fixtures hold Python's shapes: a dict for a speaker list, and lists
// for hits, candidates and rows. These turn the port's shapes into those.
type Saved = Record<string, string> | null;

function toMap(saved: Saved): Map<string, string> | null {
  return saved === null ? null : new Map(Object.entries(saved));
}

function toDict(list: ReadonlyMap<string, string> | null): Saved {
  return list === null ? null : Object.fromEntries(list);
}

type RowList = [string, string, number, boolean, string];

function toRow([key, label, appearances, ticked, name]: RowList): SpeakerRow {
  return { key, label, appearances, ticked, name };
}

function fromRow(row: SpeakerRow): RowList {
  return [row.key, row.label, row.appearances, row.ticked, row.name];
}

describe('against the Python fixtures', () => {
  const fixture = loadFixture('speakers');
  const cases: [string, (args: readonly unknown[]) => unknown][] = [
    ['label_key', ([name]) => labelKey(name as string)],
    ['clean_custom_speakers', ([value]) => toDict(cleanCustomSpeakers(value))],
    [
      'scan_speakers',
      ([text]) => {
        const scan = scanSpeakers(text as string);
        return {
          word_count: scan.wordCount,
          hits: scan.hits.map((hit) => [hit.wordIndex, hit.key, hit.name, hit.marked]),
        };
      },
    ],
    [
      'speaker_candidates',
      ([text]) =>
        speakerCandidates(scanSpeakers(text as string)).map((candidate) => [
          candidate.key,
          candidate.name,
          candidate.appearances,
        ]),
    ],
    [
      'auto_speakers',
      ([text]) => toDict(autoSpeakers(speakerCandidates(scanSpeakers(text as string)))),
    ],
    [
      'build_turns',
      ([text, custom]) => {
        const scan = scanSpeakers(text as string);
        const speakerOf = toMap(custom as Saved) ?? autoSpeakers(speakerCandidates(scan));
        const turns = buildTurns(scan, speakerOf);
        return { starts: turns.starts, speakers: turns.speakers };
      },
    ],
    [
      'speaker_at_and_is_turn_start',
      ([starts, speakers]) => {
        const turns = new SpeakerTurns(starts as number[], speakers as string[]);
        // The fixture asks about every word from one before the first to
        // one past the last. Its answer list says how many that is.
        const answers = fixture.functions['speaker_at_and_is_turn_start']?.find(
          ([args]) => args[0] === starts && args[1] === speakers,
        )?.[1] as unknown[];
        return answers.map((_, offset) => [
          turns.speakerAt(offset - 1),
          turns.isTurnStart(offset - 1),
        ]);
      },
    ],
    [
      'speaker_rows',
      ([text, custom]) => speakerRows(text as string, toMap(custom as Saved)).map(fromRow),
    ],
    ['speaker_row_name', ([row]) => speakerRowName(toRow(row as RowList))],
    ['speakers_to_save', ([rows]) => toDict(speakersToSave((rows as RowList[]).map(toRow)))],
    [
      'transcript_speakers',
      ([text, custom]) => toDict(transcriptSpeakers(text as string, toMap(custom as Saved))),
    ],
  ];

  test.each(cases)('%s', (pythonName, run) => {
    expectToMatchFixture(fixture, pythonName, run);
  });
});

// A few of the desktop tests in tests/test_speakers.py, as examples that
// read on their own. The rest of that file is still to be ported, see
// docs/STATUS.md.

function names(text: string): (string | null)[] {
  return scanSpeakers(text).hits.map((hit) => (hit.name !== '' ? hit.name : null));
}

test.each([
  ['Interviewer: So how did it start?', 'Interviewer'],
  ['Speaker 2: In a garage.', 'Speaker 2'],
  ['Dr. Smith: Good morning.', 'Dr. Smith'],
  ['O’Brien: Hello.', 'O’Brien'],
  ['Иван: Привет.', 'Иван'],
  ['张三: 你好', '张三'], // a script with no capitals
  ['Speaker 2 : Hello.', 'Speaker 2'],
  ['   Bob: indented.', 'Bob'],
  ['Bob:', 'Bob'],
])('a_label_at_the_start_of_a_line_is_found: %s', (line, name) => {
  expect(names(line)).toEqual([name]);
});

test.each([
  'and Bob: hi', // starts with a small letter
  'speaker 1: hi', // an all-lowercase label is not found
  'Note:hello', // no space after the colon
  'http://example.com is up', // a web address
  '10:30 is when we met', // a time of day
  '_x: hi', // starts with an underscore
  'Wait, Bob: hi', // a comma inside
  '[Bob] hello', // the bracket form is not supported
  'One two three four five: too many words',
])('these_are_not_labels: %s', (line) => {
  expect(names(line)).toEqual([]);
});

test('a_label_after_a_double_arrow_is_used_and_remembers_the_arrow', () => {
  expect(scanSpeakers('>> JOHN: hi').hits).toEqual([
    { wordIndex: 0, key: 'john', name: 'JOHN', marked: true },
  ]);
});

test('three_arrows_are_not_a_change', () => {
  expect(scanSpeakers('>>> quoted reply').hits).toEqual([]);
});

test('label_keys_ignore_case_and_extra_spaces', () => {
  expect(labelKey('  Speaker   TWO ')).toBe('speaker two');
  expect(labelKey('STRASSE')).toBe(labelKey('straße'));
});

test('from_text_to_turns_with_auto', () => {
  const text = 'Welcome.\nAnn: hi\nBob: hey\nNote: once only\nAnn: bye\nBob: see you';
  const scan = scanSpeakers(text);
  const turns = buildTurns(scan, autoSpeakers(speakerCandidates(scan)));
  expect(turns.starts).toEqual([1, 3, 8, 10]);
  expect(turns.speakers).toEqual(['Ann', 'Bob', 'Ann', 'Bob']);
});

test('who_is_speaking_at_each_word', () => {
  const turns = new SpeakerTurns([2, 5, 9], ['ann', 'bob', 'ann']);
  const who = Array.from({ length: 11 }, (_, word) => turns.speakerAt(word));
  expect(who).toEqual([null, null, 'ann', 'ann', 'ann', 'bob', 'bob', 'bob', 'bob', 'ann', 'ann']);
});

// Not in the Python tests: a saved list is a plain object in JavaScript,
// and a plain object has names of its own that are not entries.
test('a saved list is read by its own entries only', () => {
  expect(cleanCustomSpeakers({ bob: 'Bob' })?.get('constructor')).toBeUndefined();
  expect(toDict(cleanCustomSpeakers(JSON.parse('{"constructor": "x"}')))).toEqual({
    constructor: 'x',
  });
});
