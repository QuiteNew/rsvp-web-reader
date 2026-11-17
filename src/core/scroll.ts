// The pan arithmetic of the reader's horizontal scrollbar, ported from the
// desktop's core/scroll.py.
//
// The reader centres each flash on its focus letter, in the middle of the
// reading row. When a flash is wider than the row even after the font was
// made smaller (src/core/fit.ts), part of it falls off one or both sides. The
// scrollbar pans the flash sideways: a pan offset is added to the centre.
//
// Terms, as on the desktop:
// - viewport: the reading width that can be seen, in px.
// - overflowLeft and overflowRight: how far the widest flash reaches past
//   each side, in px, 0 when nothing spills that way.
// - pan: added to the centre, in px. Positive moves the flash right, which
//   shows what spilled off the left. Negative shows the right. It runs from
//   -overflowRight to +overflowLeft.
//
// "first" and "last" are where the scrollbar's thumb starts and ends, as
// fractions of the track: 0 at the far left, 1 at the far right.

/** The lowest and the highest pan. */
export function panRange(overflowLeft: number, overflowRight: number): [low: number, high: number] {
  return [-overflowRight, overflowLeft];
}

/** A pan kept inside its range, so the flash never moves past what is hidden. */
export function clampPan(pan: number, overflowLeft: number, overflowRight: number): number {
  const [low, high] = panRange(overflowLeft, overflowRight);
  return Math.max(low, Math.min(high, pan));
}

/**
 * Where the thumb is for a pan. The whole strip is the viewport and what
 * overflows each side, and the thumb is the viewport's share of it. With
 * nothing to pan the thumb fills the track.
 */
export function scrollbarFractions(
  viewport: number,
  overflowLeft: number,
  overflowRight: number,
  pan: number,
): [first: number, last: number] {
  const span = overflowLeft + overflowRight;
  if (viewport <= 0 || span <= 0) return [0, 1];
  const strip = viewport + span;
  const x = overflowLeft - clampPan(pan, overflowLeft, overflowRight);
  return [x / strip, (x + viewport) / strip];
}

/**
 * The pan for a thumb dragged so that its left edge is at `first`. The
 * other way round from scrollbarFractions, kept inside the range, so a drag
 * past either end stops there.
 */
export function panFromFraction(
  first: number,
  viewport: number,
  overflowLeft: number,
  overflowRight: number,
): number {
  const span = overflowLeft + overflowRight;
  if (span <= 0) return 0;
  const x = first * (viewport + span);
  return clampPan(overflowLeft - x, overflowLeft, overflowRight);
}
