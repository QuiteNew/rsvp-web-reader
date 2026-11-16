import type { CSSProperties } from 'react';

import {
  scrubMax,
  scrubReadout,
  scrubTickFraction,
  scrubTickIndices,
  scrubValue,
} from '../core/scrub';
import styles from './Scrubber.module.css';

interface ScrubberProps {
  readonly total: number;
  readonly index: number;
  // The word index of each bookmark of the transcript.
  readonly bookmarks: readonly number[];
  // Called for every move of the thumb, by mouse, finger or keys.
  readonly onMove: (index: number) => void;
  // Called when the drag is over: the button or finger is up, or the key is
  // let go, or the slider lost focus.
  readonly onEnd: () => void;
}

// The reading position as a slider with "word X of Y" above it and a row of
// ticks below it, one for each bookmark, under the spot the thumb rests at
// that word. The ticks are a separate row, not laid over the slider, so they
// can never swallow a drag. With under two words there is nothing to scrub
// and the slider is off.
export function Scrubber({ total, index, bookmarks, onMove, onEnd }: ScrubberProps) {
  const readout = scrubReadout(index, total);
  return (
    <div className={styles.scrubber}>
      <span className={styles.readout}>{readout}</span>
      <input
        type="range"
        className={styles.slider}
        aria-label="Position"
        aria-valuetext={readout}
        min={0}
        max={scrubMax(total)}
        step={1}
        value={scrubValue(index, total)}
        disabled={total < 2}
        onChange={(event) => {
          onMove(Number(event.target.value));
        }}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onKeyUp={onEnd}
        onBlur={onEnd}
      />
      <div className={styles.ticks} aria-hidden="true">
        {scrubTickIndices(bookmarks).map((tick) => (
          <span
            key={tick}
            className={styles.tick}
            data-testid="bookmark-tick"
            style={{ '--fraction': scrubTickFraction(tick, total) } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
