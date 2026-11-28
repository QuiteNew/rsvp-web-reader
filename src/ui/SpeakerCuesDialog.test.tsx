// The Speaker cues window on its own, following the desktop's
// tests/test_speaker_cues_window.py for the part for the whole app, under its
// test names where one fits. The speaker list comes with the next step.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CHANGE_PATTERN, SPEAKER_PATTERNS, type ChimeNotes } from '../core/chime';
import { FakeClock } from '../testing/fakeClock';
import {
  NO_SOUND_NOTE,
  SOUND_NOTE,
  SpeakerCuesDialog,
  type ListenPlayer,
  type SpeakerCueChoice,
} from './SpeakerCuesDialog';

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
) {
  const clock = new FakeClock();
  const onApply = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <SpeakerCuesDialog
      saved={{ ...SAVED, ...saved }}
      player={player}
      clock={clock}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  return { clock, onApply, onClose, player: player as FakePlayer, view };
}

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

describe('Apply', () => {
  test('apply_hands_back_what_is_on_screen', () => {
    const { onApply, onClose } = open();
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
    expect(screen.getByRole('status')).toHaveTextContent('Applied.');
    // The window stays open after Apply.
    expect(onClose).not.toHaveBeenCalled();
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

  test('a change after Apply takes the "Applied." away', () => {
    open();
    press('Apply');
    fireEvent.click(box('Speaker cues'));
    expect(screen.getByRole('status')).toHaveTextContent('');
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
