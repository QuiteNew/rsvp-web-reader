import { useEffect, useRef, useState } from 'react';

import type { ChimeStyleName } from '../core/chime';
import type { Settings, SpeakerCustom } from '../core/models';
import { CHIME_STYLES, SPEAKER_CUE_SOUNDS, SPEAKER_CUE_TAG_POSITIONS } from '../core/settings';
import {
  cleanCustomSpeakers,
  speakerRows,
  speakersToSave,
  type SpeakerRow,
} from '../core/speakers';
import {
  LIST_AUTOMATIC,
  LIST_CUSTOM,
  POSITION_LABELS,
  SOUND_LABELS,
  STYLE_LABELS,
  appearancesText,
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

/** The transcript open now, for its speaker list. */
export interface SpeakerListSource {
  readonly id: number;
  readonly title: string;
  readonly rawText: string;
  readonly speakerCustom: SpeakerCustom;
}

export const NO_TRANSCRIPT_NOTE = 'Open a transcript to see its speakers and change them.';
export const NO_NAMES_NOTE =
  'No speaker names were found. A name counts when it starts a line and is followed by a colon, like "Interviewer:".';
export const SAME_NAME_NOTE = 'The same name on two rows makes them one speaker.';

interface SpeakerCuesDialogProps {
  readonly saved: SpeakerCueChoice;
  // null when no transcript is open. The window then shows no list.
  readonly transcript: SpeakerListSource | null;
  // Plays the Listen button's chimes. null, or one that is not available,
  // greys the sound part out.
  readonly player: ListenPlayer | null;
  // Spaces out Listen's chimes. The engine's clock, so a test can move it.
  readonly clock: Clock;
  readonly onApply: (choice: SpeakerCueChoice) => void;
  // The transcript's speaker list as Apply saves it. null is Automatic.
  readonly onApplySpeakers: (id: number, custom: SpeakerCustom) => void;
  readonly onClose: () => void;
}

// The desktop's Speaker cues window. The top part is for the whole app:
// Speaker cues on or off, the name tag and where it goes, the flash, and the
// sound and its style with a Listen button. The bottom part is the speaker
// list of the transcript open now: a row for every label found in its text,
// with a tick box, the name it is shown with and how often it starts a line.
// Changing a tick or a name makes the list Custom, the same name on two rows
// makes them one speaker, and Back to automatic puts every row back the way
// Automatic has it.
//
// Nothing changes until Apply, which keeps the window open and says so, as
// the Chunking window does. Escape and the close button leave without
// applying. There is no Enter, as on the desktop, so a key press cannot
// apply anything by accident.
//
// Where the browser cannot play sound the sound part is greyed out and what
// was saved there is kept as it is, as on the desktop without winsound.
export function SpeakerCuesDialog({
  saved,
  transcript,
  player,
  clock,
  onApply,
  onApplySpeakers,
  onClose,
}: SpeakerCuesDialogProps) {
  const [draft, setDraft] = useState<SpeakerCueChoice>(saved);
  // The rows as the transcript's list has them, and as Automatic would have
  // them, for Back to automatic. Both empty with no transcript. The saved
  // list is cleaned the way the reader cleans it, so the rows show what the
  // reader does.
  const [rows, setRows] = useState<readonly SpeakerRow[]>(() =>
    transcript === null
      ? []
      : speakerRows(transcript.rawText, cleanCustomSpeakers(transcript.speakerCustom)),
  );
  const [autoRows] = useState<readonly SpeakerRow[]>(() =>
    transcript === null ? [] : speakerRows(transcript.rawText, null),
  );
  const listMode = speakersToSave(rows) === null ? LIST_AUTOMATIC : LIST_CUSTOM;

  function changeRow(index: number, changes: Partial<SpeakerRow>): void {
    setRows(rows.map((row, at) => (at === index ? { ...row, ...changes } : row)));
    setStatus('');
  }
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

      {transcript === null ? (
        <fieldset className={styles.group}>
          <legend>Speakers</legend>
          <p className={quiet}>{NO_TRANSCRIPT_NOTE}</p>
        </fieldset>
      ) : (
        <fieldset className={`${styles.group} ${styles.listGroup}`}>
          <legend>Speakers in this transcript</legend>
          <div className={styles.listTitle}>
            <span>{transcript.title}</span>
            <span data-testid="list-mode">{listMode}</span>
          </div>
          {rows.length === 0 ? (
            <p className={quiet}>{NO_NAMES_NOTE}</p>
          ) : (
            <>
              <ul className={styles.speakerList}>
                {rows.map((row, index) => (
                  <li key={row.key}>
                    <input
                      type="checkbox"
                      aria-label={`Show ${row.label} as a speaker`}
                      checked={row.ticked}
                      onChange={(event) => {
                        changeRow(index, { ticked: event.target.checked });
                      }}
                    />
                    <input
                      type="text"
                      aria-label={`Name shown for ${row.label}`}
                      value={row.name}
                      onChange={(event) => {
                        changeRow(index, { name: event.target.value });
                      }}
                    />
                    <span>{appearancesText(row.appearances)}</span>
                  </li>
                ))}
              </ul>
              <div className={styles.listFooter}>
                <p className={quiet}>{SAME_NAME_NOTE}</p>
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => {
                    setRows(autoRows);
                    setStatus('');
                  }}
                >
                  Back to automatic
                </button>
              </div>
            </>
          )}
        </fieldset>
      )}

      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            onApply(draft);
            // The list is saved only when there is one to show, as on the
            // desktop.
            if (transcript !== null && rows.length > 0) {
              const list = speakersToSave(rows);
              onApplySpeakers(transcript.id, list === null ? null : Object.fromEntries(list));
            }
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
