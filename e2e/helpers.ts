import type { Page } from '@playwright/test';

// After a click, the app lets go of the clicked control on a timer, so the
// reading keys work again (src/ui/usePointerLetsGoOfFocus.ts). A person
// cannot reach for the keyboard that fast. A test can: it may focus
// something and press a key before the timer has run, and then the timer
// takes the focus away and the key goes nowhere.
//
// This waits for one turn of the page's own timers, which also runs the
// one the app set at the click, because timers with the same wait run in
// the order they were set. Call it after a click and before focus() or a
// key press. It is not needed after a key press, only after a pointer.
export async function letTheClickSettle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }),
  );
}
