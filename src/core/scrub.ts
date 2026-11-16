// The numbers behind the scrubber, from the desktop's gui/components/scrub_bar.py.
// That file draws with tkinter and cannot be run here, so these were copied
// from the code and are checked by hand in scrub.test.ts, not by a fixture.

/** The words "word 1,234 of 5,678" above the slider. Empty with nothing loaded. */
export function scrubReadout(index: number, total: number): string {
  if (total <= 0) return '';
  const shown = Math.max(1, Math.min(index + 1, total));
  return `word ${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`;
}

/** The slider's last stop. A finished reader is one past it and rests on the last word. */
export function scrubMax(total: number): number {
  return Math.max(0, total - 1);
}

/** Where the thumb rests for a reader at this index. */
export function scrubValue(index: number, total: number): number {
  return Math.max(0, Math.min(index, scrubMax(total)));
}

/**
 * The bookmark ticks to draw, as word indices: no repeats, in order, none
 * below 0. Indices past the last word are drawn at the end.
 */
export function scrubTickIndices(bookmarkIndices: readonly number[]): number[] {
  return [...new Set(bookmarkIndices.map((index) => Math.max(0, Math.trunc(index))))].sort(
    (a, b) => a - b,
  );
}

/** How far along the slider a tick sits, 0 to 1. A transcript with under two words has no ticks. */
export function scrubTickFraction(index: number, total: number): number {
  if (total < 2) return 0;
  return Math.max(0, Math.min(index, total - 1)) / (total - 1);
}
