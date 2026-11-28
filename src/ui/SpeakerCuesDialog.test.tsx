// The Speaker cues window on its own, following the desktop's
// tests/test_speaker_cues_window.py, under its test names where one fits.
// Its tests of the window's size in pixels have no web counterpart: the
// page lays the window out, and a long list scrolls.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CHANGE_PATTERN, SPEAKER_PATTERNS, type ChimeNotes } from '../core/chime';
import { FakeClock } from '../testing/fakeClock';
import type { SpeakerCustom } from '../core/models';
import {
  NO_NAMES_NOTE,
  NO_SOUND_NOTE,
  NO_TRANSCRIPT_NOTE,
  SAME_NAME_NOTE,
  SOUND_NOTE,
  SpeakerCuesDialog,
  type ListenPlayer,
  type SpeakerCueChoice,
  type SpeakerListSource,
} from './SpeakerCuesDialog';

// The desktop test's text: Ann and Bob start two lines each, Cat one.
const TEXT = 'Ann: hi\nBob: yo\nCat: once\nAnn: and\nBob: so';

function talk(rawText = TEXT, speakerCustom: SpeakerCustom = null): SpeakerListSource {
  return { id: 7, title: 'Talk', rawText, speakerCustom };
}

const SAVED: SpeakerCueChoice = {
  speakerCuesEnabled: false,
  speakerCueNameTagEnabled: true,
  speakerCueTagPosition: 'above',
  speakerCueFlashEnabled: true,
  speakerCueSound: 'off',
  speakerCueStyle: 'bell',
};

class FakePlayer implements ListenPlayer {
  readonly played: [ChimeNotes, string, boolean][] = [];
  unlocked = 0;
  readonly available: boolean;
  constructor(available = true) {
    this.available = available;
  }
  unlock(): void {
    this.unlocked += 1;
  }
  play(notes: ChimeNotes, style: string, wait = false): boolean {
    this.played.push([notes, style, wait]);
    return true;
  }
}

function open(
  saved: Partial<SpeakerCueChoice> = {},
  player: ListenPlayer | null = new FakePlayer(),
  transcript: SpeakerListSource | null = talk(),
) {
  const clock = new FakeClock();
  const onApply = vi.fn();
  const onApplySpeakers = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <SpeakerCuesDialog
      saved={{ ...SAVED, ...saved }}
      transcript={transcript}
      player={player}
      clock={clock}
      onApply={onApply}
      onApplySpeakers={onApplySpeakers}
      onClose={onClose}
    />,
  );
  return { clock, onApply, onApplySpeakers, onClose, player: player as FakePlayer, view };
}

// Each row as [tick, name, how often], in order.
function rows(): [boolean, string, string][] {
  return screen.getAllByRole('listitem').map((item) => {
    const tick = item.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    const name = item.querySelector<HTMLInputElement>('input[type=text]')!;
    return [tick.checked, name.value, item.querySelector('span')!.textContent];
  });
}
const mode = () => screen.getByTestId('list-mode').textContent;
const rowTick = (label: string) => box(`Show ${label} as a speaker`);
const rowName = (label: string) =>
  screen.getByRole('textbox', { name: `Name shown for ${label}` }) as HTMLInputElement;

const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const choice = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement;
const pick = (name: string, value: string) => {
  fireEvent.change(choice(name), { target: { value } });
};
const press = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
};

describe('what it shows', () => {
  test('it_shows_the_saved_values', () => {
    open({
      speakerCuesEnabled: true,
      speakerCueFlashEnabled: false,
      speakerCueSound: 'per_speaker',
      speakerCueStyle: 'glass',
      speakerCueTagPosition: 'top_right',
    });
    expect(box('Speaker cues').checked).toBe(true);
    expect(box("The speaker's name").checked).toBe(true);
    expect(box('A brief flash when the speaker changes').checked).toBe(false);
    expect(choice('Where it goes').value).toBe('top_right');
    expect(choice('Chime').value).toBe('per_speaker');
    expect(choice('Style').value).toBe('glass');
  });

  test('the choices have the desktop names, in its order', () => {
    open();
    const labels = (name: string) => Array.from(choice(name).options, (option) => option.text);
    expect(labels('Where it goes')).toEqual(['Above the word', 'Top right']);
    expect(labels('Chime')).toEqual(['Off', 'One chime', 'Per speaker']);
    expect(labels('Style')).toEqual(['Bell', 'Soft', 'Glass', 'Wood']);
  });

  test('the_position_buttons_are_greyed_while_the_name_is_off', () => {
    open({ speakerCueNameTagEnabled: false });
    expect(choice('Where it goes')).toBeDisabled();
  });

  test('ticking_the_name_box_turns_the_position_buttons_on_and_off', () => {
    open();
    fireEvent.click(box("The speaker's name"));
    expect(choice('Where it goes')).toBeDisabled();
    fireEvent.click(box("The speaker's name"));
    expect(choice('Where it goes')).toBeEnabled();
  });
});

describe('the speaker list', () => {
  test('every_label_gets_a_row_as_auto_has_it', () => {
    open();
    expect(rows().map(([tick, name]) => [tick, name])).toEqual([
      [true, 'Ann'],
      [true, 'Bob'],
      [false, 'Cat'],
    ]);
    expect(mode()).toBe('Automatic');
    expect(screen.getByText('Talk')).toBeInTheDocument();
    expect(screen.getByText(SAME_NAME_NOTE)).toBeInTheDocument();
  });

  test('rows_follow_the_transcripts_own_list', () => {
    open({}, undefined, talk(TEXT, { cat: 'Kat' }));
    expect(rows().map(([tick, name]) => [tick, name])).toEqual([
      [false, 'Ann'],
      [false, 'Bob'],
      [true, 'Kat'],
    ]);
    expect(mode()).toBe('Custom');
  });

  test('each_row_says_how_often_the_name_starts_a_line', () => {
    open();
    expect(rows().map(([, , seen]) => seen)).toEqual([
      'seen 2 times',
      'seen 2 times',
      'seen 1 time',
    ]);
  });

  test('a damaged saved list shows what the reader makes of it', () => {
    // A name that is not a string is dropped, the rest is kept.
    open({}, undefined, talk(TEXT, { cat: 'Kat', bob: 3 } as unknown as SpeakerCustom));
    expect(rows().map(([tick, name]) => [tick, name])).toEqual([
      [false, 'Ann'],
      [false, 'Bob'],
      [true, 'Kat'],
    ]);
  });

  test('with_no_transcript_open_there_is_no_list', () => {
    const { onApply, onApplySpeakers } = open({}, undefined, null);
    expect(screen.getByText(NO_TRANSCRIPT_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(screen.queryByTestId('list-mode')).toBeNull();
    press('Apply');
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApplySpeakers).not.toHaveBeenCalled();
  });

  test('a_transcript_with_no_names_has_no_rows_and_saves_no_list', () => {
    const { onApply, onApplySpeakers } = open({}, undefined, talk('just some words'));
    expect(screen.getByText(NO_NAMES_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(mode()).toBe('Automatic');
    press('Apply');
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApplySpeakers).not.toHaveBeenCalled();
  });

  test('ticking_a_row_makes_the_list_custom_and_unticking_makes_it_automatic', () => {
    open();
    fireEvent.click(rowTick('Cat'));
    expect(mode()).toBe('Custom');
    fireEvent.click(rowTick('Cat'));
    expect(mode()).toBe('Automatic');
  });

  test('typing_a_name_makes_the_list_custom', () => {
    open();
    fireEvent.change(rowName('Ann'), { target: { value: 'Annie' } });
    expect(mode()).toBe('Custom');
  });

  test('back_to_automatic_puts_every_row_back', () => {
    open({}, undefined, talk(TEXT, { cat: 'Kat' }));
    press('Back to automatic');
    expect(rows().map(([tick, name]) => [tick, name])).toEqual([
      [true, 'Ann'],
      [true, 'Bob'],
      [false, 'Cat'],
    ]);
    expect(mode()).toBe('Automatic');
  });

  test('apply_saves_a_changed_list', () => {
    const { onApplySpeakers } = open();
    fireEvent.click(rowTick('Cat'));
    fireEvent.change(rowName('Bob'), { target: { value: 'Ann' } });
    press('Apply');
    expect(onApplySpeakers).toHaveBeenCalledWith(7, { ann: 'Ann', bob: 'Ann', cat: 'Cat' });
  });

  test('apply_after_back_to_automatic_saves_automatic', () => {
    const { onApplySpeakers } = open({}, undefined, talk(TEXT, { cat: 'Kat' }));
    press('Back to automatic');
    press('Apply');
    expect(onApplySpeakers).toHaveBeenCalledWith(7, null);
  });
});

describe('Apply', () => {
  test('apply_hands_back_what_is_on_screen', () => {
    const { onApply, onApplySpeakers, onClose } = open();
    fireEvent.click(box('Speaker cues'));
    fireEvent.click(box("The speaker's name"));
    pick('Chime', 'per_speaker');
    pick('Style', 'wood');
    fireEvent.click(box("The speaker's name"));
    pick('Where it goes', 'top_right');
    press('Apply');
    expect(onApply).toHaveBeenCalledWith({
      speakerCuesEnabled: true,
      speakerCueNameTagEnabled: true,
      speakerCueTagPosition: 'top_right',
      speakerCueFlashEnabled: true,
      speakerCueSound: 'per_speaker',
      speakerCueStyle: 'wood',
    });
    // The list as it was loaded is Automatic, saved as null.
    expect(onApplySpeakers).toHaveBeenCalledWith(7, null);
    // Apply closes the window, the owner's choice for the web. The desktop
    // keeps it open and says "Applied.".
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]!);
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('a_greyed_choice_is_kept_and_handed_back', () => {
    const { onApply } = open({
      speakerCueNameTagEnabled: false,
      speakerCueTagPosition: 'top_right',
    });
    expect(choice('Where it goes').value).toBe('top_right');
    press('Apply');
    expect(onApply).toHaveBeenCalledWith({
      ...SAVED,
      speakerCueNameTagEnabled: false,
      speakerCueTagPosition: 'top_right',
    });
  });

  test('switching_the_name_off_and_on_keeps_the_choice', () => {
    const { onApply } = open();
    pick('Where it goes', 'top_right');
    fireEvent.click(box("The speaker's name"));
    fireEvent.click(box("The speaker's name"));
    expect(choice('Where it goes').value).toBe('top_right');
    press('Apply');
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({ speakerCueTagPosition: 'top_right' });
  });

  test('close_and_esc_leave_without_applying', () => {
    const { onApply, onClose } = open();
    fireEvent.click(box('Speaker cues'));
    // Enter applies nothing.
    fireEvent.keyDown(box('Speaker cues'), { key: 'Enter' });
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
    press('Close');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('sound and Listen', () => {
  test('listen_plays_the_choice_on_screen_without_applying_it', () => {
    const { onApply, player } = open({ speakerCueSound: 'off', speakerCueStyle: 'bell' });
    pick('Chime', 'change');
    pick('Style', 'glass');
    press('▶ Listen');
    expect(player.played).toEqual([[CHANGE_PATTERN, 'glass', true]]);
    expect(onApply).not.toHaveBeenCalled();
  });

  test('Listen plays the sound on screen, not the one saved', () => {
    // One chime and Off both play the change chime, so the test above cannot
    // tell them apart. Per speaker starts with the first speaker's pattern.
    const { player } = open({ speakerCueSound: 'change' });
    pick('Chime', 'per_speaker');
    press('▶ Listen');
    expect(player.played).toEqual([[SPEAKER_PATTERNS[0], 'bell', true]]);
  });

  test('Listen lets the page make sound, whatever sound was saved', () => {
    const { player } = open({ speakerCueSound: 'off' });
    press('▶ Listen');
    expect(player.unlocked).toBe(1);
  });

  test('listen_plays_three_speakers_in_turn', () => {
    const { clock, player } = open({ speakerCueSound: 'per_speaker', speakerCueStyle: 'wood' });
    press('▶ Listen');
    // The first one at once.
    expect(player.played).toEqual([[SPEAKER_PATTERNS[0], 'wood', true]]);
    act(() => {
      clock.advance(649);
    });
    expect(player.played).toHaveLength(1);
    act(() => {
      clock.advance(1);
    });
    expect(player.played).toHaveLength(2);
    act(() => {
      clock.advance(670);
    });
    expect(player.played).toEqual(
      SPEAKER_PATTERNS.slice(0, 3).map((notes) => [notes, 'wood', true]),
    );
  });

  test('a_second_click_starts_again_from_the_beginning', () => {
    const { clock, player } = open({ speakerCueSound: 'per_speaker', speakerCueStyle: 'wood' });
    press('▶ Listen');
    press('▶ Listen');
    act(() => {
      clock.advance(1500);
    });
    expect(player.played.map(([notes]) => notes)).toEqual([
      SPEAKER_PATTERNS[0],
      SPEAKER_PATTERNS[0],
      SPEAKER_PATTERNS[1],
      SPEAKER_PATTERNS[2],
    ]);
  });

  test('closing_stops_what_listen_still_had_to_play', () => {
    const { clock, player, view } = open({
      speakerCueSound: 'per_speaker',
      speakerCueStyle: 'wood',
    });
    press('▶ Listen');
    view.unmount();
    act(() => {
      clock.advance(1500);
    });
    expect(player.played).toEqual([[SPEAKER_PATTERNS[0], 'wood', true]]);
  });

  test.each([
    ['no player', null],
    ['no sound here', new FakePlayer(false)],
  ])('without_sound_the_sound_part_is_greyed_and_kept_as_saved[%s]', (_name, player) => {
    const { onApply } = open({ speakerCueSound: 'per_speaker', speakerCueStyle: 'glass' }, player);
    expect(choice('Chime')).toBeDisabled();
    expect(choice('Style')).toBeDisabled();
    expect(screen.getByRole('button', { name: '▶ Listen' })).toBeDisabled();
    expect(screen.getByText(NO_SOUND_NOTE)).toBeInTheDocument();
    // Where the name sits has nothing to do with sound.
    expect(choice('Where it goes')).toBeEnabled();
    press('Apply');
    expect(onApply).toHaveBeenCalledWith({
      ...SAVED,
      speakerCueSound: 'per_speaker',
      speakerCueStyle: 'glass',
    });
  });

  test('with_sound_the_sound_part_can_be_used', () => {
    open();
    expect(choice('Chime')).toBeEnabled();
    expect(choice('Style')).toBeEnabled();
    expect(screen.getByRole('button', { name: '▶ Listen' })).toBeEnabled();
    expect(screen.getByText(SOUND_NOTE)).toBeInTheDocument();
  });
});
