// The numbers and rules behind the speaker name tag and the flash when a new
// speaker starts, taken from the desktop's gui/components/reader_display.py.
// That file draws with tkinter and cannot be run here, so these were copied
// from the code and checked by hand, not by a fixture, as in guideMarks.ts.
// The drawing itself is in src/ui/WordDisplay.tsx.
import { blendColors } from './colors';
import { GUIDE_MARK_MIN_GAP_PX, PERIPHERAL_CONTEXT_DIM } from './guideMarks';
import { pyRound } from './pythonText';
import { UNNAMED_SPEAKER } from './speakers';

/** The tag's text is this share of the word's font size. */
export const SPEAKER_TAG_SIZE_RATIO = 0.5;

/** Room between the bottom of the tag and the highest point a guide mark reaches, px. */
export const SPEAKER_TAG_BOTTOM_MARGIN_PX = 8;

/** The least room the tag keeps from the top of the reading area, px. */
export const SPEAKER_TAG_MIN_TOP_PX = 4;

/** How far the tag sits in from the top and right edges in the corner, px. */
export const SPEAKER_TAG_CORNER_MARGIN_PX = 12;

/** How long a new speaker's flash lasts, about a third of a second. */
export const SPEAKER_FLASH_MS = 330;

/** How far the background moves toward the highlight colour during the flash: 0 none, 1 all the way. */
export const SPEAKER_FLASH_WARMTH = 0.18;

/** The tag's font size, never under 8 px, as for the surrounding words. */
export function speakerTagSize(fontSize: number): number {
  return Math.max(8, pyRound(fontSize * SPEAKER_TAG_SIZE_RATIO));
}

/**
 * The name to show in the tag, or null for no tag: when the tag is switched
 * off, before the first speaker or once reading is finished (no current
 * speaker), and for a ">>" change, which has no name to show.
 */
export function speakerTagName(speaker: string | null, enabled: boolean): string | null {
  if (!enabled || speaker === null || speaker === UNNAMED_SPEAKER) return null;
  return speaker;
}

/**
 * How far above the middle of the focus letter the bottom of the tag sits,
 * in px, when it is above the word: past the letter's top half, the gap and
 * the length of a guide mark (whether or not the marks are showing, so the
 * tag never jumps), then the margin. The focus letter's own offset moves it
 * too, as it moves the marks.
 */
export function speakerTagRise(halfPx: number, offsetPx: number, markLengthPx: number): number {
  return halfPx + GUIDE_MARK_MIN_GAP_PX + offsetPx + markLengthPx + SPEAKER_TAG_BOTTOM_MARGIN_PX;
}

/**
 * The tag's colour: the font colour dimmed toward the background like the
 * surrounding words, or the highlight colour while a new speaker flashes. A
 * colour that cannot be blended (a saved file edited by hand) gives the
 * plain font colour, as the surrounding words do.
 */
export function speakerTagColor(
  font: string,
  background: string,
  highlight: string,
  flashing: boolean,
): string {
  if (flashing) return highlight;
  try {
    return blendColors(font, background, PERIPHERAL_CONTEXT_DIM);
  } catch {
    return font;
  }
}

/**
 * The reading background during a flash, moved a little toward the
 * highlight colour. A colour that cannot be blended gives the background
 * unchanged, so a flash never shows a wrong colour.
 */
export function flashBackground(background: string, highlight: string): string {
  try {
    return blendColors(background, highlight, SPEAKER_FLASH_WARMTH);
  } catch {
    return background;
  }
}
