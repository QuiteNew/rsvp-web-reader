import { describe, expect, test } from 'vitest';
import { shortcutFor, type FocusKind, type KeyPress } from './shortcuts';

function press(key: string, parts: Partial<KeyPress> = {}): KeyPress {
  return { key, ctrl: false, meta: false, alt: false, repeat: false, ...parts };
}

describe('shortcutFor', () => {
  test('the keymap of the desktop', () => {
    expect(shortcutFor(press(' '), 'other')).toBe('togglePause');
    expect(shortcutFor(press('ArrowLeft'), 'other')).toBe('skipBack');
    expect(shortcutFor(press('ArrowRight'), 'other')).toBe('skipForward');
    expect(shortcutFor(press('r'), 'other')).toBe('restart');
    expect(shortcutFor(press('R'), 'other')).toBe('restart');
    expect(shortcutFor(press('Escape'), 'other')).toBe('stop');
    expect(shortcutFor(press('b'), 'other')).toBe('toggleBookmark');
    expect(shortcutFor(press('B'), 'other')).toBe('toggleBookmark');
    expect(shortcutFor(press('c'), 'other')).toBe('centerPan');
    expect(shortcutFor(press('C'), 'other')).toBe('centerPan');
  });

  test('other keys are nothing', () => {
    expect(shortcutFor(press('a'), 'other')).toBeNull();
    expect(shortcutFor(press('Enter'), 'other')).toBeNull();
    // Not a key of the prototype chain either.
    expect(shortcutFor(press('constructor'), 'other')).toBeNull();
  });

  test("with Ctrl, Cmd or Alt the key is the browser's", () => {
    expect(shortcutFor(press('r', { ctrl: true }), 'other')).toBeNull();
    expect(shortcutFor(press('r', { meta: true }), 'other')).toBeNull();
    expect(shortcutFor(press('ArrowLeft', { alt: true }), 'other')).toBeNull();
  });

  test('while typing nothing fires', () => {
    for (const key of [' ', 'ArrowLeft', 'r', 'b', 'Escape']) {
      expect(shortcutFor(press(key), 'text')).toBeNull();
    }
  });

  test('Space is left to a control that it already works', () => {
    const kinds: FocusKind[] = ['button', 'toggle', 'choice'];
    for (const kind of kinds) expect(shortcutFor(press(' '), kind)).toBeNull();
    expect(shortcutFor(press(' '), 'slider')).toBe('togglePause');
  });

  test('the arrows are left to a slider, a radio button and a dropdown', () => {
    const kinds: FocusKind[] = ['slider', 'toggle', 'choice'];
    for (const kind of kinds) expect(shortcutFor(press('ArrowRight'), kind)).toBeNull();
    expect(shortcutFor(press('ArrowRight'), 'button')).toBe('skipForward');
  });

  test('letters and Escape work from a button or a slider', () => {
    expect(shortcutFor(press('r'), 'button')).toBe('restart');
    expect(shortcutFor(press('b'), 'slider')).toBe('toggleBookmark');
    expect(shortcutFor(press('Escape'), 'button')).toBe('stop');
  });

  test('a held key repeats for the arrows only', () => {
    expect(shortcutFor(press('ArrowRight', { repeat: true }), 'other')).toBe('skipForward');
    expect(shortcutFor(press(' ', { repeat: true }), 'other')).toBeNull();
    expect(shortcutFor(press('r', { repeat: true }), 'other')).toBeNull();
    expect(shortcutFor(press('b', { repeat: true }), 'other')).toBeNull();
  });
});
