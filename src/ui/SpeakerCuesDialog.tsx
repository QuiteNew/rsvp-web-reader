import { useEffect, useRef, useState } from 'react';

import type { ChimeStyleName } from '../core/chime';
import type { Settings } from '../core/models';
import { CHIME_STYLES, SPEAKER_CUE_SOUNDS, SPEAKER_CUE_TAG_POSITIONS } from '../core/settings';
import {
  POSITION_LABELS,
  SOUND_LABELS,
  STYLE_LABELS,
  previewPlan,
} from '../core/speakerCuesWindow';
import type { Clock, TimerHandle } from '../engine/contract';
import type { ChimePlayer } from './chimePlayer';
import { Dialog } from './Dialog';
import styles from './Dialog.module.css';

/** What Listen needs of the chime player. */
export type ListenPlayer = Pick<ChimePlayer, 'available' | 'unlock' | 'play'>;

/** The settings this window shows and Apply saves, all for the whole app. */
export type SpeakerCueChoice = Pick<
  Settings,
  | 'speakerCuesEnabled'
  | 'speakerCueNameTagEnabled'
  | 'speakerCueTagPosition'
  | 'speakerCueFlashEnabled'
  | 'speakerCueSound'
  | 'speakerCueStyle'
>;

export const SOUND_NOTE =
  'One chime sounds at every change. Per speaker gives each speaker a chime of their own. Listen plays your choice before you apply it.';
// The desktop says "Sound is Windows only for now". In a browser it is the
// browser that cannot play it.
export const NO_SOUND_NOTE = "This browser can't play sound, so it can't be changed here.";

interface SpeakerCuesDialogProps {
  readonly saved: SpeakerCueChoice;
  // Plays the Listen button's chimes. null, or one that is not available,
  // greys the sound part out.
  readonly player: ListenPlayer | null;
  // Spaces out Listen's chimes. The engine's clock, so a test can move it.
  readonly clock: Clock;
  readonly onApply: (choice: SpeakerCueChoice) => void;
  readonly onClose: () => void;
}

// The desktop's Speaker cues window, its part for the whole app: Speaker
// cues on or off, the name tag and where it goes, the flash, and the sound
// and its style with a Listen button. Nothing changes until Apply, which
// keeps the window open and says so, as the Chunking window does. Escape
// and the close button leave without applying. There is no Enter, as on
// the desktop, so a key press cannot apply anything by accident.
//
// Where the browser cannot play sound the sound part is greyed out and what
// was saved there is kept as it is, as on the desktop without winsound.
export function SpeakerCuesDialog({
  saved,
  player,
  clock,
  onApply,
  onClose,
}: SpeakerCuesDialogProps) {
  const [draft, setDraft] = useState<SpeakerCueChoice>(saved);
  const [status, setStatus] = useState('');
  const soundAvailable = player !== null && player.available;
  // Listen's chimes still to come, so a second click or closing can stop them.
  const waiting = useRef<TimerHandle[]>([]);

  function change(changes: Partial<SpeakerCueChoice>): void {
    setDraft({ ...draft, ...changes });
    setStatus('');
  }

  function cancelListen(): void {
    for (const handle of waiting.current) clock.clearTimer(handle);
    waiting.current = [];
  }

  // Closing stops what Listen still had to play.
  useEffect(
    () => () => {
      for (const handle of waiting.current) clock.clearTimer(handle);
    },
    [clock],
  );

  // Plays the sound and style chosen now, applied or not. A second click
  // starts again from the beginning. The click itself lets the page make
  // sound, whatever the saved sound is.
  function listen(): void {
    if (player === null) return;
    cancelListen();
    player.unlock();
    const style = draft.speakerCueStyle;
    for (const [when, notes] of previewPlan(draft.speakerCueSound, style)) {
      if (when === 0) {
        player.play(notes, style, true);
      } else {
        waiting.current.push(
          clock.setTimer(() => {
            player.play(notes, style, true);
          }, when),
        );
      }
    }
  }

  const quiet = `${styles.note} ${styles.quiet}`;
  return (
    <Dialog title="Speaker cues" onClose={onClose}>
      <label className={styles.row}>
        <input
          type="checkbox"
          checked={draft.speakerCuesEnabled}
          onChange={(event) => {
            change({ speakerCuesEnabled: event.target.checked });
          }}
        />
        <span>Speaker cues</span>
      </label>
      <p className={quiet}>
        When on, the reader shows who is speaking in transcripts that have names at the start of
        their lines, like "Interviewer:", and gives a cue when the speaker changes. Applies to every
        transcript.
      </p>

      <fieldset className={`${styles.group} ${styles.stack}`}>
        <legend>Show</legend>
        <label className={styles.row}>
          <input
            type="checkbox"
            checked={draft.speakerCueNameTagEnabled}
            onChange={(event) => {
              change({ speakerCueNameTagEnabled: event.target.checked });
            }}
          />
          <span>The speaker's name</span>
        </label>
        {/* Only matters while the name shows, so it is greyed out while the
          name is off. The choice is kept and applied as it is. */}
        <label className={`${styles.row} ${styles.indented}`}>
          <span>Where it goes</span>
          <select
            value={draft.speakerCueTagPosition}
            disabled={!draft.speakerCueNameTagEnabled}
            onChange={(event) => {
              change({
                speakerCueTagPosition: event.target
                  .value as SpeakerCueChoice['speakerCueTagPosition'],
              });
            }}
          >
            {SPEAKER_CUE_TAG_POSITIONS.map((position) => (
              <option key={position} value={position}>
                {POSITION_LABELS[position]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.row}>
          <input
            type="checkbox"
            checked={draft.speakerCueFlashEnabled}
            onChange={(event) => {
              change({ speakerCueFlashEnabled: event.target.checked });
            }}
          />
          <span>A brief flash when the speaker changes</span>
        </label>
      </fieldset>

      <fieldset className={`${styles.group} ${styles.stack}`}>
        <legend>Sound</legend>
        <label className={styles.row}>
          <span>Chime</span>
          <select
            value={draft.speakerCueSound}
            disabled={!soundAvailable}
            onChange={(event) => {
              change({
                speakerCueSound: event.target.value as SpeakerCueChoice['speakerCueSound'],
              });
            }}
          >
            {SPEAKER_CUE_SOUNDS.map((sound) => (
              <option key={sound} value={sound}>
                {SOUND_LABELS[sound]}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.row}>
          <label className={styles.row}>
            <span>Style</span>
            <select
              value={draft.speakerCueStyle}
              disabled={!soundAvailable}
              onChange={(event) => {
                change({ speakerCueStyle: event.target.value as ChimeStyleName });
              }}
            >
              {CHIME_STYLES.map((style) => (
                <option key={style} value={style}>
                  {STYLE_LABELS[style]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.action}
            disabled={!soundAvailable}
            onClick={listen}
          >
            ▶ Listen
          </button>
        </div>
        <p className={quiet}>{soundAvailable ? SOUND_NOTE : NO_SOUND_NOTE}</p>
      </fieldset>

      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            onApply(draft);
            setStatus('Applied.');
          }}
        >
          Apply
        </button>
        <span role="status" className={styles.note}>
          {status}
        </span>
      </div>
    </Dialog>
  );
}
