# Status

Where the port stands. Update this at the end of every phase, and whenever a
decision is made. The plan itself is in [WEB_PORT_BRIEF.md](../WEB_PORT_BRIEF.md).

Last updated: 2026-11-16. Phase 2 is done. Phase 3 (saving) is next and is
not started. Its spec, the saved shapes and the storage schema are written.

## Phases

| Phase | What                                   | State                                                                                                                                                       |
| ----- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Scaffold, CI, deploy                   | Done, except the page: the first deploy failed because Pages was not switched on. The owner sets Source to GitHub Actions and re-runs it                    |
| 1     | Golden fixtures and the core pipeline  | Done. CI ran it green on Node 24                                                                                                                            |
| 2     | The reading session and a first screen | Done. The owner tried it. The desktop tests for `speakers` and `reader` are ported. The page also has the desktop layout on a library that is not saved yet |
| 3     | Saved data                             | Not started                                                                                                                                                 |
| 4     | The reading experience                 | Not started                                                                                                                                                 |
| 5     | Importing files                        | Not started. Undecided on purpose                                                                                                                           |
| 6     | Comfort and the rest                   | Not started                                                                                                                                                 |
| 7     | Offline and polish                     | Not started                                                                                                                                                 |

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

## Phase 2 so far: speakers and reader

`reader.py` imports `speakers.py`, so both were ported together, on
2026-11-15, from the same desktop commit. The owner's instruction: port
`reader.py` exactly from the code and its tests, no design notes, and where a
note and the code disagree, the code wins.

| Module     | Port                   | Fixture cases                                                          |
| ---------- | ---------------------- | ---------------------------------------------------------------------- |
| `speakers` | `src/core/speakers.ts` | 2,153 calls over 11 functions                                          |
| `reader`   | `src/core/reader.ts`   | 394 scenarios with 7,334 steps, and 355 calls of `assemble_chunk_text` |

A reader fixture is a scenario, because `ReaderSession` keeps state: a text
and options, then steps (advance, seek, change a setting), with everything
the session shows recorded after each step. The scenarios cover 25 sets of
options (speed, length pacing, warm-up, fixed and adaptive chunking, speaker
cues on automatic and on a custom list, odd start positions) over 27 texts.

`npm run check` passes with 256 tests in the scratch copy (Node 22).

Broken on purpose in two rounds, 57 breaks in all, one at a time, among
them: a chunk crossing a sentence end or a speaker's turn, the chunk limits
changed, seek and the start position not snapping to a chunk, the warm-up
ramp not ageing or not resetting, length pacing added to the pause instead of
taking the larger, the speaker pause left out, a label allowed to start with
a small letter, Auto needing a different number of appearances, `casefold`
replaced by `toLowerCase`, and lengths counted in UTF-16 units.

Three breaks failed nothing at first, and each one showed a hole in the
fixtures that is now closed:

- A label's length counted in UTF-16 units. No label had letters from
  outside the basic plane. Inputs were added.
- `Math.round` in place of `pyRound` for a word's pause, and for the time
  remaining. No scenario had a speed where a pause lands on a half. Three
  sets of options at 296 words a minute (203 ms a word) were added.

Two breaks cannot fail any test, because the code they remove can never
matter with the desktop's current values. They are listed so nobody hunts
for them again:

- The speaker pause replacing a word's own pause instead of taking the
  larger. The speaker pause is 3.5 and no other pause is above 2.5.
- Dropping the check that the speaker scan and the reader count the same
  number of words. The two always count the same.

Still to do in phase 2:

- **Port the desktop tests** for these two modules. The fixtures already
  prove the behaviour, so this is the second line of defence that
  [PORTING.md](PORTING.md) asks for, not a gap in what is known to work.
  - Done (2026-11-16): the speakers half, in
    `src/core/speakers.desktop.test.ts`. It holds `test_speakers.py`,
    `test_speaker_rows.py`, `test_whole_transcript_speakers.py` and the
    cleaner tests of `test_transcript_speaker_list.py`, each under its
    Python name. The store tests of that last file wait for phase 3.
  - Done (2026-11-16): the reader half, in
    `src/core/reader.desktop.test.ts`. It holds all of `test_reader.py` and
    `test_reader_speaker_cues.py`, the reader and model tests of
    `test_chunking.py`, and the two tests of a finished session from
    `test_edge_cases.py`. Two of them patch the reader's imports, the way
    pytest's monkeypatch does.
  - Not ported, on purpose: `test_seeking.py` and `test_context_ribbon.py`.
    Every test in them drives the desktop reader widget or the whole app.
    The engine tests cover the loop, and the ribbon comes with its screen.
  - Waiting for phase 3: the 25 store and settings tests of
    `test_chunking.py` and the 19 store tests of
    `test_transcript_speaker_list.py`.

The full list, with the order and the checks, is in
[handoff/phase-2-rest.md](handoff/phase-2-rest.md).

Things the port had to add to `pythonText.ts` for these modules:
`pyCasefold` (with `pythonCasefoldTable.ts`, written by the fixture script),
`isPyLower`, `PY_WORD`, `PY_WORD_NOT_DIGIT`, `pyLstrip`, `pyRstrip` and
`pySqueeze`.

## Phase 2: the engine loop

`src/engine/readerEngine.ts` holds `ReaderLoop`, the class behind the
`ReaderEngine` contract. It follows the loop in the desktop
`gui/components/reader_display.py`, method by method, without the drawing.
`src/engine/browserClock.ts` is the real clock and tab visibility, and
`src/testing/fakeClock.ts` is the clock a test moves by hand.

There are no golden fixtures here. The desktop loop lives in a window class
and cannot be run without the window, so the proof is 68 tests on a fake
clock, written from reading the desktop code. `npm run check` passes with
324 tests in the scratch copy (Node 22). Nothing was run in a real browser
yet: `browserClock.ts` has no test, and gets its first run with the first
screen.

Added for the browser, and not in the desktop loop:

- A late timer is made up for. The next word's time counts from when the
  last one should have ended. A timer that is later than the whole next
  word starts again from now, so missed words are not raced through.
- A hidden tab holds reading. When it is shown again the word gets its
  full time, and reading goes on. Resume rewind does not apply.

Broken on purpose, 29 ways, one at a time. 26 failed a test straight away.
Two showed holes that are now closed with new tests: a tab hidden for less
than a word's time, and a pause toggle after the last word. One can never
fail: leaving out the strip of a bookmark's snippet, because the words
around a live word never start or end with a space. The strip is kept, to
match the desktop line.

Differences from the desktop loop, both on purpose:

- `load()` reports the stats of the session it replaces. On the desktop
  the caller stops the old session first.
- An empty text counts no reading time. The desktop loop opens its time
  span on load even when there are no words, and closes it only on stop.
  Whether the desktop app can reach that state at all was not checked.

## Phase 2: the first screen

One page in `src/ui`: a box to paste text into, Start, and the reader with
Play and Pause, Back 10 and Forward 10, Restart, a speed slider (100 to 1000
words a minute, in steps of 10), time left, percent and the word count.
Nothing is saved yet, and there are no shortcuts, themes or settings.

- `useReaderEngine.ts` makes the loop once and reads it with
  `useSyncExternalStore`. React state never drives the words.
- `WordDisplay.tsx` keeps the focus letter still with a three-column grid
  whose outer columns are always equally wide.
- `Reader.tsx` is the reading area and its controls. `App.tsx` is the page.

Checked:

- 21 component tests on a fake clock, one of them under React strict mode.
  `npm run check` passes with 342 tests in the scratch copy (Node 22).
- By hand in the assistant's workspace, in real Chrome against the built
  site under `/rsvp-web-reader/`, at 1000 px and 360 px wide: 16 words,
  among them a one-letter word, a 34-letter word and an emoji. The middle of
  the focus letter was at the same pixel for every word, and at the middle
  of the reading area. Words changed after 200 ms, 300 ms after a comma and
  500 ms after a full stop, as the session says. Pause held the word. The
  page asked for nothing from another address.

Not checked: Firefox and Safari, a real phone, and the owner's own machine.
That one-off Chrome run is not a test in the repository. The browser tests
below are.

Known gaps, all belonging to later phases:

- A word wider than half the reading area is cut off at the edge. On a
  360 px screen that starts at about 20 letters. Fitting wide flashes is
  phase 4.
- The browser asks for `/favicon.ico` and gets a 404. An icon comes with
  phase 7.
- The focus letter colour is the desktop default, `#D98A3D` on `#F6EFE3`.
  Its contrast is low. Colours and themes are phase 4.

## Phase 2: the browser tests

Playwright 1.65.1 (`@playwright/test`, the newest on 2026-11-16), with
`playwright.config.ts` and `e2e/smoke.spec.ts`. `npm run e2e` builds the
site, serves it with `vite preview` under `/rsvp-web-reader/`, and runs five
tests in Chromium, Firefox and WebKit:

- The page loads under its base path.
- Paste, start, the words advance, pause holds, play goes on.
- Reading runs to the end, and Restart starts again.
- The focus letter stays on one spot for a 1-letter, a 15-letter and a
  3-letter word, and that spot is the middle of the row.
- The site asks for nothing from another address.

They run on the browser's real clock, so they also cover
`src/engine/browserClock.ts`.

What was run: all five pass in the assistant's workspace in the installed
Google Chrome, 25 runs in a row with no failure. Breaking the grid of the
word on purpose failed the focus letter test. **Firefox and WebKit were not
run**, because the workspace cannot download Playwright's browsers. Their
first run is the owner's `npm run e2e` or the CI job. Treat a failure there
as news, not as a flaky test.

CI has a second job, `e2e`, and the deploy now waits for both jobs. It
installs the browsers on every run, which takes a minute or two. Caching
them is possible later if it gets annoying.

Not used: Playwright's clock control. The tests are short enough in real
time, and real time is what they are there to check.

## The desktop layout, before saving (2026-11-16)

The owner tried the first screen, said it works, and asked for the look of
the desktop app next: the transcript list on the left, organised in Spaces,
and Settings top right. This is out of the brief's order on purpose. The
order agreed with the owner: the layout first, on a library kept in memory,
then phase 3 puts real saving under it.

What is there, in the light theme only:

- The sidebar: "List of Transcripts" with an add button, a search box, the
  transcripts of the current Space as cards, and the Space band at the
  bottom with Select Space and New Space.
- The right side: the open transcript's title, Settings, the text box with
  Start reading, or the word being read with Stop, Pause, Restart, time left
  and percent. The band at the bottom has the speed and the two skip
  buttons.
- Dialogs for a new transcript, a new Space, the list of Spaces (switch,
  rename, delete an empty one), deleting a transcript, and Settings, which
  only says that there are no settings yet.
- Each transcript keeps its own text, speed and place. Reading picks up at
  the word it was stopped on.
- The desktop app's colours (`LIGHT_PALETTE` in its `gui/theme.py`) and its
  two fonts, Fredoka and Quicksand, copied from its `assets/fonts` with
  their SIL OFL texts into `src/ui/fonts`.
- On a screen narrower than 720 px the sidebar sits on top.

`src/store/memoryLibrary.ts` is a stand-in. It implements the part of the
`LibraryStore` contract the page uses, in memory, so a reload empties the
list. Its rules were read from `transcript_store.py` and have 15 tests, but
no golden fixtures. Phase 3 replaces it: the rules move to `src/core` with
fixtures, as [handoff/phase-3.md](handoff/phase-3.md) says, and the page
should not need to change, because it is written against the contract.

Choices made here that the desktop code was not checked for. Each is a
question for phase 3:

- A new transcript asks only for a title. The desktop asks "Blank
  transcript" or "Add from file" first. Files are phase 5.
- Typing in the text box changes the transcript at once. The desktop keeps
  a draft until it is saved.
- A changed text is read from its first word again.
- A transcript that was read to the end starts again from the first word.

Left out for now, though the desktop screenshots show them: the sort
button, the bookmark, detached window and focus buttons, the two blue
buttons under the text box, the colour pickers, the word size and Group
controls, renaming or moving a transcript, and the dark theme.

Checked: `npm run check` passes with 371 tests in the scratch copy (Node
22). The browser tests, now six, pass in the workspace's Chrome three times
in a row, and one of them checks that the Quicksand font loads from the
site itself. Looked at by eye in Chrome at 1300 px and 380 px wide. Not run:
Firefox, WebKit, the owner's machine. The dialogs do not yet keep keyboard
focus inside them or give it back when they close. That is for phase 7.

## The handoff package

Written on 2026-11-15, so the work can go on without guessing:

- [handoff/README.md](handoff/README.md): where to start, the pattern to
  copy, and the points about working with the owner that came up in
  practice.
- One spec per phase that is not finished: the rest of phase 2, and phases
  3 to 7.
- The layer contracts as real types: `src/core/models.ts` (the saved
  shapes), `src/engine/contract.ts` (what the engine promises to the UI)
  and `src/store/contract.ts` (what the store promises to the UI). They
  were types only when written. The engine contract has its class now. `npm run check` type-checks
  them. The rules in their comments were read from the desktop code
  (`reader_display.py`, `transcript_store.py`, `storage.py`,
  `data_bundle.py`, `settings_store.py`), not run against it. The fixtures
  of phases 2 and 3 are what will prove them.

Added on 2026-11-16, before phase 3:

- `src/core/savedShapes.ts`: the desktop's file shapes (data.json and the
  bundle) as types, with its snake_case names.
- `src/store/schema.ts`: the IndexedDB database, its stores and keys, the
  record types and the two version numbers.
- In [handoff/phase-3.md](handoff/phase-3.md): "Stored data",
  "Versioning" and "Export and import rules", with three gaps in the
  desktop's `parse_data` that were checked by running it.

One thing in the contracts is a choice and not a port: the store layer
only saves and loads, and the rules for changing a library move into
`src/core` as pure functions, so they can have golden fixtures like the
rest. The desktop keeps both in `TranscriptStore`. The owner agreed to this
on 2026-11-15.

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
| Where the library rules live       | In `src/core` as pure functions with fixtures. `src/store` only saves and loads                                                               |
| Hidden tab                         | Reading holds, and goes on when the tab is shown. No resume rewind there                                                                      |
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
