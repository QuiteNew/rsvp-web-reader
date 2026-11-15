// The real clock and the real tab visibility, for the browser.
//
// These are the only lines of the engine a unit test cannot reach, so they
// do nothing but pass the browser's own functions along.

import type { Clock, PageVisibility } from './contract';

export const browserClock: Clock = {
  now: () => performance.now(),
  setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimer: (handle) => {
    window.clearTimeout(handle);
  },
};

export const browserVisibility: PageVisibility = {
  isHidden: () => document.visibilityState === 'hidden',
  subscribe: (listener) => {
    document.addEventListener('visibilitychange', listener);
    return () => {
      document.removeEventListener('visibilitychange', listener);
    };
  },
};
