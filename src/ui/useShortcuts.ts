import { useEffect, useRef } from 'react';

import { shortcutFor, type FocusKind, type ShortcutAction } from '../core/shortcuts';

// What kind of thing the key press went to, for the rule in core/shortcuts.
function focusKind(target: EventTarget | null): FocusKind {
  if (!(target instanceof HTMLElement)) return 'other';
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return 'text';
  if (target instanceof HTMLSelectElement) return 'choice';
  if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return 'button';
  if (target instanceof HTMLInputElement) {
    if (target.type === 'range') return 'slider';
    if (target.type === 'checkbox' || target.type === 'radio') return 'toggle';
    if (target.type === 'button' || target.type === 'submit' || target.type === 'color') {
      return 'button';
    }
    return 'text';
  }
  return 'other';
}

/**
 * Listens for the reading shortcuts on the whole page while enabled is true,
 * and calls onAction for each. A key that was a shortcut does nothing else
 * (Space does not scroll the page).
 */
export function useShortcuts(enabled: boolean, onAction: (action: ShortcutAction) => void): void {
  // The newest handler, so the listener is not taken off and put back on
  // every time the page draws.
  const handler = useRef(onAction);
  useEffect(() => {
    handler.current = onAction;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    function onKeyDown(event: KeyboardEvent): void {
      const action = shortcutFor(
        {
          key: event.key,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          alt: event.altKey,
          repeat: event.repeat,
        },
        focusKind(event.target),
      );
      if (action === null) return;
      event.preventDefault();
      handler.current(action);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled]);
}
