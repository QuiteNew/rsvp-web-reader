// The words and the Listen plan of the Speaker cues window, from the
// desktop's gui/components/speaker_cues_window.py. That file imports tkinter,
// so it cannot be run here. These were copied from the code and are checked
// by its own tests for them, ported in speakerCuesWindow.test.ts. The window
// itself is src/ui/SpeakerCuesDialog.tsx.
import {
  CHANGE_PATTERN,
  CHIME_STYLES,
  MIN_CHIME_GAP_MS,
  SPEAKER_PATTERNS,
  chimeLengthMs,
  type ChimeNotes,
  type ChimeStyleName,
} from './chime';
import type { Settings } from './models';

type Sound = Settings['speakerCueSound'];
type Position = Settings['speakerCueTagPosition'];

/** What the sound choices are called on screen, by the value saved, in the settings' order. */
export const SOUND_LABELS: Readonly<Record<Sound, string>> = {
  off: 'Off',
  change: 'One chime',
  per_speaker: 'Per speaker',
};

/** What the chime styles are called on screen: the saved name with a capital. */
export const STYLE_LABELS: Readonly<Record<ChimeStyleName, string>> = Object.fromEntries(
  CHIME_STYLES.map((style) => [style, style.charAt(0).toUpperCase() + style.slice(1)]),
) as Record<ChimeStyleName, string>;

/** Where the name tag can go, as it is called on screen. */
export const POSITION_LABELS: Readonly<Record<Position, string>> = {
  above: 'Above the word',
  top_right: 'Top right',
};

/** What the speaker list says it is: following the text, or the transcript's own. */
export const LIST_AUTOMATIC = 'Automatic';
export const LIST_CUSTOM = 'Custom';

/** How many speakers' chimes Listen plays when the sound is Per speaker. */
export const PREVIEW_SPEAKERS = 3;

/** The pause between them, on top of the reader's own gap, so each is heard alone. */
export const PREVIEW_PAUSE_MS = 250;

/**
 * What the Listen button plays for these choices: [when, notes] pairs, when
 * in milliseconds after the click. Per speaker plays the first
 * PREVIEW_SPEAKERS speakers' patterns one after another. One chime, and Off
 * too (so a style can still be heard before a sound is picked), plays the
 * change chime once.
 *
 * Each chime starts once the one before has finished, the way the reader
 * spaces them (ChimeGap in chime.ts), plus PREVIEW_PAUSE_MS. On the desktop
 * that is because Windows cuts off a sound still playing when the next one
 * starts. The player here does the same, so the plan is kept as it is.
 */
export function previewPlan(sound: Sound, style: ChimeStyleName): [number, ChimeNotes][] {
  const patterns =
    sound === 'per_speaker' ? SPEAKER_PATTERNS.slice(0, PREVIEW_SPEAKERS) : [CHANGE_PATTERN];
  const plan: [number, ChimeNotes][] = [];
  let when = 0;
  for (const notes of patterns) {
    plan.push([when, notes]);
    when += Math.max(MIN_CHIME_GAP_MS, chimeLengthMs(notes, style)) + PREVIEW_PAUSE_MS;
  }
  return plan;
}

/** How often a speaker's name starts a line, for the speaker list. */
export function appearancesText(appearances: number): string {
  return appearances === 1 ? 'seen 1 time' : `seen ${appearances} times`;
}
