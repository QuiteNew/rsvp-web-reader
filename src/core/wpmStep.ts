// Changing the reading speed one step at a time, for the Up and Down arrow
// keys. Ported from core/wpm_step.py of the desktop app.

/**
 * The slowest and fastest speed Settings allows, in words per minute.
 * WPM_RANGE in the desktop's core/settings_store.py. It lives here until
 * the settings are ported, then it moves there.
 */
export const WPM_RANGE: readonly [low: number, high: number] = [100, 1000];

export const WPM_KEY_STEP = 10;

/**
 * The speed one step faster (direction above 0) or slower (anything else)
 * than wpm. It always lands on a multiple of WPM_KEY_STEP, the same values
 * the speed slider stops at, so 305 goes to 310 or 300 and not to 315 or
 * 295. It never leaves WPM_RANGE, so at either end the speed stays put.
 */
export function stepWpm(wpm: number, direction: number): number {
  // Math.floor is Python's //, which rounds down for negative numbers too.
  const stepped =
    direction > 0
      ? (Math.floor(wpm / WPM_KEY_STEP) + 1) * WPM_KEY_STEP
      : Math.floor((wpm - 1) / WPM_KEY_STEP) * WPM_KEY_STEP;
  const [low, high] = WPM_RANGE;
  return Math.max(low, Math.min(high, stepped));
}
