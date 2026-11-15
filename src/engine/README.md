# src/engine

The reading loop: the clock and the timer, built on `core`.

- May import from `core` only.
- No React. The UI subscribes to the engine, the engine does not know the UI.

`contract.ts` holds the types the engine promises to the UI. The class that
implements them is the next job of phase 2. See
[docs/handoff/phase-2-rest.md](../../docs/handoff/phase-2-rest.md).
