// The desktop project's own tests for core/speakers.py, ported one by one.
// Each test keeps its Python name, so it can be found in the desktop repo:
//   tests/test_speakers.py
//   tests/test_speaker_rows.py
//   tests/test_whole_transcript_speakers.py
//   tests/test_transcript_speaker_list.py (the cleaner only)
// The fixtures in speakers.test.ts prove the port against Python's real
// output. These are the second check, and they keep the reason behind each
// odd case. A Python dict is compared as a plain object here.
//
// Not ported from test_transcript_speaker_list.py: the tests of the store
// setter, of loading data.json and of export and import. They need the
// store and the storage format, which belong to phase 3.
import { describe, expect, test } from 'vitest';
import { TRANSCRIPT_DEFAULTS } from './models';
import { cleanTranscript } from './parser';
import { pySplit } from './pythonText';
import { ReaderSession } from './reader';
import {
  AUTO_MIN_APPEARANCES,
  MAX_LABEL_CHARS,
  SpeakerTurns,
  UNNAMED_SPEAKER,
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
  type LabelHit,
  type SpeakerCandidate,
  type SpeakerRow,
  type SpeakerScan,
} from './speakers';
import { tokenize } from './tokenizer';

type Dict = Record<string, string>;

function dict(list: ReadonlyMap<string, string> | null): Dict | null {
  return list === null ? null : Object.fromEntries(list);
}

function list(entries: Dict): Map<string, string> {
  return new Map(Object.entries(entries));
}

function hit(wordIndex: number, key: string | null, name: string, marked: boolean): LabelHit {
  return { wordIndex, key, name, marked };
}

function candidate(key: string, name: string, appearances: number): SpeakerCandidate {
  return { key, name, appearances };
}

function row(
  key: string,
  label: string,
  appearances: number,
  ticked: boolean,
  name: string,
): SpeakerRow {
  return { key, label, appearances, ticked, name };
}

/** What Python's SpeakerTurns(starts, speakers) equality compares. */
function turnsOf(turns: SpeakerTurns): [readonly number[], readonly string[]] {
  return [turns.starts, turns.speakers];
}

describe('test_speakers.py', () => {
  /** The label names found in text, in order (null for a bare ">>"). */
  function names(text: string): (string | null)[] {
    return scanSpeakers(text).hits.map((found) => found.name || null);
  }

  function readerWords(text: string): string[] {
    return tokenize(cleanTranscript(text));
  }

  // --- What counts as a label ---

  test.each([
    ['Interviewer: So how did it start?', 'Interviewer'],
    ['Speaker 2: In a garage.', 'Speaker 2'],
    ['Q: Why?', 'Q'],
    ['A: Because.', 'A'],
    ['Dr. Smith: Good morning.', 'Dr. Smith'],
    ["O'Brien: Hello.", "O'Brien"],
    ['O’Brien: Hello.', 'O’Brien'],
    ['Mary-Jane: Hi.', 'Mary-Jane'],
    ['Jean Luc Le Bon: Bonjour.', 'Jean Luc Le Bon'],
    ['Иван: Привет.', 'Иван'],
    ['INTERVIEWER: Hello.', 'INTERVIEWER'],
    ['张三: 你好', '张三'], // a script with no capitals
    ['Speaker 2 : Hello.', 'Speaker 2'],
    ['Speaker   2: Hello.', 'Speaker 2'],
    ['   Bob: indented.', 'Bob'],
    ['\tBob: after a tab.', 'Bob'],
    ['Bob:', 'Bob'],
    ['Bob:\tafter a tab.', 'Bob'],
  ])('a_label_at_the_start_of_a_line_is_found %j', (line, name) => {
    expect(names(line)).toEqual([name]);
  });

  test.each([
    'and Bob: hi', // starts with a small letter
    'the answer is: yes', // starts with a small letter
    'speaker 1: hi', // an all-lowercase label isn't found
    'Note:hello', // no space after the colon
    'http://example.com is up', // a web address
    '10:30 is when we met', // a time of day
    '2nd: second place', // starts with a digit
    '_x: hi', // starts with an underscore
    'Wait, Bob: hi', // a comma inside
    'Ready? Go: now', // a question mark inside
    'Really! Bob: no', // an exclamation mark inside
    '"Bob": quoted', // quotes
    '(Bob): in brackets', // brackets
    '[Bob] hello', // the bracket form isn't supported
    'One two three four five: too many words',
    'Bob', // no colon at all
    ': nothing before it',
    'plain words with no label',
  ])('these_are_not_labels %j', (line) => {
    expect(names(line)).toEqual([]);
  });

  test('a_label_of_exactly_the_longest_length_is_found_and_one_more_is_not', () => {
    // Pinned as a plain number, so a change to the limit shows up here.
    expect(MAX_LABEL_CHARS).toBe(30);
    const longest = 'A'.repeat(30);
    expect(names(`${longest}: hi`)).toEqual([longest]);
    expect(names(`${longest}B: hi`)).toEqual([]);
  });

  test('four_words_are_allowed_and_five_are_not', () => {
    expect(names('One two three four: hi')).toEqual(['One two three four']);
    expect(names('One two three four five: hi')).toEqual([]);
  });

  test('the_length_is_measured_after_spaces_are_squeezed', () => {
    // 29 letters plus one space is 30 characters once the run of spaces
    // becomes one, so it fits.
    const name = 'A'.repeat(14) + '        ' + 'B'.repeat(15);
    expect(names(`${name}: hi`)).toEqual(['A'.repeat(14) + ' ' + 'B'.repeat(15)]);
  });

  test('only_the_first_colon_ends_the_label', () => {
    expect(names('Bob: time is 10:30: late')).toEqual(['Bob']);
  });

  // --- ">>" changes ---

  test('a_double_arrow_is_a_change_with_no_name', () => {
    expect(scanSpeakers('>> And then what happened?').hits).toEqual([hit(0, null, '', true)]);
  });

  test('a_double_arrow_alone_on_a_line_is_a_change', () => {
    expect(scanSpeakers('first line\n>>\nsecond line').hits).toEqual([hit(2, null, '', true)]);
  });

  test('a_label_after_a_double_arrow_is_used_and_remembers_the_arrow', () => {
    expect(scanSpeakers('>> JOHN: hi').hits).toEqual([hit(0, 'john', 'JOHN', true)]);
    expect(scanSpeakers('>>JOHN: hi').hits).toEqual([hit(0, 'john', 'JOHN', true)]);
  });

  test('three_arrows_are_not_a_change', () => {
    expect(scanSpeakers('>>> quoted reply').hits).toEqual([]);
  });

  test('a_double_arrow_later_in_the_line_is_not_a_change', () => {
    expect(scanSpeakers('a >> b').hits).toEqual([]);
  });

  // --- Lining up with the reader's words ---

  test('each_hit_is_at_the_word_number_of_its_line', () => {
    const text = 'Intro words here.\nInterviewer: So?\n\nSpeaker 2: Yes, it did.\n';
    const scan = scanSpeakers(text);
    const words = readerWords(text);
    expect(scan.wordCount).toBe(10);
    expect(words).toHaveLength(10);
    expect(scan.hits.map((found) => found.wordIndex)).toEqual([3, 5]);
    expect(words[3]).toBe('Interviewer:');
    expect(words[5]).toBe('Speaker');
  });

  test('timestamps_are_removed_first_like_the_reader_does', () => {
    const text = '[00:01:02] Bob: hi there\n00:01:05 Ann: hello\n0:07\nBob: again';
    const scan = scanSpeakers(text);
    const words = readerWords(text);
    expect(scan.wordCount).toBe(words.length);
    expect(scan.hits.map((found) => [found.wordIndex, found.key])).toEqual([
      [0, 'bob'],
      [3, 'ann'],
      [5, 'bob'],
    ]);
    expect(scan.hits.map((found) => words[found.wordIndex])).toEqual(['Bob:', 'Ann:', 'Bob:']);
  });

  test('a_subtitle_timing_line_does_not_count_as_words', () => {
    const text = '1\n00:00:01,000 --> 00:00:04,000\nBob: hi\n';
    const scan = scanSpeakers(text);
    expect(scan.wordCount).toBe(3);
    expect(readerWords(text)).toHaveLength(3);
    expect(scan.hits[0]?.wordIndex).toBe(1);
  });

  test.each(['\n', '\r\n', '\r'])('every_kind_of_line_ending_starts_a_new_line %j', (newline) => {
    const text = ['Bob: one', 'Ann: two', 'Bob: three'].join(newline);
    expect(scanSpeakers(text).hits.map((found) => found.wordIndex)).toEqual([0, 2, 4]);
  });

  test('other_unicode_line_separators_do_not_start_a_line_but_still_split_words', () => {
    // The reader splits words on these too, so the count must match, but
    // they're too unusual to treat as the start of a line.
    for (const separator of [' ', ' ', '\x85', '\x0b', '\x0c', '\x1c']) {
      const text = `one${separator}Bob: two`;
      const scan = scanSpeakers(text);
      expect(scan.wordCount).toBe(3);
      expect(readerWords(text)).toHaveLength(3);
      expect(scan.hits).toEqual([]);
    }
  });

  test('blank_and_whitespace_only_lines_are_skipped', () => {
    const text = '\n\n   \nBob: hi\n\t\n \nAnn: hey';
    const scan = scanSpeakers(text);
    expect(scan.wordCount).toBe(4);
    expect(scan.hits.map((found) => found.wordIndex)).toEqual([0, 2]);
  });

  test.each(['', '   ', '\n\n', '\r\n\t '])('empty_text_has_no_words_and_no_hits %j', (text) => {
    expect(scanSpeakers(text)).toEqual({ wordCount: 0, hits: [] });
  });

  // Pieces the random texts are built from: labels, changes, timestamps,
  // odd spaces and line endings, punctuation, other scripts and emoji.
  const PIECES = [
    'Bob:', 'Ann:', 'Speaker 2:', 'Q:', 'Dr. Smith:', 'INTERVIEWER:', 'Note:',
    '>>', '>> JOHN:', '>>>', 'word', 'two words', 'end.', 'hi,', '10:30', '--',
    'http://x.y', '[00:01:02]', '(1:23)', '00:02:45', '0:05',
    '00:00:01,000 --> 00:00:04,000', 'naïve', 'Иван:',
    '\u{1F600}', ' ', ' ', '\x85', '\x0b', '\t', ' ', '  ',
    '\n', '\n', '\n', '\r\n', '\r', '\n\n',
  ]; // prettier-ignore

  // Python's random.Random cannot be repeated here, so the texts are not
  // the same 3000 the desktop test makes. They are built the same way from
  // the same pieces, with a small seeded generator so a failure repeats.
  function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  test('word_numbers_always_match_the_reader_on_random_text', () => {
    const random = seeded(20261110);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    for (let round = 0; round < 3000; round += 1) {
      let text = '';
      const pieces = Math.floor(random() * 41);
      for (let i = 0; i < pieces; i += 1) {
        text += pick(PIECES) + pick(['', ' ', '\n']);
      }
      const shown = JSON.stringify(text);
      const scan = scanSpeakers(text);
      const words = readerWords(text);
      expect(scan.wordCount, shown).toBe(words.length);
      let last = -1;
      for (const found of scan.hits) {
        expect(found.wordIndex, shown).toBeGreaterThan(last);
        expect(found.wordIndex, shown).toBeLessThan(words.length);
        last = found.wordIndex;
        const firstWord = words[found.wordIndex] ?? '';
        const start = found.marked ? '>>' : (pySplit(found.name)[0] ?? '');
        expect(firstWord.startsWith(start), shown).toBe(true);
      }
    }
  });

  test('the_word_count_matches_a_real_reader_session', () => {
    const text =
      'Interviewer: So, how did it start?\n[00:00:05] Speaker 2: In a garage.\n>> And then?';
    expect(scanSpeakers(text).wordCount).toBe(new ReaderSession(text).totalWords);
  });

  // --- Candidates and Auto ---

  test('candidates_are_listed_in_order_of_first_appearance_with_counts', () => {
    const text = 'Ann: a\nBob: b\nAnn : c\nCarl: d\nBob: e\nANN: f\n>> g';
    expect(speakerCandidates(scanSpeakers(text))).toEqual([
      candidate('ann', 'Ann', 3),
      candidate('bob', 'Bob', 2),
      candidate('carl', 'Carl', 1),
    ]);
  });

  test('auto_switches_on_labels_that_appear_often_enough', () => {
    const candidates = [
      candidate('ann', 'Ann', 3),
      candidate('bob', 'Bob', AUTO_MIN_APPEARANCES),
      candidate('note', 'Note', AUTO_MIN_APPEARANCES - 1),
    ];
    expect(dict(autoSpeakers(candidates))).toEqual({ ann: 'Ann', bob: 'Bob' });
  });

  test('auto_names_each_speaker_the_way_it_was_first_written', () => {
    const scan = scanSpeakers('INTERVIEWER: a\nBob: b\nInterviewer: c\nBOB: d');
    expect(dict(autoSpeakers(speakerCandidates(scan)))).toEqual({
      interviewer: 'INTERVIEWER',
      bob: 'Bob',
    });
  });

  test('label_keys_ignore_case_and_extra_spaces', () => {
    expect(labelKey('  Speaker   TWO ')).toBe('speaker two');
    expect(labelKey('STRASSE')).toBe(labelKey('straße'));
  });

  // --- Turns ---

  /** Build a scan from [wordIndex, key, marked] items. */
  function hits(...items: [number, string | null, boolean][]): SpeakerScan {
    return {
      wordCount: 100,
      hits: items.map(([wordIndex, key, marked]) => hit(wordIndex, key, key ?? '', marked)),
    };
  }

  test('each_switched_on_label_starts_a_turn', () => {
    const scan = hits([0, 'ann', false], [5, 'bob', false], [9, 'ann', false]);
    const turns = buildTurns(scan, list({ ann: 'ann', bob: 'bob' }));
    expect(turnsOf(turns)).toEqual([
      [0, 5, 9],
      ['ann', 'bob', 'ann'],
    ]);
  });

  test('a_label_that_is_not_switched_on_is_ignored', () => {
    const scan = hits([0, 'ann', false], [5, 'note', false], [9, 'bob', false]);
    const turns = buildTurns(scan, list({ ann: 'ann', bob: 'bob' }));
    expect(turnsOf(turns)).toEqual([
      [0, 9],
      ['ann', 'bob'],
    ]);
  });

  test('a_label_not_switched_on_after_an_arrow_is_still_an_unnamed_change', () => {
    const scan = hits([0, 'ann', false], [5, 'john', true]);
    const turns = buildTurns(scan, list({ ann: 'ann' }));
    expect(turnsOf(turns)).toEqual([
      [0, 5],
      ['ann', UNNAMED_SPEAKER],
    ]);
  });

  test('a_bare_arrow_is_always_a_change', () => {
    const scan = hits([3, null, true]);
    expect(turnsOf(buildTurns(scan, list({})))).toEqual([[3], [UNNAMED_SPEAKER]]);
  });

  test('the_same_speaker_twice_in_a_row_is_one_turn', () => {
    const scan = hits([0, 'ann', false], [5, 'ann', false], [9, 'bob', false]);
    const turns = buildTurns(scan, list({ ann: 'ann', bob: 'bob' }));
    expect(turnsOf(turns)).toEqual([
      [0, 9],
      ['ann', 'bob'],
    ]);
  });

  test('merged_labels_in_a_row_are_one_turn', () => {
    const scan = hits([0, 'dr. smith', false], [5, 'smith', false], [9, 'ann', false]);
    const speakerOf = list({ 'dr. smith': 'smith', smith: 'smith', ann: 'ann' });
    expect(turnsOf(buildTurns(scan, speakerOf))).toEqual([
      [0, 9],
      ['smith', 'ann'],
    ]);
  });

  test('two_arrows_in_a_row_stay_two_changes', () => {
    const scan = hits([0, null, true], [5, null, true]);
    const turns = buildTurns(scan, list({}));
    expect(turnsOf(turns)).toEqual([
      [0, 5],
      [UNNAMED_SPEAKER, UNNAMED_SPEAKER],
    ]);
  });

  test('an_ignored_label_between_two_of_the_same_speaker_keeps_one_turn', () => {
    const scan = hits([0, 'ann', false], [5, 'note', false], [9, 'ann', false]);
    expect(turnsOf(buildTurns(scan, list({ ann: 'ann' })))).toEqual([[0], ['ann']]);
  });

  test('nothing_switched_on_means_no_turns', () => {
    const scan = hits([0, 'ann', false], [5, 'bob', false]);
    expect(turnsOf(buildTurns(scan, list({})))).toEqual(turnsOf(new SpeakerTurns()));
  });

  test('from_text_to_turns_with_auto', () => {
    const text = 'Welcome.\nAnn: hi\nBob: hey\nNote: once only\nAnn: bye\nBob: see you';
    const scan = scanSpeakers(text);
    const turns = buildTurns(scan, autoSpeakers(speakerCandidates(scan)));
    expect(turnsOf(turns)).toEqual([
      [1, 3, 8, 10],
      ['Ann', 'Bob', 'Ann', 'Bob'],
    ]);
  });

  // --- Looking up a speaker ---

  const eleven = Array.from({ length: 11 }, (_, word) => word);

  test('who_is_speaking_at_each_word', () => {
    const turns = new SpeakerTurns([2, 5, 9], ['ann', 'bob', 'ann']);
    expect(eleven.map((word) => turns.speakerAt(word))).toEqual([
      null, null, 'ann', 'ann', 'ann', 'bob', 'bob', 'bob', 'bob', 'ann', 'ann',
    ]); // prettier-ignore
  });

  test('where_turns_start', () => {
    const turns = new SpeakerTurns([2, 5, 9], ['ann', 'bob', 'ann']);
    expect(eleven.filter((word) => turns.isTurnStart(word))).toEqual([2, 5, 9]);
  });

  test('no_turns_means_no_one_speaks_and_no_turn_starts', () => {
    const turns = new SpeakerTurns();
    expect(turns.speakerAt(0)).toBeNull();
    expect(turns.speakerAt(50)).toBeNull();
    expect(turns.isTurnStart(0)).toBe(false);
  });

  test('a_turn_at_the_first_word', () => {
    const turns = new SpeakerTurns([0], ['ann']);
    expect(turns.speakerAt(0)).toBe('ann');
    expect(turns.isTurnStart(0)).toBe(true);
    expect(turns.isTurnStart(1)).toBe(false);
  });

  // --- Speed ---

  test('a_long_transcript_is_quick', () => {
    // About 200,000 words in 10,000 labelled lines.
    const words = Array.from({ length: 19 }, () => 'word').join(' ');
    const lines = Array.from({ length: 10_000 }, (_, i) => `Speaker ${i % 3}: ${words}`);
    const text = lines.join('\n');
    const started = Date.now();
    const scan = scanSpeakers(text);
    const turns = buildTurns(scan, autoSpeakers(speakerCandidates(scan)));
    const elapsed = (Date.now() - started) / 1000;
    expect(scan.wordCount).toBe(210_000);
    expect(turns.starts).toHaveLength(10_000);
    expect(elapsed).toBeLessThan(2.0);
  });
});

// TEXT: Ann and Bob start two lines each, so Auto switches them on. Cat
// starts only one, so Auto leaves her off, but she still gets a row.
describe('test_speaker_rows.py', () => {
  const TEXT = 'Ann: hi\nBob: yo\nCat: once\nAnn: and\nBob: so';

  function rowsByKey(custom: Dict | null = null): Record<string, SpeakerRow> {
    const rows = speakerRows(TEXT, custom === null ? null : list(custom));
    return Object.fromEntries(rows.map((found) => [found.key, found]));
  }

  /** The rows with one of them changed, the way the window changes them. */
  function changed(rows: SpeakerRow[], key: string, changes: Partial<SpeakerRow>): SpeakerRow[] {
    return rows.map((found) => (found.key === key ? { ...found, ...changes } : found));
  }

  // --- speakerRows() ---

  test('under_auto_every_label_gets_a_row_and_autos_picks_are_ticked', () => {
    expect(speakerRows(TEXT)).toEqual([
      row('ann', 'Ann', 2, true, 'Ann'),
      row('bob', 'Bob', 2, true, 'Bob'),
      row('cat', 'Cat', 1, false, 'Cat'),
    ]);
  });

  test('auto_still_needs_two_appearances', () => {
    // Pinned, so a change to the rule shows up here as well.
    expect(AUTO_MIN_APPEARANCES).toBe(2);
  });

  test('rows_come_in_order_of_first_appearance', () => {
    const rows = speakerRows('Zed: a\nAmy: b\nZed: c\nAmy: d');
    expect(rows.map((found) => found.key)).toEqual(['zed', 'amy']);
  });

  test('rows_follow_the_transcripts_own_list', () => {
    const rows = rowsByKey({ cat: 'Kat', ann: 'Ann' });
    expect([rows.ann?.ticked, rows.ann?.name]).toEqual([true, 'Ann']);
    expect([rows.bob?.ticked, rows.bob?.name]).toEqual([false, 'Bob']);
    expect([rows.cat?.ticked, rows.cat?.name]).toEqual([true, 'Kat']);
  });

  test('an_empty_own_list_ticks_nothing', () => {
    const rows = speakerRows(TEXT, list({}));
    expect(rows.map((found) => found.ticked)).toEqual([false, false, false]);
  });

  test('a_name_in_the_own_list_that_is_not_in_the_text_gets_no_row', () => {
    expect(Object.keys(rowsByKey({ dan: 'Dan', ann: 'Ann' })).sort()).toEqual([
      'ann',
      'bob',
      'cat',
    ]);
  });

  test('unnamed_changes_and_text_without_labels_give_no_rows', () => {
    expect(speakerRows('>> hello\n>> there')).toEqual([]);
    expect(speakerRows('just some words')).toEqual([]);
    expect(speakerRows('')).toEqual([]);
  });

  // --- speakerRowName() ---

  function named(name: string, label = 'Ann'): string {
    return speakerRowName(row('ann', label, 2, true, name));
  }

  test('a_typed_name_has_its_spaces_squeezed', () => {
    expect(named('  Dr.   Who  ')).toBe('Dr. Who');
  });

  test('an_empty_name_falls_back_to_the_label', () => {
    expect(named('')).toBe('Ann');
    expect(named('   ')).toBe('Ann');
  });

  test('a_long_name_is_cut_to_the_limit_without_a_space_at_the_end', () => {
    expect(MAX_LABEL_CHARS).toBe(30);
    expect(named('x'.repeat(40))).toBe('x'.repeat(30));
    // Cut after 30 characters this would end in a space.
    expect(named('y'.repeat(29) + ' zzz')).toBe('y'.repeat(29));
  });

  // --- speakersToSave() ---

  test('rows_left_as_auto_made_them_save_as_automatic', () => {
    expect(speakersToSave(speakerRows(TEXT))).toBeNull();
  });

  test('ticking_a_row_saves_a_custom_list', () => {
    const rows = changed(speakerRows(TEXT), 'cat', { ticked: true });
    expect(dict(speakersToSave(rows))).toEqual({ ann: 'Ann', bob: 'Bob', cat: 'Cat' });
  });

  test('ticking_and_unticking_again_is_automatic_again', () => {
    let rows = changed(speakerRows(TEXT), 'cat', { ticked: true });
    rows = changed(rows, 'cat', { ticked: false });
    expect(speakersToSave(rows)).toBeNull();
  });

  test('unticking_a_row_leaves_it_out', () => {
    const rows = changed(speakerRows(TEXT), 'bob', { ticked: false });
    expect(dict(speakersToSave(rows))).toEqual({ ann: 'Ann' });
  });

  test('a_new_name_is_saved', () => {
    const rows = changed(speakerRows(TEXT), 'ann', { name: 'Annie' });
    expect(dict(speakersToSave(rows))).toEqual({ ann: 'Annie', bob: 'Bob' });
  });

  test('the_same_name_on_two_rows_merges_them', () => {
    const rows = changed(speakerRows(TEXT), 'bob', { name: 'Ann' });
    expect(dict(speakersToSave(rows))).toEqual({ ann: 'Ann', bob: 'Ann' });
  });

  test('a_name_that_only_differs_in_spaces_is_still_automatic', () => {
    const rows = changed(speakerRows(TEXT), 'ann', { name: '  Ann ' });
    expect(speakersToSave(rows)).toBeNull();
  });

  test('the_name_of_an_unticked_row_does_not_matter', () => {
    const rows = changed(speakerRows(TEXT), 'cat', { name: 'Kat' });
    expect(speakersToSave(rows)).toBeNull();
  });

  test('nothing_ticked_is_an_empty_list_and_not_automatic', () => {
    const rows = speakerRows(TEXT).map((found) => ({ ...found, ticked: false }));
    expect(dict(speakersToSave(rows))).toEqual({});
  });

  test('nothing_ticked_where_auto_picks_nobody_is_automatic', () => {
    expect(speakersToSave(speakerRows('Ann: once\nBob: once'))).toBeNull();
  });

  test('an_own_list_that_matches_auto_saves_as_automatic', () => {
    const rows = speakerRows(TEXT, list({ ann: 'Ann', bob: 'Bob' }));
    expect(speakersToSave(rows)).toBeNull();
  });

  test('rows_can_come_from_any_iterable', () => {
    // Looked through twice inside, so a generator has to work too.
    function* oneByOne(): Generator<SpeakerRow> {
      yield* speakerRows(TEXT);
    }
    expect(speakersToSave(oneByOne())).toBeNull();
  });

  test('an_own_list_comes_back_unchanged', () => {
    const custom = { cat: 'Kat', bob: 'Ann', ann: 'Ann' };
    const saved = speakersToSave(speakerRows(TEXT, list(custom)));
    expect(dict(saved)).toEqual(custom);
    expect(dict(cleanCustomSpeakers(saved))).toEqual(custom);
  });
});

// TEXT has four turns. Ann and Bob each start two lines, so Auto switches
// both on, and Cat starts one, so Auto leaves her off. SELECTION is a piece
// of it that starts in the middle of Ann's first turn and holds each name
// only once.
describe('test_whole_transcript_speakers.py', () => {
  const TEXT = 'Ann: hi there\nBob: hello you\nCat: just once\nAnn: and so\nBob: we go';
  const SELECTION = 'there\nBob: hello you\nAnn: and';

  test('with_no_custom_list_it_is_what_auto_finds_in_the_whole_text', () => {
    expect(dict(transcriptSpeakers(TEXT))).toEqual({ ann: 'Ann', bob: 'Bob' });
    expect(dict(transcriptSpeakers(TEXT, null))).toEqual({ ann: 'Ann', bob: 'Bob' });
  });

  test('auto_still_needs_a_name_to_appear_twice', () => {
    // Pinned, so a change to the rule shows up here as well as in
    // test_speakers.py.
    expect(AUTO_MIN_APPEARANCES).toBe(2);
    expect(transcriptSpeakers(TEXT).has('cat')).toBe(false);
  });

  test('a_custom_list_is_used_as_it_is', () => {
    const custom = list({ cat: 'Cat', ann: 'Annie' });
    expect(dict(transcriptSpeakers(TEXT, custom))).toEqual({ cat: 'Cat', ann: 'Annie' });
  });

  test('an_empty_custom_list_means_nobody_and_not_auto', () => {
    expect(dict(transcriptSpeakers(TEXT, list({})))).toEqual({});
  });

  test('the_answer_is_always_a_new_dict', () => {
    const custom = list({ ann: 'Ann' });
    const answer = transcriptSpeakers(TEXT, custom);
    answer.set('bob', 'Bob');
    expect(dict(custom)).toEqual({ ann: 'Ann' });
  });

  test('text_with_no_labels_has_no_speakers', () => {
    expect(dict(transcriptSpeakers('just some words\nand some more'))).toEqual({});
    expect(dict(transcriptSpeakers(''))).toEqual({});
  });

  // --- What it's for: a selection read on its own ---

  function turns(text: string, custom: ReadonlyMap<string, string> | null): SpeakerTurns {
    const session = new ReaderSession(text, {
      wpm: 300,
      speakerCuesEnabled: true,
      speakerCustom: custom,
    });
    return session.speakerTurns;
  }

  test('on_its_own_a_selection_with_each_name_once_has_no_speakers', () => {
    // This is why the whole transcript's list is needed at all.
    expect(turns(SELECTION, null).starts).toEqual([]);
  });

  test('with_the_whole_transcripts_list_the_selection_has_its_turns', () => {
    // SELECTION's words: there(0) Bob:(1) hello(2) you(3) Ann:(4) and(5).
    const found = turns(SELECTION, transcriptSpeakers(TEXT));
    expect(found.starts).toEqual([1, 4]);
    expect(found.speakers).toEqual(['Bob', 'Ann']);
  });

  test('words_before_the_first_label_in_the_selection_have_no_speaker', () => {
    const found = turns(SELECTION, transcriptSpeakers(TEXT));
    expect(found.speakerAt(0)).toBeNull();
    expect(found.speakerAt(1)).toBe('Bob');
    expect(found.speakerAt(5)).toBe('Ann');
  });

  test('a_custom_list_reaches_the_selection_too', () => {
    const found = turns(SELECTION, transcriptSpeakers(TEXT, list({ ann: 'Annie' })));
    expect(found.starts).toEqual([4]);
    expect(found.speakers).toEqual(['Annie']);
  });
});

// A transcript's own list: null for Auto, or label key to shown name for
// Custom. Only the default and the cleaner are here, see the top of the file.
describe('test_transcript_speaker_list.py', () => {
  test('a_transcript_starts_in_auto', () => {
    expect(TRANSCRIPT_DEFAULTS.speakerCustom).toBeNull();
  });

  test.each([null, [], ['bob'], 'bob', 0, 1, true, 2.5])(
    'anything_that_is_not_a_dict_means_auto %j',
    (value) => {
      expect(cleanCustomSpeakers(value)).toBeNull();
    },
  );

  test('an_empty_dict_stays_custom_with_no_one_switched_on', () => {
    expect(dict(cleanCustomSpeakers({}))).toEqual({});
  });

  test('good_entries_are_kept_as_they_are', () => {
    const custom = { 'dr. smith': 'Smith', smith: 'Smith', ann: 'Ann', 'speaker 2': 'Speaker 2' };
    expect(dict(cleanCustomSpeakers(custom))).toEqual(custom);
  });

  test('spaces_in_a_name_are_squeezed', () => {
    expect(dict(cleanCustomSpeakers({ ann: '  Ann   Lee ' }))).toEqual({ ann: 'Ann Lee' });
  });

  // A Map is used here because a plain object cannot hold a key that is
  // not a string, and the Python test tries those too.
  test.each(['', 'Ann', ' ann', 'ann ', 'speaker  2', 1, null, true])(
    'a_key_that_is_not_a_label_key_is_dropped %j',
    (key) => {
      const custom = new Map<unknown, unknown>([
        [key, 'Ann'],
        ['bob', 'Bob'],
      ]);
      expect(dict(cleanCustomSpeakers(custom))).toEqual({ bob: 'Bob' });
    },
  );

  test.each(['', '   ', '\t\n', null, 1, true, ['Ann'], { x: 'y' }])(
    'an_empty_or_odd_name_is_dropped %j',
    (name) => {
      expect(dict(cleanCustomSpeakers({ ann: name, bob: 'Bob' }))).toEqual({ bob: 'Bob' });
    },
  );

  test('a_name_of_the_longest_length_is_kept_and_one_more_is_dropped', () => {
    const longest = 'A'.repeat(MAX_LABEL_CHARS);
    expect(dict(cleanCustomSpeakers({ ann: longest }))).toEqual({ ann: longest });
    expect(dict(cleanCustomSpeakers({ ann: longest + 'B' }))).toEqual({});
  });

  test('the_length_is_measured_after_spaces_are_squeezed', () => {
    const name = 'A'.repeat(14) + '      ' + 'B'.repeat(15);
    expect(dict(cleanCustomSpeakers({ ann: name }))).toEqual({
      ann: 'A'.repeat(14) + ' ' + 'B'.repeat(15),
    });
  });

  test('the_answer_is_a_new_dict', () => {
    const custom = list({ ann: 'Ann' });
    const cleaned = cleanCustomSpeakers(custom);
    expect(cleaned).not.toBe(custom);
    custom.set('bob', 'Bob');
    expect(dict(cleaned)).toEqual({ ann: 'Ann' });
  });
});
