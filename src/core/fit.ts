// Fitting a wide flash into the reading row, from the desktop's
// gui/components/reader_display.py and its reader fit design note. The font
// is drawn smaller when the widest chunk of the transcript would not fit,
// down to 60 percent of the chosen size. It is one size for the whole
// transcript, not one per flash, and the saved Word size is never changed.
//
// Measuring text in pixels is the page's job. The arithmetic is here. The
// desktop file is tkinter and cannot be run on the fixture machine, so the
// tests use values worked out by hand.
import type { ChunkText } from './reader';
import { pyLength, pyRound } from './pythonText';

/** The font is never drawn smaller than this share of the chosen size. */
export const FIT_FLOOR_RATIO = 0.6;

/** Kept clear on each side of the reading row, px. */
export const FIT_SIDE_MARGIN_PX = 8;

/** How many of the longest chunks are measured in real pixels. */
export const FIT_WIDEST_CANDIDATES = 12;

/**
 * The chunks worth measuring: the longest by characters on their wider side.
 * Character count is a close but not exact stand-in for width, so a few are
 * taken and the page measures those. Ties keep their order in the text.
 */
export function fitCandidates(texts: readonly ChunkText[]): ChunkText[] {
  const reach = (text: ChunkText) => Math.max(pyLength(text.before), pyLength(text.after));
  return [...texts].sort((a, b) => reach(b) - reach(a)).slice(0, FIT_WIDEST_CANDIDATES);
}

/**
 * The row width a flash needs. It is centred on its focus letter, not on its
 * middle, so the row must hold twice the longer side: the part before the
 * letter or the part after it, each with half the letter.
 */
export function requiredWidth(beforeWidth: number, focusWidth: number, afterWidth: number): number {
  return 2 * Math.max(beforeWidth + focusWidth / 2, afterWidth + focusWidth / 2);
}

/**
 * The size to draw at. requiredPerSize is the widest chunk's required width
 * divided by the font size it was measured at (width grows evenly with the
 * size). null or 0 means nothing was measured, and a row of 1 px or less
 * means the row has no size yet: both give the chosen size.
 */
export function fitRenderSize(
  chosenSize: number,
  requiredPerSize: number | null,
  rowWidth: number,
): number {
  if (requiredPerSize === null || !(requiredPerSize > 0)) return chosenSize;
  const usable = rowWidth - 2 * FIT_SIDE_MARGIN_PX;
  if (usable <= 1) return chosenSize;
  const floor = Math.max(8, pyRound(chosenSize * FIT_FLOOR_RATIO));
  const fit = Math.trunc(usable / requiredPerSize);
  return Math.max(floor, Math.min(chosenSize, fit));
}
