import { useEffect, useId, type ReactNode } from 'react';

import styles from './Dialog.module.css';

interface DialogProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  // A wider window, for Settings.
  readonly wide?: boolean;
}

// The dialogs open now, the newest last. A dialog can open over another
// (Chunking over Settings), and Escape is for the one on top only.
const openDialogs: string[] = [];

// A small window over the page, like the desktop app's pop-up windows.
// Escape and a click beside it both close it.
export function Dialog({ title, onClose, children, wide = false }: DialogProps) {
  const titleId = useId();

  useEffect(() => {
    openDialogs.push(titleId);
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && openDialogs.at(-1) === titleId) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openDialogs.splice(openDialogs.indexOf(titleId), 1);
    };
  }, [onClose, titleId]);

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={wide ? `${styles.window} ${styles.wide}` : styles.window}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.titleBar}>
          <span id={titleId}>{title}</span>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

interface NameDialogProps {
  readonly title: string;
  readonly label: string;
  readonly confirm: string;
  readonly onClose: () => void;
  // Returns a message when the name is refused, or null when it was taken.
  readonly onSubmit: (name: string) => string | null;
}

// A dialog that asks for one name: a new Space, or a new transcript's title.
export function NameDialog({ title, label, confirm, onClose, onSubmit }: NameDialogProps) {
  const inputId = useId();
  return (
    <Dialog title={title} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem('name') as HTMLInputElement;
          const problem = onSubmit(input.value);
          if (problem === null) onClose();
          else input.setCustomValidity(problem);
          input.reportValidity();
        }}
      >
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
        <input
          id={inputId}
          name="name"
          className={styles.input}
          autoFocus
          autoComplete="off"
          onInput={(event) => {
            event.currentTarget.setCustomValidity('');
          }}
        />
        <div className={styles.buttons}>
          <button type="button" className={styles.action} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={styles.action}>
            {confirm}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
