import { useState } from 'react';

import type { Library } from '../core/models';
import type { LibraryStore } from '../store/contract';
import { Dialog } from './Dialog';
import styles from './Dialog.module.css';
import { PencilIcon } from './Icons';

interface SpacesDialogProps {
  readonly library: Library;
  readonly store: Pick<LibraryStore, 'renameSpace' | 'deleteSpace'>;
  readonly onClose: () => void;
  // Called with the Space that was picked, before the dialog closes.
  readonly onSwitch: (name: string) => void;
}

// The list of Spaces: pick one, rename one, or delete an empty one.
export function SpacesDialog({ library, store, onClose, onSwitch }: SpacesDialogProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const current = library.spaces[library.currentSpaceIndex];

  function whyNotDeletable(space: string): string | null {
    if (library.spaces.length <= 1) return 'The last Space cannot be deleted';
    if (library.transcripts.some((transcript) => transcript.space === space)) {
      return 'Only an empty Space can be deleted';
    }
    return null;
  }

  return (
    <Dialog title="Select Space" onClose={onClose}>
      <h3 className={styles.heading}>Spaces</h3>
      <ul className={styles.spaces}>
        {library.spaces.map((space) => {
          const blocked = whyNotDeletable(space);
          return (
            <li key={space} className={styles.spaceRow}>
              {renaming === space ? (
                <form
                  style={{ flex: 1 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const input = event.currentTarget.elements.namedItem(
                      'name',
                    ) as HTMLInputElement;
                    // A refused name (empty or taken) just leaves the old one.
                    store.renameSpace(space, input.value);
                    setRenaming(null);
                  }}
                >
                  <input
                    name="name"
                    className={styles.input}
                    defaultValue={space}
                    aria-label={`New name for ${space}`}
                    autoFocus
                    autoComplete="off"
                    onBlur={() => {
                      setRenaming(null);
                    }}
                  />
                </form>
              ) : (
                <button
                  type="button"
                  className={styles.spaceName}
                  aria-current={space === current}
                  onClick={() => {
                    onSwitch(space);
                    onClose();
                  }}
                >
                  {space}
                </button>
              )}
              <button
                type="button"
                className={styles.small}
                aria-label={`Rename ${space}`}
                onClick={() => {
                  setRenaming(space);
                }}
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                className={styles.small}
                aria-label={`Delete ${space}`}
                title={blocked ?? undefined}
                disabled={blocked !== null}
                onClick={() => {
                  store.deleteSpace(space);
                }}
              >
                X
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
