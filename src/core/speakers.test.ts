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

// The desktop project's own tests are ported in speakers.desktop.test.ts.

// Not in the Python tests: a saved list is a plain object in JavaScript,
// and a plain object has names of its own that are not entries.
test('a saved list is read by its own entries only', () => {
  expect(cleanCustomSpeakers({ bob: 'Bob' })?.get('constructor')).toBeUndefined();
  expect(toDict(cleanCustomSpeakers(JSON.parse('{"constructor": "x"}')))).toEqual({
    constructor: 'x',
  });
});
