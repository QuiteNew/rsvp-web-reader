import type { CSSProperties } from 'react';

import type { ChunkText, PeripheralContext } from '../core/reader';
import { guideMarkLength, peripheralContextSize } from '../core/guideMarks';
import styles from './WordDisplay.module.css';

export interface GuideMarks {
  // Shown only while words are going by, as on the desktop.
  readonly visible: boolean;
  readonly horizontal: boolean;
  readonly thicknessPx: number;
  readonly lengthPercent: number;
  readonly color: string;
}

interface WordDisplayProps {
  // The text to show, split around its focus letter. null shows nothing.
  readonly chunk: ChunkText | null;
  readonly fontSize: number;
  // The focus letter only, moved up (positive) or down (negative), in px.
  readonly offsetPx: number;
  readonly marks: GuideMarks;
  // The surrounding-words line and its dimmed colour. null shows none.
  readonly context: PeripheralContext | null;
  readonly contextColor: string;
}

// The flashing word. The focus letter sits in the middle column of a grid
// whose two outer columns are always the same width, so the letter stays
// on one spot however long the word is. The eye never has to move.
//
// The guide marks are two short bars above and below that letter, and
// optionally two long ticks across the outer ends of the bars. They keep a
// fixed gap from the letter's edge, and follow it when it is moved up or
// down. They are drawn here and not on the desktop's canvas, so they are
// plain elements that the style sheet places.
//
// This is not a live region on purpose. A screen reader must not be made
// to read words out one by one at reading speed.
export function WordDisplay({
  chunk,
  fontSize,
  offsetPx,
  marks,
  context,
  contextColor,
}: WordDisplayProps) {
  const hasFocus = (chunk?.focus ?? '') !== '';
  const style = {
    '--size': `${fontSize}px`,
    '--offset': `${offsetPx}px`,
    '--half': hasFocus ? '0.6em' : '0px',
    '--mark-thickness': `${marks.thicknessPx}px`,
    '--mark-length': `${guideMarkLength(fontSize, marks.lengthPercent)}px`,
    '--mark-color': marks.color,
    '--context-size': `${peripheralContextSize(fontSize)}px`,
    '--context-color': contextColor,
  } as CSSProperties;
  return (
    <div className={styles.display} style={style}>
      <div className={styles.row} data-testid="word">
        <span className={styles.before}>{chunk?.before ?? ''}</span>
        <span className={styles.focus}>{chunk?.focus ?? ''}</span>
        <span className={styles.after}>{chunk?.after ?? ''}</span>
      </div>
      {context?.current != null && (
        <div className={styles.context} data-testid="context" aria-hidden="true">
          <span className={styles.contextBefore}>{context.before.join(' ')}</span>
          <span>{context.current}</span>
          <span className={styles.contextAfter}>{context.after.join(' ')}</span>
        </div>
      )}
      {marks.visible && (
        <div className={styles.marks} data-testid="guide-marks" aria-hidden="true">
          <span className={`${styles.mark} ${styles.above}`} />
          <span className={`${styles.mark} ${styles.below}`} />
          {marks.horizontal && (
            <>
              <span className={`${styles.tick} ${styles.tickAbove}`} />
              <span className={`${styles.tick} ${styles.tickBelow}`} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
