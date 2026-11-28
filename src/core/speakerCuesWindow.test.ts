// The desktop's tests for the parts of its Speaker cues window that need no
// window, from tests/test_speaker_cues_window.py, under their Python names.
import { describe, expect, test } from 'vitest';
import { CHANGE_PATTERN, CHIME_STYLES, SPEAKER_PATTERNS } from './chime';
import { SPEAKER_CUE_SOUNDS, SPEAKER_CUE_TAG_POSITIONS } from './settings';
import {
  LIST_AUTOMATIC,
  LIST_CUSTOM,
  POSITION_LABELS,
  PREVIEW_PAUSE_MS,
  PREVIEW_SPEAKERS,
  SOUND_LABELS,
  STYLE_LABELS,
  appearancesText,
  previewPlan,
} from './speakerCuesWindow';

describe('test_speaker_cues_window.py, the pieces with no window', () => {
  test('the_choices_on_screen_cover_every_saved_value', () => {
    expect(Object.keys(SOUND_LABELS)).toEqual([...SPEAKER_CUE_SOUNDS]);
    expect(Object.values(SOUND_LABELS)).toEqual(['Off', 'One chime', 'Per speaker']);
    expect(Object.keys(STYLE_LABELS)).toEqual([...CHIME_STYLES]);
    expect(Object.values(STYLE_LABELS)).toEqual(['Bell', 'Soft', 'Glass', 'Wood']);
  });

  test('the list says Automatic or Custom', () => {
    expect([LIST_AUTOMATIC, LIST_CUSTOM]).toEqual(['Automatic', 'Custom']);
  });

  test('appearances_are_counted_in_words', () => {
    expect(appearancesText(1)).toBe('seen 1 time');
    expect(appearancesText(2)).toBe('seen 2 times');
    expect(appearancesText(14)).toBe('seen 14 times');
  });

  test('per_speaker_plays_three_speakers_one_after_another', () => {
    expect([PREVIEW_SPEAKERS, PREVIEW_PAUSE_MS]).toEqual([3, 250]);
    // Bell chimes are 450, 570 and 570 ms long, so each one starts once the
    // one before is over, plus the pause.
    expect(previewPlan('per_speaker', 'bell')).toEqual([
      [0, SPEAKER_PATTERNS[0]],
      [450 + 250, SPEAKER_PATTERNS[1]],
      [450 + 250 + 570 + 250, SPEAKER_PATTERNS[2]],
    ]);
  });

  test('a_chime_shorter_than_the_readers_gap_still_waits_for_the_gap', () => {
    // Wood's first chime is 300 ms, under the reader's 400 ms gap.
    expect(previewPlan('per_speaker', 'wood')).toEqual([
      [0, SPEAKER_PATTERNS[0]],
      [400 + 250, SPEAKER_PATTERNS[1]],
      [400 + 250 + 420 + 250, SPEAKER_PATTERNS[2]],
    ]);
  });

  test('one_chime_and_off_play_the_change_chime_once', () => {
    expect(previewPlan('change', 'glass')).toEqual([[0, CHANGE_PATTERN]]);
    expect(previewPlan('off', 'glass')).toEqual([[0, CHANGE_PATTERN]]);
  });

  test('every_position_has_a_label', () => {
    expect(Object.keys(POSITION_LABELS).sort()).toEqual([...SPEAKER_CUE_TAG_POSITIONS].sort());
    expect(POSITION_LABELS).toEqual({ above: 'Above the word', top_right: 'Top right' });
  });
});
