// The reading shortcuts and when a key press is one. The keys are the
// desktop's (its keyboard-shortcuts design note): Space, the arrows, R, Esc,
// B, and C, which centres a flash panned with the scrollbar. The rule for when they fire is the web's version of the desktop's
// guard, which only had to keep typing safe. A page also has to leave the
// browser's own keys alone, and keys that already do something to the
// control that has focus.

export type ShortcutAction =
  'togglePause' | 'skipBack' | 'skipForward' | 'restart' | 'stop' | 'toggleBookmark' | 'centerPan';

/** A key press, as much of it as the rule needs. */
export interface KeyPress {
  // KeyboardEvent.key: ' ', 'ArrowLeft', 'r', 'Escape' and so on.
  readonly key: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
  // True for the repeats of a key that is held down.
  readonly repeat: boolean;
}

/**
 * What has the keyboard's attention:
 * - text: a place to type (a text box, a text area, an editable element)
 * - button: a button or a link, which Space presses
 * - toggle: a checkbox or a radio button, which Space switches
 * - slider: a range input or a scrollbar, which the arrow keys move
 * - choice: a dropdown, which both Space and the arrows work
 * - other: the page itself, or anything that takes no keys
 */
export type FocusKind = 'text' | 'button' | 'toggle' | 'slider' | 'choice' | 'other';

// A Map, not a plain object: an object would also answer to inherited
// names such as "constructor".
const KEYS: ReadonlyMap<string, ShortcutAction> = new Map([
  [' ', 'togglePause'],
  ['ArrowLeft', 'skipBack'],
  ['ArrowRight', 'skipForward'],
  ['r', 'restart'],
  ['R', 'restart'],
  ['Escape', 'stop'],
  ['b', 'toggleBookmark'],
  ['B', 'toggleBookmark'],
  ['c', 'centerPan'],
  ['C', 'centerPan'],
]);

/**
 * The reading action a key press stands for, or null when it is not a
 * shortcut right now.
 *
 * - With Ctrl, Cmd or Alt held it belongs to the browser (Ctrl+R reloads).
 * - While typing, every key is text.
 * - Space is left to a focused button, checkbox, radio button or dropdown,
 *   which it already works. Otherwise one press would do two things.
 * - The arrows are left to a focused slider, radio button or dropdown.
 * - A held key repeats only for the arrows, so holding Space does not
 *   flicker between play and pause.
 */
export function shortcutFor(press: KeyPress, focus: FocusKind): ShortcutAction | null {
  if (press.ctrl || press.meta || press.alt) return null;
  if (focus === 'text') return null;
  const action = KEYS.get(press.key);
  if (action === undefined) return null;
  const isArrow = action === 'skipBack' || action === 'skipForward';
  if (press.repeat && !isArrow) return null;
  if (
    action === 'togglePause' &&
    (focus === 'button' || focus === 'toggle' || focus === 'choice')
  ) {
    return null;
  }
  if (isArrow && (focus === 'slider' || focus === 'toggle' || focus === 'choice')) return null;
  return action;
}
