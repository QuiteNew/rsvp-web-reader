import { useState } from 'react';

import type { ChunkMode } from '../core/models';
import { CHUNK_CHAR_TARGET_RANGE, CHUNK_SIZE_RANGE } from '../core/settings';
import type { ChunkingChoice } from '../store/contract';
import { Dialog } from './Dialog';
import styles from './Dialog.module.css';
import { RangeSetting } from './RangeSetting';

type Target = 'current' | 'defaults';

interface ChunkingDialogProps {
  // The chunking of the open transcript, or null when none is open.
  readonly current: ChunkingChoice | null;
  // What new transcripts start with.
  readonly defaults: ChunkingChoice;
  readonly onApplyCurrent: (choice: ChunkingChoice) => void;
  readonly onApplyDefaults: (choice: ChunkingChoice) => void;
  readonly onClose: () => void;
}

// Every chunking setting in one place, as in the desktop's Chunking window:
// on or off, fixed or adaptive, the word count and the width. A choice at
// the top says whether Apply changes the open transcript or what new
// transcripts start with. Nothing changes until Apply.
export function ChunkingDialog({
  current,
  defaults,
  onApplyCurrent,
  onApplyDefaults,
  onClose,
}: ChunkingDialogProps) {
  const [target, setTarget] = useState<Target>(current === null ? 'defaults' : 'current');
  const [draft, setDraft] = useState<ChunkingChoice>(current ?? defaults);
  const [status, setStatus] = useState('');

  function switchTo(next: Target): void {
    setTarget(next);
    // The controls show what the chosen target holds now.
    setDraft(next === 'current' && current !== null ? current : defaults);
    setStatus('');
  }

  function change(changes: Partial<ChunkingChoice>): void {
    setDraft({ ...draft, ...changes });
    setStatus('');
  }

  return (
    <Dialog title="Chunking" onClose={onClose}>
      <fieldset className={styles.group}>
        <legend>Apply to</legend>
        {current !== null && (
          <label className={styles.note}>
            <input
              type="radio"
              name="chunking-target"
              checked={target === 'current'}
              onChange={() => {
                switchTo('current');
              }}
            />{' '}
            This transcript
          </label>
        )}
        <label className={styles.note}>
          <input
            type="radio"
            name="chunking-target"
            checked={target === 'defaults'}
            onChange={() => {
              switchTo('defaults');
            }}
          />{' '}
          New transcripts
        </label>
        <p className={`${styles.note} ${styles.quiet}`}>
          {current !== null
            ? '"This transcript" changes the one open now and takes effect as you read. "New transcripts" sets what transcripts created later start with.'
            : 'No transcript is open, so these set what transcripts created later start with. Open one to change it on its own.'}
        </p>
      </fieldset>

      <label className={styles.note}>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => {
            change({ enabled: event.target.checked });
          }}
        />{' '}
        Group words together
      </label>
      <p className={`${styles.note} ${styles.quiet}`}>
        When on, the reader flashes several words at once instead of one at a time, so your eyes
        move less across each flash.
      </p>

      <label className={styles.note}>
        Group size{' '}
        <select
          value={draft.mode}
          onChange={(event) => {
            change({ mode: event.target.value as ChunkMode });
          }}
        >
          <option value="fixed">Fixed</option>
          <option value="adaptive">Adaptive</option>
        </select>
      </label>
      <p className={`${styles.note} ${styles.quiet}`}>
        Fixed shows a set number of words per group. Adaptive instead fills each group up to a
        character width, so short words pack together and long ones do not crowd the line. Either
        way a group never runs past the end of a sentence.
      </p>

      <RangeSetting
        label="Words per group"
        range={CHUNK_SIZE_RANGE}
        value={draft.size}
        unit=" words"
        onChange={(size) => {
          change({ size });
        }}
      />
      <p className={`${styles.note} ${styles.quiet}`}>Used in Fixed mode.</p>

      <RangeSetting
        label="Group width"
        range={CHUNK_CHAR_TARGET_RANGE}
        value={draft.charTarget}
        unit=" chars"
        onChange={(charTarget) => {
          change({ charTarget });
        }}
      />
      <p className={`${styles.note} ${styles.quiet}`}>
        Used in Adaptive mode, counting letters and the spaces between words.
      </p>

      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            if (target === 'current' && current !== null) {
              onApplyCurrent(draft);
              setStatus('Applied to this transcript.');
            } else {
              onApplyDefaults(draft);
              setStatus('Applied to new transcripts.');
            }
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
