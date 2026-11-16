// The numbers behind the guide marks, taken from the desktop's
// gui/components/reader_display.py. That file draws with tkinter and cannot
// be run here, so these were copied from the code and checked by hand, not
// by a fixture. The drawing itself is in src/ui/WordDisplay.tsx.
import { pyRound } from './pythonText';

/** Clearance between the focus letter's edge and the near end of a mark, px. */
export const GUIDE_MARK_MIN_GAP_PX = 6;

/** The horizontal ticks are fixed: 2 px thick. */
export const GUIDE_MARK_HORIZONTAL_THICKNESS_PX = 2;

/** Space kept between a tick's end and the reading row's edge, px. */
export const GUIDE_MARK_HORIZONTAL_EDGE_MARGIN_PX = 34;

/** The ticks are never shorter than this, px. */
export const GUIDE_MARK_HORIZONTAL_MIN_LENGTH_PX = 20;

/** The shortest a vertical mark can be, px. */
export const GUIDE_MARK_MIN_LENGTH_PX = 8;

/**
 * How long the two vertical marks are: a share of the font size, so they
 * grow with the word. The desktop keeps the share as a ratio (percent / 100)
 * and rounds with Python's round().
 */
export function guideMarkLength(fontSize: number, lengthPercent: number): number {
  return Math.max(GUIDE_MARK_MIN_LENGTH_PX, pyRound(fontSize * (lengthPercent / 100)));
}

/** How long a horizontal tick is for a reading row this wide, px. */
export function guideMarkHorizontalLength(rowWidth: number): number {
  return Math.max(
    GUIDE_MARK_HORIZONTAL_MIN_LENGTH_PX,
    pyRound(rowWidth - 2 * GUIDE_MARK_HORIZONTAL_EDGE_MARGIN_PX),
  );
}
