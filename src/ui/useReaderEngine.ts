import { useEffect, useState, useSyncExternalStore } from 'react';

import { browserClock, browserVisibility } from '../engine/browserClock';
import type { Clock, PageVisibility, ReaderEngine, ReaderSnapshot } from '../engine/contract';
import { ReaderLoop } from '../engine/readerEngine';

export interface ReaderEngineParts {
  // Tests hand in a clock and a tab they move by hand. The app leaves both
  // out and gets the browser's.
  readonly clock?: Clock;
  readonly visibility?: PageVisibility;
}

// Gives a component the reading loop and the latest snapshot of it.
//
// The loop is made once and lives as long as the component. It is not kept
// in React state word by word: the loop owns the timer, and React only
// hears "something changed" and reads the new snapshot. That is what
// useSyncExternalStore is for, and it keeps the timing out of the
// component's own render cycle.
export function useReaderEngine(parts: ReaderEngineParts = {}): [ReaderEngine, ReaderSnapshot] {
  const [engine] = useState(
    () =>
      new ReaderLoop({
        clock: parts.clock ?? browserClock,
        visibility: parts.visibility ?? browserVisibility,
      }),
  );
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);

  // When the component goes away, stop the timer. unload() and not
  // dispose(): in development React mounts a component, takes it down and
  // mounts it again to catch mistakes, and the loop has to survive that.
  useEffect(() => {
    return () => {
      engine.unload();
    };
  }, [engine]);

  return [engine, snapshot];
}
