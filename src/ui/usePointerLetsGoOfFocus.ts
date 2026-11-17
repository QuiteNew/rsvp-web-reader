import { useEffect } from 'react';

// On the desktop a click on a button, a switch or a slider does not keep the
// keyboard, so Space always pauses and plays. In a browser the clicked
// control keeps the focus, and Space then goes to it instead: it presses the
// button again. So after a click or a drag with the mouse or a finger, the
// control lets go of the focus, and the reading keys work again at once.
//
// Only for a pointer. A control reached with Tab keeps the focus, so the
// keyboard works on it as it should. Text boxes, dropdowns and colour
// squares keep it too: they are for typing or open a picker. Nothing inside
// a dialog is touched, because a dialog is worked with its own keys.
function letsGo(element: Element): boolean {
  if (element instanceof HTMLButtonElement) return true;
  if (element instanceof HTMLInputElement) {
    return element.type === 'checkbox' || element.type === 'radio' || element.type === 'range';
  }
  return element.getAttribute('role') === 'scrollbar';
}

export function usePointerLetsGoOfFocus(): void {
  useEffect(() => {
    let timer: number | null = null;
    function onPointerUp(): void {
      // After the click that follows, which is what moves the focus to a
      // checkbox when its label was clicked.
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return;
        if (active.closest('[role="dialog"]') !== null) return;
        if (letsGo(active)) active.blur();
      }, 0);
    }
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      document.removeEventListener('pointerup', onPointerUp);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);
}
