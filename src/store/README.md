# src/store

Saved data: IndexedDB and localStorage, behind small interfaces.

- May import from `core` only.
- No React.

- `contract.ts`: the types the store promises to the UI.
- `schema.ts`: where the data lives in the browser, and in what shape.
- `libraryStore.ts`: the library the page shows, kept current and saved.
  The rules for changing it are pure functions in `src/core/library.ts`.
- `indexedDbLibrary.ts`: the saved record in IndexedDB. Only the browser
  tests in `e2e/` can run it.
- `memoryPersistence.ts`: the same thing in memory, for tests.
- `settingsStore.ts`: the app-wide settings, kept in `localStorage`. The
  rules are in `src/core/settings.ts`.
- `storageHealth.ts`: asking the browser not to clear the data.

What is done and what is left is in
[docs/handoff/phase-3-progress.md](../../docs/handoff/phase-3-progress.md).
