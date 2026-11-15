# Status

Where the port stands. Update this at the end of every phase, and whenever a
decision is made. The plan itself is in [WEB_PORT_BRIEF.md](../WEB_PORT_BRIEF.md).

Last updated: 2026-11-15, during phase 0.

## Phases

| Phase | What                                   | State                                |
| ----- | -------------------------------------- | ------------------------------------ |
| 0     | Scaffold, CI, deploy                   | Built. Waiting for the owner's check |
| 1     | Golden fixtures and the core pipeline  | Not started                          |
| 2     | The reading session and a first screen | Not started                          |
| 3     | Saved data                             | Not started                          |
| 4     | The reading experience                 | Not started                          |
| 5     | Importing files                        | Not started. Undecided on purpose    |
| 6     | Comfort and the rest                   | Not started                          |
| 7     | Offline and polish                     | Not started                          |

## Phase 0: what was checked, and where

Run in a Linux scratch copy with Node 22.23 and npm 10.9, on 2026-11-15:

- `npm run check` passes: ESLint, Prettier, TypeScript, 6 Vitest tests, and a
  production build.
- The built `index.html` asks for its files under `/rsvp-web-reader/`.
- Broken on purpose, each one failed as it should and was put back:
  - `src/core` importing from `src/ui` (ESLint).
  - `src/core` importing React (ESLint).
  - `src/core` using `document` and `setTimeout` (ESLint, and TypeScript
    through `tsconfig.core.json`).
  - `src/engine` importing from `src/store` (ESLint).
  - `APP_VERSION` different from the version in `package.json` (Vitest).

Not checked there, so the owner's machine and CI are the first real run:

- Node 24 and npm 11 on Windows.
- The CI workflow and the GitHub Pages deploy. The action versions (checkout
  v7, setup-node v7, upload-pages-artifact v5, deploy-pages v5) are the newest
  tags, but their inputs were not read from their docs.

## Decisions

| Decision                           | Answer                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| React or Svelte                    | React                                                                                                                                         |
| First public version               | The page is public from phase 0, marked as early. Announce after phase 4                                                                      |
| Hosting                            | GitHub Pages first. A custom domain later, before phase 7 if at all                                                                           |
| Desktop bundle compatibility       | Promise reading desktop bundles (transcripts, Spaces, positions, bookmarks). Settings and writing bundles back are extras. Confirm in phase 3 |
| Detached window                    | Not now                                                                                                                                       |
| File import                        | Decided in phase 5, client-side only. Do not pick a parser before then                                                                        |
| TypeScript version                 | Pinned to 6.0.3. typescript-eslint 8.72 does not accept TypeScript 7                                                                          |
| `package-lock.json`                | Written by npm, not by hand. It is the one file not reviewed line by line                                                                     |
| Playwright                         | Starts in phase 2, when there is a real screen                                                                                                |
| Release guard (tag equals version) | Phase 7                                                                                                                                       |
| Who writes files                   | From 2026-11-15 the owner lets the assistant write into the web repo. The owner still commits and pushes                                      |

## Versions in use

Exact versions are pinned in `package.json`. Looked up on the npm registry on
2026-11-15: Vite 8.3.8, React 19.3.1, TypeScript 6.0.3, Vitest 5.1.0, ESLint
10.15.0, typescript-eslint 8.72.2, Prettier 3.10.1, jsdom 31.0.1, Testing
Library for React 16.3.3. Node 24 in CI (`.nvmrc`).

## Traps found while reading the desktop code

These are not in the brief. Each needs fixture cases in phase 1.

- **Rounding.** Python's `round()` rounds a half to the nearest even number,
  `Math.round` rounds it up. `wpm_to_delay_ms(192)` is 312 in Python. Core
  needs its own round-half-to-even helper, used wherever the Python calls
  `round()`.
- **Whitespace.** `str.split()`, `str.strip()` and `\s` in Python do not agree
  with JavaScript's `\s` and `trim()` on every character (the byte order mark
  and a few control characters differ).
- **Letters and digits.** `str.isalnum()` and `\d` are Unicode-aware in
  Python. In JavaScript `\d` is ASCII only.
- **`$` in a multi-line regex.** Python stops only before `\n`. JavaScript
  also stops before `\r` and two rare line separators.
- **Counting characters.** Python counts code points. Use `Array.from` or a
  `for...of` loop, never `.length` on a string, and never `Intl.Segmenter`,
  which counts something else again.
- **Python version.** The desktop app targets Python 3.13. Its Unicode tables
  are newer than Python 3.11's, so generate fixtures with 3.13 and record the
  Python and Unicode versions inside each fixture file.

## Desktop modules the brief's table leaves out

- `models`: becomes the core types.
- `app_info`: `src/core/appInfo.ts`, done.
- `colors`, `settings_search`: decide in phases 3 and 4.
