// The desktop project's own tests for core/reader.py, ported one by one.
// Each test keeps its Python name, so it can be found in the desktop repo.
// One describe per desktop file:
//   tests/test_reader.py (all of it)
//   tests/test_chunking.py (the reader and model parts)
//   tests/test_edge_cases.py (the two tests of a finished session)
//   tests/test_reader_speaker_cues.py (all of it)
// test_seeking.py and test_context_ribbon.py are not here: every test in
// them drives the desktop reader widget or the whole app, not this module.
// The fixtures in reader.test.ts prove the
// port against Python's real output. These are the second check, and they
// keep the reason behind each odd case.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { TRANSCRIPT_DEFAULTS } from './models';
import type { OrpWord } from './orp';
import { pyRound } from './pythonText';
import {
  ADAPTIVE_MAX_WORDS,
  CHUNK_CHAR_CAP,
  CHUNK_MODE_ADAPTIVE,
  CHUNK_MODE_FIXED,
  ReaderSession,
  assembleChunkText,
  type ChunkText,
  type ReaderOptions,
} from './reader';
import { SpeakerTurns, UNNAMED_SPEAKER } from './speakers';
import {
  CLAUSE_PAUSE_MULTIPLIER,
  SENTENCE_PAUSE_MULTIPLIER,
  SPEAKER_PAUSE_MULTIPLIER,
  WARM_UP_START_MULTIPLIER,
  WARM_UP_WORD_COUNT,
  wpmToDelayMs,
} from './timing';

// Two desktop tests change something inside the reader module for one test
// (pytest's monkeypatch): the speaker pause multiplier, and the word count
// the speaker scan reports. Here the reader's two imports are wrapped for
// this file, and they behave as the real ones until a test sets a value.
const patched = vi.hoisted(() => ({ speakerPause: null as number | null, extraWords: 0 }));

vi.mock('./timing', async (importOriginal) => {
  const real = await importOriginal<typeof import('./timing')>();
  return {
    ...real,
    get SPEAKER_PAUSE_MULTIPLIER() {
      return patched.speakerPause ?? real.SPEAKER_PAUSE_MULTIPLIER;
    },
  };
});

vi.mock('./speakers', async (importOriginal) => {
  const real = await importOriginal<typeof import('./speakers')>();
  return {
    ...real,
    scanSpeakers(rawText: string) {
      const scan = real.scanSpeakers(rawText);
      return { wordCount: scan.wordCount + patched.extraWords, hits: scan.hits };
    },
  };
});

afterEach(() => {
  patched.speakerPause = null;
  patched.extraWords = 0;
});

function read(text: string, options: ReaderOptions = {}): ReaderSession {
  return new ReaderSession(text, options);
}

/** The whole word of a frame, the way the reader shows it. */
function wordOf(frame: OrpWord | null): string | null {
  return frame === null ? null : frame.before + frame.focus + frame.after;
}

/** "word0 word1 ..." with this many words. */
function numberedWords(count: number): string {
  return Array.from({ length: count }, (_, i) => `word${i}`).join(' ');
}

describe('test_reader.py', () => {
  // Construction and the full pipeline

  test('composes_parser_tokenizer_and_orp_correctly', () => {
    // An end to end check that the parser, tokenizer and ORP modules are
    // wired together correctly. The timestamp should be stripped, the text
    // split into words, and each word split at its ORP.
    const session = read('[00:00:01] Welcome to the show.');
    expect(session.totalWords).toBe(4);
    expect(wordOf(session.currentFrame())).toBe('Welcome');
  });

  test('default_wpm_is_300', () => {
    expect(read('Hello there').wpm).toBe(300);
  });

  test('starts_at_index_0_by_default', () => {
    const session = read('Hello there');
    expect(session.index).toBe(0);
    expect(session.isFinished).toBe(false);
  });

  test('start_index_is_respected', () => {
    const session = read('one two three four five', { startIndex: 2 });
    expect(session.index).toBe(2);
    expect(wordOf(session.currentFrame())).toBe('three');
  });

  test('start_index_beyond_word_count_clamps_to_finished', () => {
    // Should land safely on finished instead of crashing or going out of range.
    const session = read('one two three', { startIndex: 99 });
    expect(session.index).toBe(session.totalWords);
    expect(session.isFinished).toBe(true);
  });

  test('negative_start_index_clamps_to_zero', () => {
    // A negative startIndex shouldn't happen in normal use, but it could
    // come from a hand edited or corrupted data file. In Python a negative
    // list index counts from the end, so without the clamp the reader would
    // quietly show the wrong word.
    const session = read('one two three', { startIndex: -5 });
    expect(session.index).toBe(0);
  });

  // total_words

  test('total_words_matches_word_count', () => {
    expect(read('one two three four').totalWords).toBe(4);
  });

  test('total_words_zero_for_empty_transcript', () => {
    expect(read('').totalWords).toBe(0);
  });

  // is_finished

  test('is_finished_false_at_start', () => {
    expect(read('one two three').isFinished).toBe(false);
  });

  test('is_finished_true_after_advancing_past_last_word', () => {
    const session = read('one two');
    session.advance();
    session.advance();
    expect(session.isFinished).toBe(true);
  });

  test('empty_transcript_is_immediately_finished', () => {
    expect(read('').isFinished).toBe(true);
  });

  // current_frame

  test('current_frame_returns_none_when_finished', () => {
    const session = read('one');
    session.advance();
    expect(session.currentFrame()).toBeNull();
  });

  test('current_frame_none_for_empty_transcript', () => {
    expect(read('').currentFrame()).toBeNull();
  });

  test('current_frame_advances_through_every_word_in_order', () => {
    const session = read('one two three');
    const seen: (string | null)[] = [];
    while (!session.isFinished) {
      seen.push(wordOf(session.currentFrame()));
      session.advance();
    }
    expect(seen).toEqual(['one', 'two', 'three']);
  });

  // current_delay_ms

  test('current_delay_ms_matches_wpm', () => {
    expect(read('hello', { wpm: 300 }).currentDelayMs()).toBe(200); // 60000 / 300
  });

  test('current_delay_ms_updates_live_after_set_wpm', () => {
    const session = read('hello', { wpm: 300 });
    expect(session.currentDelayMs()).toBe(200);
    session.setWpm(600);
    // uses the new speed right away, nothing is cached
    expect(session.currentDelayMs()).toBe(100);
  });

  // current_delay_ms: pauses after punctuation

  test('current_delay_ms_applies_clause_pause_after_comma', () => {
    // The base delay is 200ms and "wait," ends in a clause mark, so 200 * 1.5
    expect(read('wait, go', { wpm: 300 }).currentDelayMs()).toBe(300);
  });

  test('current_delay_ms_applies_sentence_pause_after_period', () => {
    // The base delay is 200ms and "Stop." ends in a sentence mark, so 200 * 2.5
    expect(read('Stop. Go', { wpm: 300 }).currentDelayMs()).toBe(500);
  });

  test('current_delay_ms_pace_tracks_position_as_session_advances', () => {
    // The paces are built once next to the frames and indexed the same
    // way. This walks all three words to make sure the pause follows the
    // right word as playback moves on, not just at one fixed index.
    const session = read('Wait, go now.', { wpm: 300 });
    const delays: number[] = [];
    while (!session.isFinished) {
      delays.push(session.currentDelayMs());
      session.advance();
    }
    expect(delays).toEqual([300, 200, 500]); // clause, none, sentence
  });

  test('current_delay_ms_for_finished_session_returns_unmultiplied_base', () => {
    // A finished session returns the plain base delay. The last word ("Hi.")
    // ends a sentence, but once finished there's no word left to pause on.
    const session = read('Hi.', { wpm: 300 });
    session.advance();
    expect(session.isFinished).toBe(true);
    expect(session.currentDelayMs()).toBe(200);
  });

  test('current_delay_ms_for_all_punctuation_token_still_paces_correctly', () => {
    // "..." becomes its own word with no letters or digits in it. See
    // punctuation.ts and the empty core branch in the ReaderSession
    // constructor. This makes sure that branch still gives the token a
    // sentence pause instead of quietly treating it as no pause.
    const session = read('Wait ... go', { wpm: 300, startIndex: 1 });
    expect(session.currentDelayMs()).toBe(500);
  });

  // current_delay_ms: slowing down for long words

  const paced: ReaderOptions = { wpm: 300, lengthPacingEnabled: true };

  test('length_pacing_disabled_by_default', () => {
    // no slowdown, even for a 14 letter word
    expect(read('responsibility here', { wpm: 300 }).currentDelayMs()).toBe(200);
  });

  test('length_pacing_enabled_slows_a_long_word', () => {
    // base 200 * 1.7 (length band 4)
    expect(read('responsibility here', paced).currentDelayMs()).toBe(340);
  });

  test('length_pacing_enabled_leaves_a_short_word_unaffected', () => {
    expect(read('go now', paced).currentDelayMs()).toBe(200);
  });

  test('length_pacing_enabled_applies_medium_band', () => {
    // base 200 * 1.2 (length band 2, "reading" has 7 letters)
    expect(read('reading now', paced).currentDelayMs()).toBe(240);
  });

  test('length_pacing_takes_the_larger_multiplier_not_both', () => {
    // When a word is long and also ends a sentence or clause, only the
    // larger of the two pauses applies. They don't stack. "friendship," is
    // length band 3 (1.45x, 290ms) and ends in a clause mark (1.5x, 300ms),
    // so the clause pause wins because it's bigger.
    expect(read('friendship, right', paced).currentDelayMs()).toBe(300);
  });

  test('length_pacing_sentence_pause_still_wins_over_a_very_long_word', () => {
    // "responsibility." is length band 4 (1.7x, 340ms) and ends a sentence
    // (2.5x, 500ms), so the sentence pause wins.
    expect(read('responsibility. Right', paced).currentDelayMs()).toBe(500);
  });

  test('length_pacing_can_now_beat_a_clause_pause_for_a_very_long_word', () => {
    // The very long word multiplier (1.7x) is bigger than the clause pause
    // (1.5x). "responsibility" is length band 4 (340ms), which beats its
    // own trailing comma (300ms). This checks that the larger one is
    // picked here and it isn't stuck on punctuation.
    expect(read('responsibility, right', paced).currentDelayMs()).toBe(340);
  });

  test('hyphen_bonus_can_tip_length_pacing_past_a_clause_pause', () => {
    // By its raw length of 10, "well-known," would be band 3 (1.45x,
    // 290ms), which is less than its comma's clause pause (1.5x, 300ms),
    // so punctuation would normally win. The hyphen bonus raises its
    // effective length to 14, which is band 4 (1.7x, 340ms), so the word's
    // length wins instead. This is the case hyphen aware pacing was added
    // for, where a hyphenated word gets more time than its raw length alone
    // would give it.
    expect(read('well-known, right', paced).currentDelayMs()).toBe(340);
  });

  test('length_pacing_live_toggle_via_set_length_pacing_enabled', () => {
    const session = read('responsibility here', { wpm: 300 });
    expect(session.currentDelayMs()).toBe(200);
    session.setLengthPacingEnabled(true);
    expect(session.currentDelayMs()).toBe(340);
  });

  test('length_pacing_for_finished_session_returns_unmultiplied_base', () => {
    const session = read('responsibility.', paced);
    session.advance();
    expect(session.isFinished).toBe(true);
    expect(session.currentDelayMs()).toBe(200);
  });

  // current_delay_ms: extra length for hyphenated words

  test('hyphenated_word_reaches_a_higher_band_than_its_raw_length_alone', () => {
    // "sub-terrain" is 11 characters including the hyphen, which alone is
    // band 3 (1.45x, 290ms). The hyphen bonus adds 4 characters, for an
    // effective length of 15, which is band 4 (1.7x, 340ms).
    expect(read('sub-terrain here', paced).currentDelayMs()).toBe(340);
  });

  test('plain_word_of_the_same_raw_length_does_not_get_the_hyphen_bonus', () => {
    // "comfortable" is also 11 characters but has no hyphen, so it stays in
    // band 3. That shows the bonus only applies to hyphenated words.
    expect(read('comfortable here', paced).currentDelayMs()).toBe(290);
  });

  test('multiple_hyphens_each_add_their_own_bonus', () => {
    // "step-by-step" has two hyphens inside it and both count, giving an
    // effective length of 12 + 2*4 = 20. That's well past band 4's 14
    // letter start, so it gets the same top multiplier one hyphen would.
    expect(read('step-by-step here', paced).currentDelayMs()).toBe(340);
  });

  test('hyphen_bonus_does_not_apply_when_length_pacing_is_disabled', () => {
    expect(read('sub-terrain here', { wpm: 300 }).currentDelayMs()).toBe(200);
  });

  // advance

  test('advance_moves_to_next_word', () => {
    const session = read('one two three');
    session.advance();
    expect(session.index).toBe(1);
  });

  test('advance_does_nothing_once_finished', () => {
    const session = read('one');
    session.advance(); // now finished
    session.advance(); // should do nothing
    session.advance();
    expect(session.index).toBe(1);
    expect(session.isFinished).toBe(true);
  });

  // seek

  test('seek_forward_moves_correct_number_of_words', () => {
    const session = read('one two three four five six');
    session.seek(3);
    expect(session.index).toBe(3);
  });

  test('seek_backward_moves_correct_number_of_words', () => {
    const session = read('one two three four five six', { startIndex: 4 });
    session.seek(-2);
    expect(session.index).toBe(2);
  });

  test('seek_forward_clamps_at_total_words', () => {
    const session = read('one two three');
    session.seek(100);
    expect(session.index).toBe(session.totalWords);
    expect(session.isFinished).toBe(true);
  });

  test('seek_backward_clamps_at_zero', () => {
    const session = read('one two three', { startIndex: 1 });
    session.seek(-100);
    expect(session.index).toBe(0);
  });

  test('seek_backward_from_finished_state_unfinishes_session', () => {
    const session = read('one two three');
    session.seek(100); // jump to the end so the session is finished
    expect(session.isFinished).toBe(true);
    session.seek(-1);
    expect(session.isFinished).toBe(false);
    expect(session.index).toBe(session.totalWords - 1);
  });

  test('seek_zero_is_a_no_op', () => {
    const session = read('one two three', { startIndex: 1 });
    session.seek(0);
    expect(session.index).toBe(1);
  });

  // seek_to: absolute positioning (used by the progress scrubber)

  test('seek_to_moves_to_absolute_index', () => {
    const session = read('one two three four five', { startIndex: 1 });
    session.seekTo(3);
    expect(session.index).toBe(3);
  });

  test('seek_to_zero_from_middle', () => {
    const session = read('one two three four', { startIndex: 2 });
    session.seekTo(0);
    expect(session.index).toBe(0);
  });

  test('seek_to_clamps_past_the_end_to_finished', () => {
    const session = read('one two three');
    session.seekTo(99);
    expect(session.index).toBe(session.totalWords);
    expect(session.isFinished).toBe(true);
  });

  test('seek_to_clamps_negative_to_zero', () => {
    const session = read('one two three', { startIndex: 2 });
    session.seekTo(-5);
    expect(session.index).toBe(0);
  });

  test('seek_to_current_index_is_a_no_op', () => {
    const session = read('one two three', { startIndex: 1 });
    session.seekTo(1);
    expect(session.index).toBe(1);
  });

  test('seek_to_from_finished_unfinishes_session', () => {
    const session = read('one two three');
    session.seekTo(99); // jump to the end so the session is finished
    expect(session.isFinished).toBe(true);
    session.seekTo(1);
    expect(session.isFinished).toBe(false);
    expect(session.index).toBe(1);
  });

  test('seek_to_does_not_restart_the_warm_up_ramp', () => {
    // The scrubber must leave the warm-up ramp alone, like the skip
    // buttons: seeking changes the position, not how many words have been
    // shown this session, so the pace after a seek is whatever the ramp
    // had already reached. All words here are plain and unpunctuated with
    // length pacing off, so warm-up is the only thing shaping the delay.
    const session = read(numberedWords(30), { wpm: 300, warmUpEnabled: true });
    session.advance();
    session.advance();
    const delayBefore = session.currentDelayMs();
    session.seekTo(20);
    expect(session.currentDelayMs()).toBe(delayBefore);
  });

  // remaining_ms: estimated time left, summed from the paced per-word delays

  test('remaining_ms_plain_words_is_count_times_base', () => {
    // base at 300 wpm is 200ms; plain words carry no pacing pause, so
    // remaining is simply words-left * base.
    expect(read('one two three four', { wpm: 300 }).remainingMs()).toBe(4 * 200);
  });

  test('remaining_ms_shrinks_as_you_advance', () => {
    const session = read('one two three four', { wpm: 300 });
    session.advance();
    session.advance();
    expect(session.remainingMs()).toBe(2 * 200);
  });

  test('remaining_ms_is_zero_when_finished', () => {
    const session = read('one two', { wpm: 300 });
    session.advance();
    session.advance();
    expect(session.isFinished).toBe(true);
    expect(session.remainingMs()).toBe(0);
  });

  test('remaining_ms_includes_sentence_pause', () => {
    // "Stop." ends a sentence (2.5x -> 500ms at base 200), "Go" is plain
    // (200ms), so from the start the estimate is 700.
    expect(read('Stop. Go', { wpm: 300 }).remainingMs()).toBe(500 + 200);
  });

  test('remaining_ms_counts_length_pause_only_when_enabled', () => {
    // "responsibility" is length band 4. Off, it's a plain 200ms word, so
    // remaining is 200 + 200 = 400. On, it's 1.7x -> 340, so 340 + 200 = 540.
    expect(read('responsibility here', { wpm: 300 }).remainingMs()).toBe(400);
    expect(read('responsibility here', paced).remainingMs()).toBe(540);
  });

  test('remaining_ms_tracks_a_live_length_pacing_toggle', () => {
    const session = read('responsibility here', { wpm: 300 });
    expect(session.remainingMs()).toBe(400);
    session.setLengthPacingEnabled(true);
    expect(session.remainingMs()).toBe(540);
  });

  test('remaining_ms_scales_with_wpm', () => {
    const session = read('one two three four', { wpm: 300 });
    expect(session.remainingMs()).toBe(800);
    session.setWpm(600); // base halves to 100ms
    expect(session.remainingMs()).toBe(400);
  });

  test('remaining_ms_ignores_warm_up', () => {
    // Warm-up would slow the first words during playback, but the estimate
    // deliberately excludes it, so it reads the same either way.
    const plain = read('one two three four', { wpm: 300 });
    const warmed = read('one two three four', { wpm: 300, warmUpEnabled: true });
    expect(warmed.remainingMs()).toBe(plain.remainingMs());
  });

  test('remaining_ms_updates_after_seek', () => {
    const session = read('one two three four five six', { wpm: 300 });
    session.seekTo(4);
    expect(session.remainingMs()).toBe(2 * 200);
  });

  test('remaining_ms_empty_transcript_is_zero', () => {
    expect(read('', { wpm: 300 }).remainingMs()).toBe(0);
  });

  // peripheral_context: the words around the current one for the context ribbon

  test('peripheral_context_middle_window', () => {
    const session = read('one two three four five', { startIndex: 2 });
    expect(session.peripheralContext(1, 2)).toEqual({
      before: ['two'],
      current: 'three',
      after: ['four', 'five'],
    });
  });

  test('peripheral_context_at_start_has_no_before', () => {
    const session = read('one two three four five');
    expect(session.peripheralContext(1, 2)).toEqual({
      before: [],
      current: 'one',
      after: ['two', 'three'],
    });
  });

  test('peripheral_context_near_end_truncates_after', () => {
    const session = read('one two three four five', { startIndex: 4 });
    expect(session.peripheralContext(1, 2)).toEqual({
      before: ['four'],
      current: 'five',
      after: [],
    });
  });

  test('peripheral_context_clamps_counts_to_whats_available', () => {
    const session = read('one two three', { startIndex: 1 });
    expect(session.peripheralContext(5, 5)).toEqual({
      before: ['one'],
      current: 'two',
      after: ['three'],
    });
  });

  test('peripheral_context_zero_counts_gives_only_current', () => {
    const session = read('one two three', { startIndex: 1 });
    expect(session.peripheralContext(0, 0)).toEqual({ before: [], current: 'two', after: [] });
  });

  test('peripheral_context_negative_counts_treated_as_zero', () => {
    const session = read('one two three', { startIndex: 1 });
    expect(session.peripheralContext(-3, -1)).toEqual({ before: [], current: 'two', after: [] });
  });

  test('peripheral_context_finished_session_is_all_empty', () => {
    const session = read('one two');
    session.advance();
    session.advance();
    expect(session.isFinished).toBe(true);
    expect(session.peripheralContext(1, 2)).toEqual({ before: [], current: null, after: [] });
  });

  test('peripheral_context_empty_transcript_is_all_empty', () => {
    expect(read('').peripheralContext(1, 2)).toEqual({ before: [], current: null, after: [] });
  });

  test('peripheral_context_keeps_punctuation_attached_to_words', () => {
    // Leading and trailing punctuation folds into a frame's word, so the
    // ribbon shows it just as the reader does.
    const session = read('Wait, go now.', { startIndex: 1 });
    expect(session.peripheralContext(1, 1)).toEqual({
      before: ['Wait,'],
      current: 'go',
      after: ['now.'],
    });
  });

  test('peripheral_context_current_matches_current_frame_word', () => {
    const session = read('alpha beta gamma', { startIndex: 1 });
    expect(session.peripheralContext(1, 1).current).toBe(wordOf(session.currentFrame()));
  });

  test('peripheral_context_does_not_move_the_position', () => {
    const session = read('one two three four', { startIndex: 2 });
    session.peripheralContext(2, 2);
    expect(session.index).toBe(2);
  });

  test('peripheral_context_tracks_position_as_it_advances', () => {
    const session = read('one two three four five');
    session.advance(); // now on "two"
    expect(session.peripheralContext(1, 1)).toEqual({
      before: ['one'],
      current: 'two',
      after: ['three'],
    });
  });

  // reset

  test('reset_returns_to_index_zero', () => {
    const session = read('one two three', { startIndex: 2 });
    session.reset();
    expect(session.index).toBe(0);
  });

  test('reset_unfinishes_a_finished_session', () => {
    const session = read('one two');
    session.advance();
    session.advance();
    expect(session.isFinished).toBe(true);
    session.reset();
    expect(session.isFinished).toBe(false);
  });

  // set_wpm

  test('set_wpm_updates_wpm_attribute', () => {
    const session = read('hello', { wpm: 300 });
    session.setWpm(450);
    expect(session.wpm).toBe(450);
  });

  // current_delay_ms: warm-up (ease-in) ramp
  // Expected values follow WARM_UP_START_MULTIPLIER and WARM_UP_WORD_COUNT in
  // timing.ts, so the tests can't drift if those are later tuned. All use
  // plain, unpunctuated words with length pacing off, so the only multiplier
  // in play is the warm-up one, except where noted.

  const START = WARM_UP_START_MULTIPLIER;
  const warm: ReaderOptions = { wpm: 300, warmUpEnabled: true };

  test('warm_up_disabled_by_default', () => {
    expect(read('one two', { wpm: 300 }).currentDelayMs()).toBe(200);
  });

  test('warm_up_first_word_is_slowest', () => {
    expect(read('one two three', warm).currentDelayMs()).toBe(pyRound(200 * START));
  });

  test('warm_up_ramps_down_to_base_over_the_word_count', () => {
    const session = read(numberedWords(WARM_UP_WORD_COUNT + 5), warm);
    const delays: number[] = [];
    while (!session.isFinished) {
      delays.push(session.currentDelayMs());
      session.advance();
    }
    expect(delays[0]).toBe(pyRound(200 * START));
    expect(delays.every((delay, i) => i === 0 || (delays[i - 1] ?? 0) >= delay)).toBe(true);
    expect(delays[WARM_UP_WORD_COUNT]).toBe(200); // ramp is over by here
    expect(delays.at(-1)).toBe(200);
  });

  test('warm_up_composes_with_sentence_pause', () => {
    // First word ends a sentence (2.5x -> 500ms), and warm-up scales that up
    // again at the very start of the session.
    expect(read('Stop. go on', warm).currentDelayMs()).toBe(pyRound(500 * START));
  });

  test('warm_up_counts_words_shown_not_transcript_index', () => {
    // Starting mid-transcript still eases in from the first shown word, since
    // the ramp counts words shown this session, not the transcript position.
    const session = read(numberedWords(30), { ...warm, startIndex: 10 });
    expect(session.currentDelayMs()).toBe(pyRound(200 * START));
  });

  test('warm_up_live_toggle_via_set_warm_up_enabled', () => {
    const session = read('one two three', { wpm: 300 });
    expect(session.currentDelayMs()).toBe(200);
    session.setWarmUpEnabled(true);
    expect(session.currentDelayMs()).toBe(pyRound(200 * START));
  });

  test('warm_up_reset_restarts_the_ramp', () => {
    const session = read(numberedWords(30), warm);
    for (let i = 0; i < WARM_UP_WORD_COUNT; i += 1) {
      session.advance();
    }
    expect(session.currentDelayMs()).toBe(200); // past the ramp
    session.reset();
    expect(session.currentDelayMs()).toBe(pyRound(200 * START)); // eased in again from the top
  });

  test('warm_up_finished_session_returns_unmultiplied_base', () => {
    const session = read('Hi.', warm);
    session.advance();
    expect(session.isFinished).toBe(true);
    expect(session.currentDelayMs()).toBe(200);
  });
});

/** How many words the warm-up ramp has counted. Private, as in Python. */
function wordsShown(session: ReaderSession): number {
  return (session as unknown as { wordsShown: number }).wordsShown;
}

function dict(list: ReadonlyMap<string, string> | null): Record<string, string> | null {
  return list === null ? null : Object.fromEntries(list);
}

/** What Python's SpeakerTurns(starts, speakers) equality compares. */
function turnsOf(turns: SpeakerTurns): [readonly number[], readonly string[]] {
  return [turns.starts, turns.speakers];
}

const NO_TURNS = turnsOf(new SpeakerTurns());

// Only the tests of ReaderSession, assembleChunkText and the transcript
// defaults are here. The other 25 tests of test_chunking.py are about the
// settings store, the transcript store and the storage format, and wait
// for phase 3.
describe('test_chunking.py', () => {
  // Data model.

  test('new_transcript_defaults_to_chunking_off_size_two', () => {
    expect(TRANSCRIPT_DEFAULTS.chunkingEnabled).toBe(false);
    expect(TRANSCRIPT_DEFAULTS.chunkSize).toBe(2);
  });

  test('new_transcript_defaults_to_fixed_mode_target_30', () => {
    expect(TRANSCRIPT_DEFAULTS.chunkMode).toBe('fixed');
    expect(TRANSCRIPT_DEFAULTS.chunkCharTarget).toBe(30);
  });

  // Grouping and chunk-aware navigation in ReaderSession.

  test('grouping_splits_by_size_with_short_final_chunk', () => {
    const s = read('one two three four five', { chunkEnabled: true, chunkSize: 2 });
    expect(s.chunkRanges()).toEqual([
      [0, 2],
      [2, 4],
      [4, 5],
    ]);
  });

  test('grouping_breaks_at_a_sentence_end', () => {
    const s = read('one two. three four five six', { chunkEnabled: true, chunkSize: 3 });
    expect(s.chunkRanges()).toEqual([
      [0, 2],
      [2, 5],
      [5, 6],
    ]);
  });

  test('grouping_respects_the_character_cap', () => {
    expect(CHUNK_CHAR_CAP).toBe(30);
    const word = 'a'.repeat(10);
    const s = read([word, word, word].join(' '), { chunkEnabled: true, chunkSize: 5 });
    expect(s.chunkRanges()).toEqual([
      [0, 2],
      [2, 3],
    ]);
  });

  test('grouping_never_makes_an_empty_chunk_for_an_overlong_word', () => {
    const s = read('x'.repeat(40) + ' short', { chunkEnabled: true, chunkSize: 3 });
    expect(s.chunkRanges()).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  test('disabled_groups_every_word_on_its_own', () => {
    const s = read('one two three', { chunkEnabled: false });
    expect(s.chunkRanges()).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  test('advance_moves_by_whole_chunks', () => {
    const s = read('one two three four five', { chunkEnabled: true, chunkSize: 2 });
    expect(s.index).toBe(0);
    s.advance();
    expect(s.index).toBe(2);
    s.advance();
    expect(s.index).toBe(4);
    s.advance();
    expect(s.index).toBe(5);
    expect(s.isFinished).toBe(true);
  });

  test('advance_ages_warmup_by_the_chunk_word_count', () => {
    const s = read('one two three four five', { chunkEnabled: true, chunkSize: 2 });
    s.advance();
    expect(wordsShown(s)).toBe(2);
    s.advance();
    expect(wordsShown(s)).toBe(4);
    s.advance();
    expect(wordsShown(s)).toBe(5);
  });

  test('seek_snaps_to_the_enclosing_chunk_start', () => {
    const s = read('w0 w1 w2 w3 w4 w5', { chunkEnabled: true, chunkSize: 2 });
    s.seekTo(3);
    expect(s.index).toBe(2);
    s.seekTo(5);
    expect(s.index).toBe(4);
    s.seekTo(0);
    expect(s.index).toBe(0);
  });

  test('start_index_snaps_to_a_chunk_boundary', () => {
    const s = read('w0 w1 w2 w3', { startIndex: 3, chunkEnabled: true, chunkSize: 2 });
    expect(s.index).toBe(2);
  });

  test('current_chunk_returns_the_member_frames', () => {
    const s = read('alpha beta gamma', { chunkEnabled: true, chunkSize: 2 });
    expect(s.currentChunk()?.map(wordOf)).toEqual(['alpha', 'beta']);
    expect(s.currentChunkBounds()).toEqual([0, 2]);
  });

  test('current_chunk_delay_equals_the_sum_of_its_words_with_warmup', () => {
    const text = 'alpha beta gamma delta';
    const chunked = read(text, { wpm: 300, chunkEnabled: true, chunkSize: 2, warmUpEnabled: true });
    const single = read(text, { wpm: 300, warmUpEnabled: true });

    let expectedFirst = single.currentDelayMs();
    single.advance();
    expectedFirst += single.currentDelayMs();
    single.advance();
    expect(chunked.currentChunkDelayMs()).toBe(expectedFirst);

    chunked.advance();
    let expectedSecond = single.currentDelayMs();
    single.advance();
    expectedSecond += single.currentDelayMs();
    single.advance();
    expect(chunked.currentChunkDelayMs()).toBe(expectedSecond);
  });

  test('remaining_ms_is_unaffected_by_chunking', () => {
    const text = 'one two three four five six';
    const chunked = read(text, { wpm: 300, chunkEnabled: true, chunkSize: 3 });
    expect(chunked.remainingMs()).toBe(read(text, { wpm: 300 }).remainingMs());
  });

  test('disabled_session_matches_single_word_stepping', () => {
    const s = read('one two three four', { chunkEnabled: false });
    for (let expectedIndex = 0; expectedIndex < 4; expectedIndex += 1) {
      expect(s.index).toBe(expectedIndex);
      expect(s.currentChunk()).toHaveLength(1);
      expect(s.currentChunkDelayMs()).toBe(s.currentDelayMs());
      s.advance();
    }
    expect(s.isFinished).toBe(true);
  });

  // Chunk-aware peripheral context for the reader's ribbon.

  test('chunk_peripheral_context_surrounds_the_whole_chunk', () => {
    const s = read('w0 w1 w2 w3 w4 w5', { chunkEnabled: true, chunkSize: 2 });
    s.advance(); // now on chunk (2, 4)
    const ctx = s.chunkPeripheralContext(2, 2);
    expect(ctx.current).toBe('w2'); // the chunk's first word
    expect(ctx.before).toEqual(['w0', 'w1']); // the words before the chunk
    expect(ctx.after).toEqual(['w4', 'w5']); // the words after the chunk, skipping w3 (in the chunk)
  });

  test('chunk_peripheral_context_clamps_at_the_ends', () => {
    const s = read('w0 w1 w2 w3', { chunkEnabled: true, chunkSize: 2 }); // (0,2)(2,4)
    expect(s.chunkPeripheralContext(3, 3)).toEqual({
      before: [],
      current: 'w0',
      after: ['w2', 'w3'],
    });
  });

  test('chunk_peripheral_context_matches_plain_when_disabled', () => {
    const s = read('one two three four five', { chunkEnabled: false });
    s.seekTo(2);
    expect(s.chunkPeripheralContext(2, 2)).toEqual(s.peripheralContext(2, 2));
  });

  // Adaptive grouping in ReaderSession.

  test('adaptive_constants', () => {
    expect(ADAPTIVE_MAX_WORDS).toBe(6);
    expect(CHUNK_MODE_FIXED).toBe('fixed');
    expect(CHUNK_MODE_ADAPTIVE).toBe('adaptive');
  });

  function adaptive(charTarget: number): ReaderOptions {
    return { chunkEnabled: true, chunkMode: CHUNK_MODE_ADAPTIVE, chunkCharTarget: charTarget };
  }

  test('adaptive_fills_to_the_char_target', () => {
    // Four 4-char words. With a 14-char target the first three fit
    // (4 + 1 + 4 + 1 + 4 = 14), the fourth would overflow (19 > 14).
    expect(read('aaaa bbbb cccc dddd', adaptive(14)).chunkRanges()).toEqual([
      [0, 3],
      [3, 4],
    ]);
  });

  test('adaptive_word_ceiling_caps_short_words', () => {
    // Eight one-char words with a wide target: the width never binds, so the
    // ADAPTIVE_MAX_WORDS ceiling (6) closes the first chunk.
    const text = Array.from({ length: 8 }, () => 'a').join(' ');
    expect(read(text, adaptive(60)).chunkRanges()).toEqual([
      [0, 6],
      [6, 8],
    ]);
  });

  test('adaptive_breaks_at_a_sentence', () => {
    // A sentence end closes the chunk even well under the width target.
    expect(read('one two. three four five', adaptive(60)).chunkRanges()).toEqual([
      [0, 2],
      [2, 5],
    ]);
  });

  test('adaptive_overlong_first_word_is_its_own_chunk', () => {
    // A first word longer than the target still forms a one-word chunk rather
    // than an empty one; the next word starts fresh.
    expect(read('x'.repeat(20) + ' short', adaptive(15)).chunkRanges()).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  test('fixed_mode_grouping_is_unchanged', () => {
    // Explicit fixed mode matches the v1 size-2 grouping exactly.
    const s = read('one two three four five', {
      chunkEnabled: true,
      chunkSize: 2,
      chunkMode: CHUNK_MODE_FIXED,
    });
    expect(s.chunkRanges()).toEqual([
      [0, 2],
      [2, 4],
      [4, 5],
    ]);
  });

  test('disabled_overrides_adaptive_mode', () => {
    // Chunking off means single words no matter what the mode says.
    const s = read('one two three', { ...adaptive(60), chunkEnabled: false });
    expect(s.chunkRanges()).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  test('set_chunking_switches_mode_in_place', () => {
    const s = read('aaaa bbbb cccc dddd', {
      chunkEnabled: true,
      chunkSize: 2,
      chunkMode: CHUNK_MODE_FIXED,
    });
    expect(s.chunkRanges()).toEqual([
      [0, 2],
      [2, 4],
    ]);
    s.setChunking(true, 2, CHUNK_MODE_ADAPTIVE, 14);
    expect(s.chunkMode).toBe(CHUNK_MODE_ADAPTIVE);
    expect(s.chunkCharTarget).toBe(14);
    expect(s.chunkRanges()).toEqual([
      [0, 3],
      [3, 4],
    ]);
  });

  test('set_chunking_without_mode_keeps_current_mode', () => {
    // The v1 two-arg call path (toggle/fixed-size only) must not clobber an
    // adaptive transcript's mode or width.
    const s = read('aaaa bbbb cccc dddd', adaptive(14));
    expect(s.chunkRanges()).toEqual([
      [0, 3],
      [3, 4],
    ]);
    s.setChunking(false, 2); // disable with a two-arg call
    expect(s.chunkRanges()).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
    s.setChunking(true, 2); // re-enable, still no mode passed
    expect(s.chunkMode).toBe(CHUNK_MODE_ADAPTIVE);
    expect(s.chunkCharTarget).toBe(14);
    expect(s.chunkRanges()).toEqual([
      [0, 3],
      [3, 4],
    ]);
  });

  // Assembled chunk text, shared by the reader's drawing and the font-fit sizing.

  function whole(text: ChunkText): string {
    return text.before + text.focus + text.after;
  }

  test('assemble_chunk_text_single_frame_is_its_own_split', () => {
    const chunk = read('hello', { chunkEnabled: false }).currentChunk() ?? [];
    expect(chunk).toHaveLength(1);
    const text = assembleChunkText(chunk);
    // The three parts reconstruct the whole word, and the focus is a single letter.
    expect(whole(text)).toBe('hello');
    expect(text.focus).toHaveLength(1);
  });

  test('assemble_chunk_text_trails_later_words_in_the_after_part', () => {
    const chunk =
      read('alpha beta gamma', { chunkEnabled: true, chunkSize: 3 }).currentChunk() ?? [];
    expect(chunk).toHaveLength(3);
    const text = assembleChunkText(chunk);
    // Only the first word keeps its own split; the rest trail in the after part.
    expect(text.before).toBe(chunk[0]?.before);
    expect(text.focus).toBe(chunk[0]?.focus);
    // before + focus + after reconstructs the whole chunk, words space-joined.
    expect(whole(text)).toBe('alpha beta gamma');
  });

  test('assemble_chunk_text_empty_is_blank', () => {
    expect(assembleChunkText([])).toEqual({ before: '', focus: '', after: '' });
  });

  test('chunk_texts_covers_every_chunk_in_reading_order', () => {
    const s = read('w0 w1 w2 w3 w4', { chunkEnabled: true, chunkSize: 2 });
    const ranges = s.chunkRanges();
    const texts = s.chunkTexts();
    expect(texts).toHaveLength(ranges.length);
    // Each one reconstructs exactly the words of its range, space-joined.
    ranges.forEach(([start, end], i) => {
      const expected = s.frames.slice(start, end).map(wordOf).join(' ');
      expect(whole(texts[i] ?? { before: '', focus: '', after: '' })).toBe(expected);
    });
  });

  test('chunk_texts_matches_the_current_chunk_assembly', () => {
    // chunkTexts() must agree with assembling the on-screen chunk directly, so
    // the whole-transcript measurement and the live drawing cannot drift apart.
    const s = read('alpha beta gamma delta', { chunkEnabled: true, chunkSize: 2 });
    expect(s.chunkTexts()[0]).toEqual(assembleChunkText(s.currentChunk() ?? []));
    s.advance();
    expect(s.chunkTexts()[1]).toEqual(assembleChunkText(s.currentChunk() ?? []));
  });

  test('chunk_texts_one_entry_per_word_when_disabled', () => {
    const texts = read('one two three', { chunkEnabled: false }).chunkTexts();
    expect(texts).toHaveLength(3);
    expect(texts.map(whole)).toEqual(['one', 'two', 'three']);
  });
});

// Only the two tests of a finished ReaderSession. The rest of
// test_edge_cases.py drives the desktop windows.
describe('test_edge_cases.py', () => {
  function finished(options: ReaderOptions): ReaderSession {
    const session = read('one two three four five', { wpm: 300, ...options });
    while (!session.isFinished) {
      session.advance();
    }
    return session;
  }

  test.each([false, true])('a_finished_reading_has_no_chunk_on_screen %j', (chunked) => {
    const session = finished({ chunkEnabled: chunked, chunkSize: 2 });
    expect(session.currentFrame()).toBeNull();
    expect(session.currentChunk()).toBeNull();
    expect(session.currentChunkBounds()).toBeNull();
  });

  test.each([false, true])(
    'a_finished_reading_waits_one_plain_word_before_anything_else %j',
    (chunked) => {
      // Nothing is on screen to time, so both delays fall back to one word at
      // the reading speed, with no pauses for punctuation or warm-up added.
      const session = finished({ chunkEnabled: chunked, chunkSize: 2, warmUpEnabled: true });
      expect(session.currentDelayMs()).toBe(wpmToDelayMs(300));
      expect(session.currentChunkDelayMs()).toBe(wpmToDelayMs(300));
    },
  );
});

// Speaker cues in the reading engine: who speaks where, the pause before a
// new speaker, chunks that never run into the next speaker, and turning
// cues on and off in place. How labels are found is in
// speakers.desktop.test.ts.
describe('test_reader_speaker_cues.py', () => {
  // 300 WPM: a plain word is 200 ms, a clause 300, a sentence end 500 and
  // the speaker pause 700.
  const WPM = 300;
  const BASE = wpmToDelayMs(WPM);
  const PLAIN = BASE;
  const CLAUSE = pyRound(BASE * CLAUSE_PAUSE_MULTIPLIER);
  const SENTENCE = pyRound(BASE * SENTENCE_PAUSE_MULTIPLIER);
  const SPEAKER = pyRound(BASE * SPEAKER_PAUSE_MULTIPLIER);

  // Words: 0 Interviewer: 1 So 2 how 3 start? | 4 Speaker 5 2: 6 In 7 a
  // 8 garage | 9 Interviewer: 10 Really. | 11 Speaker 12 2: 13 Yes
  const TEXT =
    'Interviewer: So how start?\nSpeaker 2: In a garage\nInterviewer: Really.\nSpeaker 2: Yes';
  const FOUR_TURNS = ['Interviewer', 'Speaker 2', 'Interviewer', 'Speaker 2'];
  const cues: ReaderOptions = { speakerCuesEnabled: true };

  function session(text: string = TEXT, options: ReaderOptions = {}): ReaderSession {
    return read(text, { wpm: WPM, ...options });
  }

  /** Every word's delay, read from the start (warm-up off, chunking off). */
  function delays(reading: ReaderSession): number[] {
    reading.reset();
    const found: number[] = [];
    while (!reading.isFinished) {
      found.push(reading.currentDelayMs());
      reading.advance();
    }
    return found;
  }

  function speakers(reading: ReaderSession): (string | null)[] {
    reading.reset();
    const found: (string | null)[] = [];
    while (!reading.isFinished) {
      found.push(reading.currentSpeaker);
      reading.advance();
    }
    return found;
  }

  // ---- Off by default ----

  test('cues_are_off_by_default', () => {
    const reading = session();
    expect(reading.speakerCuesEnabled).toBe(false);
    expect(reading.speakerCustom).toBeNull();
    expect(turnsOf(reading.speakerTurns)).toEqual(NO_TURNS);
    expect(reading.currentSpeaker).toBeNull();
  });

  test('with_cues_off_a_labelled_text_reads_as_it_always_did', () => {
    expect(delays(session())).toEqual([
      CLAUSE, PLAIN, PLAIN, SENTENCE,
      PLAIN, CLAUSE, PLAIN, PLAIN, PLAIN,
      CLAUSE, SENTENCE,
      PLAIN, CLAUSE, PLAIN,
    ]); // prettier-ignore
  });

  test('with_cues_off_a_custom_list_changes_nothing', () => {
    const withList = session(TEXT, { speakerCustom: { interviewer: 'Ann' } });
    expect(delays(withList)).toEqual(delays(session()));
    expect(turnsOf(withList.speakerTurns)).toEqual(NO_TURNS);
  });

  // ---- Who speaks where ----

  test('the_turns_with_cues_on', () => {
    expect(turnsOf(session(TEXT, cues).speakerTurns)).toEqual([[0, 4, 9, 11], FOUR_TURNS]);
  });

  test('the_current_speaker_follows_the_reading', () => {
    const times = (name: string, count: number): string[] => Array<string>(count).fill(name);
    expect(speakers(session(TEXT, cues))).toEqual([
      ...times('Interviewer', 4),
      ...times('Speaker 2', 5),
      ...times('Interviewer', 2),
      ...times('Speaker 2', 3),
    ]);
  });

  test('the_current_speaker_follows_a_seek', () => {
    const reading = session(TEXT, cues);
    reading.seekTo(7);
    expect(reading.currentSpeaker).toBe('Speaker 2');
    reading.seek(-4);
    expect(reading.currentSpeaker).toBe('Interviewer');
  });

  test('there_is_no_current_speaker_once_finished', () => {
    const reading = session(TEXT, cues);
    reading.seekTo(reading.totalWords);
    expect(reading.isFinished).toBe(true);
    expect(reading.currentSpeaker).toBeNull();
  });

  test('words_before_the_first_label_have_no_speaker', () => {
    const reading = session('Welcome back.\nAnn: hi\nBob: hey\nAnn: bye\nBob: ok', cues);
    expect(speakers(reading).slice(0, 3)).toEqual([null, null, 'Ann']);
  });

  test('a_double_arrow_is_an_unnamed_speaker', () => {
    const reading = session('Ann: hi there\n>> who is that\nAnn: me', cues);
    expect(reading.speakerTurns.speakers).toEqual(['Ann', UNNAMED_SPEAKER, 'Ann']);
  });

  test('a_label_seen_only_once_is_not_a_speaker_in_auto', () => {
    const reading = session('Ann: hi\nNote: once\nAnn: again', cues);
    expect(turnsOf(reading.speakerTurns)).toEqual([[0], ['Ann']]);
  });

  test('a_text_without_labels_has_no_turns', () => {
    const text = 'Just some plain words. Nothing more.';
    const reading = session(text, cues);
    expect(turnsOf(reading.speakerTurns)).toEqual(NO_TURNS);
    expect(delays(reading)).toEqual(delays(session(text)));
  });

  // ---- The transcript's own list (Custom) ----

  test('a_custom_list_names_and_picks_the_speakers', () => {
    const reading = session(TEXT, {
      ...cues,
      speakerCustom: { interviewer: 'Ann', 'speaker 2': 'Bob' },
    });
    expect(reading.speakerTurns.speakers).toEqual(['Ann', 'Bob', 'Ann', 'Bob']);
  });

  test('a_label_left_out_of_a_custom_list_is_ignored', () => {
    const reading = session(TEXT, { ...cues, speakerCustom: { interviewer: 'Ann' } });
    expect(turnsOf(reading.speakerTurns)).toEqual([[0], ['Ann']]);
  });

  test('a_custom_list_can_merge_two_labels', () => {
    const reading = session('Dr. Smith: a\nSmith: b\nAnn: c\nSmith: d', {
      ...cues,
      speakerCustom: { 'dr. smith': 'Smith', smith: 'Smith', ann: 'Ann' },
    });
    expect(turnsOf(reading.speakerTurns)).toEqual([
      [0, 5, 7],
      ['Smith', 'Ann', 'Smith'],
    ]);
  });

  test('a_custom_list_can_switch_on_a_label_seen_only_once', () => {
    const reading = session('Ann: hi\nNote: once\nAnn: again', {
      ...cues,
      speakerCustom: { ann: 'Ann', note: 'Note' },
    });
    expect(reading.speakerTurns.speakers).toEqual(['Ann', 'Note', 'Ann']);
  });

  test('an_empty_custom_list_switches_every_speaker_off', () => {
    const reading = session(TEXT, { ...cues, speakerCustom: {} });
    expect(turnsOf(reading.speakerTurns)).toEqual(NO_TURNS);
  });

  test('a_damaged_custom_list_falls_back_to_auto', () => {
    const reading = session(TEXT, { ...cues, speakerCustom: ['not', 'a', 'dict'] });
    expect(reading.speakerCustom).toBeNull();
    expect(reading.speakerTurns.speakers).toEqual(FOUR_TURNS);
  });

  test('a_custom_list_is_cleaned_and_copied', () => {
    const custom: Record<string, string> = { interviewer: '  Ann ', 'Bad Key': 'X' };
    const reading = session(TEXT, { ...cues, speakerCustom: custom });
    custom['speaker 2'] = 'Bob';
    expect(dict(reading.speakerCustom)).toEqual({ interviewer: 'Ann' });
  });

  // ---- The pause before a new speaker ----

  test('the_last_word_of_each_turn_gets_the_speaker_pause', () => {
    expect(delays(session(TEXT, cues))).toEqual([
      CLAUSE, PLAIN, PLAIN, SPEAKER, // "start?" ends a turn: longer than its sentence pause
      PLAIN, CLAUSE, PLAIN, PLAIN, SPEAKER, // "garage" ends a turn with no punctuation at all
      CLAUSE, SPEAKER, // "Really." ends a turn
      PLAIN, CLAUSE, PLAIN, // the last word of the text has no next speaker
    ]); // prettier-ignore
  });

  test('the_pause_falls_before_the_first_speaker_too', () => {
    const reading = session('Welcome back\nAnn: hi\nBob: hey\nAnn: bye\nBob: ok', cues);
    expect(delays(reading).slice(0, 3)).toEqual([PLAIN, SPEAKER, CLAUSE]);
  });

  test('a_text_that_starts_with_a_label_has_no_pause_before_it', () => {
    expect(delays(session(TEXT, cues))[0]).toBe(CLAUSE);
  });

  test('the_same_speaker_twice_in_a_row_gets_no_pause', () => {
    const reading = session('Ann: one\nAnn: two\nBob: three\nBob: four', cues);
    expect(delays(reading)).toEqual([
      CLAUSE, PLAIN, CLAUSE, SPEAKER, CLAUSE, PLAIN, CLAUSE, PLAIN,
    ]); // prettier-ignore
  });

  test('an_ignored_label_gets_no_pause', () => {
    const reading = session(TEXT, { ...cues, speakerCustom: { interviewer: 'Ann' } });
    expect(delays(reading)).toEqual(delays(session()));
  });

  test('the_speaker_pause_wins_over_length_pacing', () => {
    const text = 'Ann: extraordinarily\nBob: hi\nAnn: no\nBob: ok';
    const reading = session(text, { ...cues, lengthPacingEnabled: true });
    expect(delays(reading)[1]).toBe(SPEAKER);
  });

  test('the_warm_up_ramp_slows_the_speaker_pause_too', () => {
    const plain = session(TEXT, cues);
    const warm = session(TEXT, { ...cues, warmUpEnabled: true });
    for (let i = 0; i < 3; i += 1) {
      warm.advance();
      plain.advance();
    }
    expect(plain.currentDelayMs()).toBe(SPEAKER);
    expect(warm.currentDelayMs()).toBeGreaterThan(SPEAKER);
  });

  test('the_speaker_pause_is_seven_hundred_ms_at_three_hundred_wpm', () => {
    // Pinned as plain numbers, so a change to the multiplier shows up here.
    expect(SPEAKER_PAUSE_MULTIPLIER).toBe(3.5);
    expect(delays(session(TEXT, cues))[3]).toBe(700);
  });

  test('a_turn_end_keeps_its_own_pause_when_that_is_longer', () => {
    // Today the speaker pause is longer than any other, so "the longer of
    // the two" only shows if it's made shorter than a sentence end.
    patched.speakerPause = 2.0;
    const found = delays(session(TEXT, cues));
    expect(found[3]).toBe(SENTENCE); // "start?" keeps its longer sentence pause
    expect(found[8]).toBe(pyRound(BASE * 2.0)); // "garage" had no pause, so it gets the speaker one
  });

  test('delays_round_the_same_way_as_before_at_an_awkward_speed', () => {
    // At 617 WPM the base delay is 97 ms, so the pauses land on halves and
    // rounding matters: 97 x 1.5 = 145.5, 97 x 2.5 = 242.5, 97 x 3.5 = 339.5.
    expect(wpmToDelayMs(617)).toBe(97);
    const off = delays(session(TEXT, { wpm: 617 }));
    const on = delays(session(TEXT, { ...cues, wpm: 617 }));
    expect([pyRound(97 * 1.5), 97, 97, pyRound(97 * 2.5)]).toEqual([146, 97, 97, 242]);
    expect(off.slice(0, 4)).toEqual([146, 97, 97, 242]);
    expect(pyRound(97 * 3.5)).toBe(340);
    expect(on[3]).toBe(340);
  });

  test('a_higher_speed_keeps_the_same_proportion', () => {
    const reading = session(TEXT, { ...cues, wpm: 600 });
    reading.seekTo(3);
    expect(reading.currentDelayMs()).toBe(pyRound(wpmToDelayMs(600) * SPEAKER_PAUSE_MULTIPLIER));
  });

  // ---- The time-left estimate ----

  function expectedRemaining(multipliers: number[]): number {
    return pyRound(BASE * multipliers.reduce((sum, value) => sum + value, 0));
  }

  test('the_time_left_counts_the_speaker_pauses', () => {
    const reading = session(TEXT, cues);
    const [s, c, p] = [SPEAKER_PAUSE_MULTIPLIER, CLAUSE_PAUSE_MULTIPLIER, 1.0];
    const multipliers = [c, p, p, s, p, c, p, p, s, c, s, p, c, p];
    expect(reading.remainingMs()).toBe(expectedRemaining(multipliers));
    reading.seekTo(9);
    expect(reading.remainingMs()).toBe(expectedRemaining(multipliers.slice(9)));
  });

  test('the_time_left_with_length_pacing_counts_them_too', () => {
    const text = 'Ann: extraordinarily\nBob: hi\nAnn: no\nBob: ok';
    const on = session(text, { ...cues, lengthPacingEnabled: true });
    const off = session(text, { lengthPacingEnabled: true });
    // Three turn ends ("extraordinarily", "hi", "no"); the first one's long-word
    // pause gives way to the speaker pause, the other two were plain words.
    const extra = SPEAKER_PAUSE_MULTIPLIER - 1.7 + 2 * (SPEAKER_PAUSE_MULTIPLIER - 1.0);
    expect(on.remainingMs()).toBe(pyRound(off.remainingMs() + BASE * extra));
  });

  test('the_time_left_matches_the_reading_itself', () => {
    const reading = session(TEXT, cues);
    const remaining = reading.remainingMs();
    expect(remaining).toBe(delays(reading).reduce((sum, value) => sum + value, 0));
  });

  // ---- Chunks never run into the next speaker ----

  test.each([
    ['fixed', 5, 30],
    ['adaptive', 2, 60],
  ] as const)('a_chunk_stops_at_the_end_of_a_turn %j %j %j', (mode, size, target) => {
    const text = 'Ann: one two\nBob: three four five six\nAnn: seven\nBob: eight';
    const chunking: ReaderOptions = {
      chunkEnabled: true,
      chunkSize: size,
      chunkMode: mode,
      chunkCharTarget: target,
    };
    const on = session(text, { ...cues, ...chunking });
    for (const [start, end] of on.chunkRanges()) {
      const crossed = on.speakerTurns.starts.filter((turn) => start < turn && turn <= end - 1);
      expect(crossed, `${start}-${end}`).toEqual([]);
    }
    expect(on.chunkRanges()).not.toEqual(session(text, chunking).chunkRanges());
  });

  test('a_chunk_ends_on_the_pause_and_keeps_the_wpm_exact', () => {
    // Each speaker appears twice, or Auto wouldn't count them.
    const text = 'Ann: one two\nBob: three\nAnn: four\nBob: five';
    const reading = session(text, { ...cues, chunkEnabled: true, chunkSize: 5 });
    expect(reading.chunkRanges()).toEqual([
      [0, 3],
      [3, 5],
      [5, 7],
      [7, 9],
    ]);
    expect(reading.currentChunkDelayMs()).toBe(CLAUSE + PLAIN + SPEAKER);
  });

  test('set_chunking_keeps_the_turn_rule', () => {
    const reading = session('Ann: one two\nBob: three four\nAnn: five\nBob: six', cues);
    reading.setChunking(true, 5);
    expect(reading.chunkRanges()).toEqual([
      [0, 3],
      [3, 6],
      [6, 8],
      [8, 10],
    ]);
  });

  // ---- Turning cues on and off in place ----

  test('turning_cues_on_mid_reading_keeps_the_place', () => {
    const reading = session();
    reading.seekTo(7);
    reading.setSpeakerCues(true);
    expect(reading.index).toBe(7);
    expect(reading.currentSpeaker).toBe('Speaker 2');
    expect(delays(reading)).toEqual(delays(session(TEXT, cues)));
  });

  test('turning_cues_off_again_is_exactly_like_never_having_them', () => {
    const reading = session(TEXT, { ...cues, chunkEnabled: true, chunkSize: 4 });
    reading.setSpeakerCues(false);
    const fresh = session(TEXT, { chunkEnabled: true, chunkSize: 4 });
    expect(reading.chunkRanges()).toEqual(fresh.chunkRanges());
    expect(reading.remainingMs()).toBe(fresh.remainingMs());
    expect(turnsOf(reading.speakerTurns)).toEqual(NO_TURNS);
    reading.setChunking(false, 4);
    fresh.setChunking(false, 4);
    expect(delays(reading)).toEqual(delays(fresh));
  });

  test('a_new_list_takes_effect_in_place', () => {
    const reading = session(TEXT, cues);
    reading.setSpeakerCues(true, { interviewer: 'Ann', 'speaker 2': 'Bob' });
    expect(dict(reading.speakerCustom)).toEqual({ interviewer: 'Ann', 'speaker 2': 'Bob' });
    expect(reading.speakerTurns.speakers).toEqual(['Ann', 'Bob', 'Ann', 'Bob']);
    reading.setSpeakerCues(true, null);
    expect(reading.speakerCustom).toBeNull();
    expect(reading.speakerTurns.speakers).toEqual(FOUR_TURNS);
  });

  test('the_list_given_in_place_is_cleaned', () => {
    const reading = session(TEXT, cues);
    reading.setSpeakerCues(true, 'damaged');
    expect(reading.speakerCustom).toBeNull();
  });

  test('turning_cues_on_snaps_to_the_start_of_the_new_chunk', () => {
    const text = 'Ann: one two\nBob: three four\nAnn: five\nBob: six';
    const reading = session(text, { chunkEnabled: true, chunkSize: 5 });
    expect(reading.chunkRanges()[0]).toEqual([0, 5]);
    reading.seekTo(4);
    expect(reading.index).toBe(0);
    reading.index = 4; // a word in the middle of what will become two chunks
    reading.setSpeakerCues(true);
    expect(reading.chunkRanges().slice(0, 2)).toEqual([
      [0, 3],
      [3, 6],
    ]);
    expect(reading.index).toBe(3);
  });

  test('changing_cues_does_not_restart_the_warm_up', () => {
    const reading = session(TEXT, { warmUpEnabled: true });
    for (let i = 0; i < 5; i += 1) {
      reading.advance();
    }
    const before = wordsShown(reading);
    reading.setSpeakerCues(true);
    expect(wordsShown(reading)).toBe(before);
  });

  test('a_finished_session_stays_finished', () => {
    const reading = session();
    reading.seekTo(reading.totalWords);
    reading.setSpeakerCues(true);
    expect(reading.isFinished).toBe(true);
    expect(reading.index).toBe(reading.totalWords);
  });

  // ---- The safety check on word counts ----

  test('no_turns_if_the_speaker_scan_ever_disagrees_with_the_reader', () => {
    patched.extraWords = 1;
    const reading = session(TEXT, cues);
    expect(turnsOf(reading.speakerTurns)).toEqual(NO_TURNS);
    expect(delays(reading)).toEqual(delays(session()));
  });

  // ---- Text that changes how words count ----

  test('timestamps_and_blank_lines_do_not_move_the_turns', () => {
    const text = '[00:00:01] Ann: hello there\n\n00:00:04 Bob: hi\n0:07\nAnn: bye\nBob: ok';
    const reading = session(text, cues);
    expect(reading.speakerTurns.starts).toEqual([0, 3, 5, 7]);
    expect(reading.speakerTurns.starts.map((i) => wordOf(reading.frames[i] ?? null))).toEqual([
      'Ann:', 'Bob:', 'Ann:', 'Bob:',
    ]); // prettier-ignore
  });
});
