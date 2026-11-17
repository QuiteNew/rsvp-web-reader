import { useState } from 'react';

import { bookmarkName, bookmarkPosition } from '../core/bookmarkList';
import type { Bookmark } from '../core/models';
import { Dialog } from './Dialog';
import styles from './Dialog.module.css';
import { PencilIcon } from './Icons';

interface BookmarksDialogProps {
  readonly bookmarks: readonly Bookmark[];
  readonly totalWords: number;
  // False when there is no word to bookmark (nothing loaded, or finished).
  readonly canBookmarkHere: boolean;
  readonly isHereBookmarked: boolean;
  readonly onToggleHere: () => void;
  readonly onJump: (index: number) => void;
  readonly onDelete: (index: number) => void;
  readonly onRename: (index: number, label: string) => void;
  readonly onClose: () => void;
}

// The bookmarks of the transcript being read: add or remove one at the
// current word, go to one, give one a name, delete one.
//
// The desktop renames with a double click on the row. Here it is a pencil
// button, so that it can be reached with the keyboard alone.
export function BookmarksDialog({
  bookmarks,
  totalWords,
  canBookmarkHere,
  isHereBookmarked,
  onToggleHere,
  onJump,
  onDelete,
  onRename,
  onClose,
}: BookmarksDialogProps) {
  // The word index of the bookmark being renamed, and the text typed so far.
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  return (
    <Dialog title="Bookmarks" onClose={onClose}>
      <button
        type="button"
        className={styles.action}
        // Focus starts here, so the list can be used with the keyboard alone.
        autoFocus
        disabled={!canBookmarkHere}
        onClick={onToggleHere}
      >
        {canBookmarkHere && isHereBookmarked ? 'Remove bookmark here' : 'Add bookmark here'}
      </button>
      {bookmarks.length === 0 ? (
        <p className={`${styles.note} ${styles.quiet} ${styles.listTop}`}>No bookmarks yet.</p>
      ) : (
        <ul className={`${styles.spaces} ${styles.listTop}`}>
          {bookmarks.map((bookmark) => {
            const name = bookmarkName(bookmark);
            const position = bookmarkPosition(bookmark, totalWords);
            const called = name === '' ? position : name;
            return (
              <li key={bookmark.index} className={styles.spaceRow}>
                {renaming === bookmark.index ? (
                  <form
                    className={styles.renameForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const label = draft.trim();
                      // An empty name is a real answer: it clears the label
                      // and the row shows the snippet again.
                      if (label !== bookmark.label) onRename(bookmark.index, label);
                      setRenaming(null);
                    }}
                  >
                    <input
                      className={styles.input}
                      aria-label={`Name for the bookmark at ${position}`}
                      autoFocus
                      value={draft}
                      onChange={(event) => {
                        setDraft(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Escape') return;
                        // Escape gives up the rename only, not the dialog.
                        event.stopPropagation();
                        event.nativeEvent.stopImmediatePropagation();
                        setRenaming(null);
                      }}
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className={`${styles.spaceName} ${styles.bookmarkName}`}
                    aria-label={name === '' ? `Go to ${position}` : `Go to ${name}, ${position}`}
                    onClick={() => {
                      onJump(bookmark.index);
                    }}
                  >
                    {name !== '' && <span className={styles.bookmarkText}>{name}</span>}
                    <span className={styles.bookmarkPosition}>{position}</span>
                  </button>
                )}
                <button
                  type="button"
                  className={styles.small}
                  aria-label={`Rename ${called}`}
                  onClick={() => {
                    setDraft(bookmark.label);
                    setRenaming(bookmark.index);
                  }}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  className={styles.small}
                  aria-label={`Delete ${called}`}
                  onClick={() => {
                    if (renaming === bookmark.index) setRenaming(null);
                    onDelete(bookmark.index);
                  }}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
