# src/core

Pure TypeScript: the reading logic, ported from the desktop app's `core/`.

- No DOM, no React, no timers, no storage, no network.
- Imports nothing from `engine`, `store` or `ui`.
- Takes what it needs as arguments and returns plain data.

Two checks enforce this: the ESLint rules in `eslint.config.js`, and
`tsconfig.core.json`, which type-checks this folder without the browser's types.
