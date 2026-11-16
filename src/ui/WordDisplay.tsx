import type { ChunkText } from '../core/reader';
import styles from './WordDisplay.module.css';

interface WordDisplayProps {
  // The text to show, split around its focus letter. null shows nothing.
  readonly chunk: ChunkText | null;
}

// The flashing word. The focus letter sits in the middle column of a grid
// whose two outer columns are always the same width, so the letter stays
// on one spot however long the word is. The eye never has to move.
//
// This is not a live region on purpose. A screen reader must not be made
// to read words out one by one at reading speed.
export function WordDisplay({ chunk }: WordDisplayProps) {
  return (
    <div className={styles.row} data-testid="word">
      <span className={styles.before}>{chunk?.before ?? ''}</span>
      <span className={styles.focus}>{chunk?.focus ?? ''}</span>
      <span className={styles.after}>{chunk?.after ?? ''}</span>
    </div>
  );
}
