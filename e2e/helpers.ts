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

// The reader moves on by the page's own timers, so a test that clicks Start
// reading and then Pause races them. On a slow machine a short text can be
// read to the end before the Pause click lands, and then there is nothing
// left to pause: the button turns into Play and stays disabled. The click
// can also land a word or two in, and then the screen shows another word
// than the test expects. Both happened in WebKit when all three browsers ran
// at once.
//
// installClock() puts Playwright's clock in place of the page's. Call it
// before the page is opened. The clock runs at normal speed, so nothing
// else changes. startReadingPaused() stops it for the two clicks and lets it
// run again after, so the reader is always paused on the first word, however
// slow the machine is.
export async function installClock(page: Page): Promise<void> {
  await page.clock.install();
}

export async function startReadingPaused(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
  await page.getByRole('button', { name: 'Start reading' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.clock.resume();
}
