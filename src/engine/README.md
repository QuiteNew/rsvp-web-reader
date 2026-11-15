# src/engine

The reading loop: the clock and the timer, built on `core`.

- May import from `core` only.
- No React. The UI subscribes to the engine, the engine does not know the UI.

What is here:

- `contract.ts`: the types the engine promises to the UI.
- `readerEngine.ts`: `ReaderLoop`, the class behind those types.
- `browserClock.ts`: the real clock and tab visibility, for the browser.

Tests move time by hand with the fake clock in `src/testing/fakeClock.ts`.
