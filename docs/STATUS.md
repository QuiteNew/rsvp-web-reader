# Status

Where the port stands. Update this at the end of every phase, and whenever a
decision is made. The plan itself is in [WEB_PORT_BRIEF.md](../WEB_PORT_BRIEF.md).

Last updated: 2026-11-15, at the end of phase 1.

## Phases

| Phase | What                                   | State                                                       |
| ----- | -------------------------------------- | ----------------------------------------------------------- |
| 0     | Scaffold, CI, deploy                   | Pushed. The owner still has to confirm CI and the live page |
| 1     | Golden fixtures and the core pipeline  | Built. Waiting for the owner's check                        |
| 2     | The reading session and a first screen | Not started                                                 |
| 3     | Saved data                             | Not started                                                 |
| 4     | The reading experience                 | Not started                                                 |
| 5     | Importing files                        | Not started. Undecided on purpose                           |
| 6     | Comfort and the rest                   | Not started                                                 |
| 7     | Offline and polish                     | Not started                                                 |

## Phase 0: what was checked, and where

Run in a Linux scratch copy with Node 22.23 and npm 10.9, and again by the
owner on Windows with Node 24.15 and npm 11.12, on 2026-11-15:

- `npm run check` passes: ESLint, Prettier, TypeScript, the Vitest tests, and
  a production build.
- The built `index.html` asks for its files under `/rsvp-web-reader/`.
- Broken on purpose in the scratch copy, each one failed as it should and was
  put back:
  - `src/core` importing from `src/ui` (ESLint).
  - `src/core` importing React (ESLint).
  - `src/core` using `document` and `setTimeout` (ESLint, and TypeScript
    through `tsconfig.core.json`).
  - `src/engine` importing from `src/store` (ESLint).
  - `APP_VERSION` different from the version in `package.json` (Vitest).

Not confirmed yet:

- That the CI run is green and the page loads at
  https://quitenew.github.io/rsvp-web-reader/. The assistant cannot open
  either, so the owner checks. The action versions (checkout v7, setup-node
  v7, upload-pages-artifact v5, deploy-pages v5) are the newest tags, but
  their inputs were not read from their docs.

Loose ends:

- `npm ci` reports 7 moderate findings from `npm audit`. Not looked at yet.
- Dependabot opened its first pull request right after the push. Nothing in
  it has been reviewed. Do not merge it without running `npm run check`.

## Phase 1: what was ported, and how it was checked

Fixtures were generated on 2026-11-15 with Python 3.13 (Unicode 15.1) from
desktop commit `8112ff1`, version 4.1.1. The script ran twice with identical
output, and the desktop clone had no changes and no `__pycache__` afterwards.

| Module            | Port                      | Fixture cases                     | Tests ported from     |
| ----------------- | ------------------------- | --------------------------------- | --------------------- |
| Python text rules | `src/core/pythonText.ts`  | every character Python 3.13 knows | none, new             |
| `tokenizer`       | `src/core/tokenizer.ts`   | 133                               | `test_tokenizer.py`   |
| `orp`             | `src/core/orp.ts`         | 979                               | `test_orp.py`         |
| `punctuation`     | `src/core/punctuation.ts` | 465                               | `test_punctuation.py` |
| `timing`          | `src/core/timing.ts`      | 5,929                             | `test_timing.py`      |
| `parser`          | `src/core/parser.ts`      | 408                               | `test_parser.py`      |

`npm run check` passes with 206 tests, in the scratch copy (Node 22).

Broken on purpose, one at a time. Every one made at least one test fail:

- `pyRound` replaced by `Math.round`.
- Characters counted in UTF-16 units.
- Letters and numbers limited to ASCII.
- Digits limited to 0 to 9.
- JavaScript's own `\s` in place of Python's list of spaces.
- The end-of-line check also stopping at a carriage return.
- Each of the five tidy steps in `stripTimestamps` dropped.
- An ORP band boundary moved from 5 to 6.
- The question mark taken out of the sentence marks.
- The hyphen bonus changed from 4 to 3.
- The long word multiplier changed from 1.45 to 1.5.
- The minutes in `formatDuration` left unpadded.

One of these found a hole. Dropping the "separator before a closing
bracket" step failed nothing at first, because no input had a timestamp
directly before a closing bracket with a separator in front, such as
`(done, [0:30])`. Four such inputs were added to the fixture script. The
desktop tests in `test_parser.py` have no such case either. That is for the
desktop project to decide on, and nothing was changed there.

Known difference that is accepted: `isPyAlnum` and `PY_DIGIT` use the
browser's Unicode tables. For characters added to Unicode after version 15.1
a browser can answer differently from Python 3.13. The character test skips
those.

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

These are not in the brief. Phase 1 handles all of them in
`src/core/pythonText.ts`, and [PORTING.md](PORTING.md) has the full table.

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
