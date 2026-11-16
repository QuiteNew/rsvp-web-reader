# Phase 2, the rest: desktop tests, the engine and the first screen

Done already: `speakers` and `reader` are ported and match their fixtures,
the engine loop (job 2) is built and tested, and the first screen (job 3)
is built with its component tests and its Playwright smoke test. Left: job
1, a first run of the browser tests in Firefox and WebKit, and the owner
trying the page and confirming the phase.

## 1. Port the desktop tests for speakers and reader

The fixtures prove the behaviour. The ported tests are the second check
that [PORTING.md](../PORTING.md) asks for, and they keep the reasons the
desktop project wrote down next to each odd case.

The speakers half is done (2026-11-16) and lives in
`src/core/speakers.desktop.test.ts`. Do the reader half the same way, in
`src/core/reader.desktop.test.ts`, with one `describe` per desktop file.

| Desktop file                            | Tests | State                          |
| --------------------------------------- | ----- | ------------------------------ |
| `test_speakers.py`                      | 39    | done                           |
| `test_speaker_rows.py`                  | 23    | done                           |
| `test_transcript_speaker_list.py`       | 30    | cleaner done, store in phase 3 |
| `test_whole_transcript_speakers.py`     | 10    | done                           |
| `test_reader.py`                        | 83    | to do                          |
| `test_chunking.py`                      | 58    | to do                          |
| `test_reader_speaker_cues.py`           | 44    | to do                          |
| `test_context_ribbon.py`                | 7     | to do                          |
| `test_seeking.py`, `test_edge_cases.py` | some  | to do, see below               |

Rules:

- Keep the Python test names as they are, without `test_`, so a test can be
  found in the desktop repo by its name. Keep the comment that explains
  the case.
- A test that drives a window is not ported here. In `test_seeking.py` and
  `test_edge_cases.py` take only the tests that call `ReaderSession` or a
  `core` function directly. Tests that drive `ReaderDisplay` describe the
  loop and belong to the engine tests in job 2.
- A Python dict is compared as a plain object, and a random test uses a
  small seeded generator, because Python's `random` cannot be repeated.
- `test_transcript_speaker_list.py`: the store setter, loading `data.json`
  and export and import are left for phase 3, see its spec.
- If a ported test fails, the port is wrong or the test was misread. Do
  not change the port to pass without checking the Python.

## 2. The engine (done on 2026-11-15)

Built as `ReaderLoop` in `src/engine/readerEngine.ts`, with 68 tests and 29
deliberate breaks. See "Phase 2: the engine loop" in
[STATUS.md](../STATUS.md). What follows is the spec it was built from, kept
for the reasons behind it. Two things in it are still open: the desktop
tests that drive the loop are not ported one by one, and `browserClock.ts`
has not run in a browser.

One class, `ReaderEngine` in `src/engine/readerEngine.ts`, that implements
the interface in `src/engine/contract.ts`. Its behaviour is the loop in the
desktop `gui/components/reader_display.py`: `load_session`, `stop`,
`finalize_session`, `toggle_pause`, `restart`, `skip`, `scrub_move`,
`scrub_end`, `jump_to`, `current_bookmark_target`, `_schedule_next`,
`_advance`, `_report_progress` and the active span helpers. Read those
methods first. Leave out everything there that draws.

Also add `src/engine/browserClock.ts`, the real `Clock` and
`PageVisibility` built on `performance.now()`, `setTimeout` and
`document.visibilityState`. Keep it tiny, because it is the one part a unit
test cannot reach.

What the browser adds, which the desktop loop does not have:

- **Drift.** Keep the time the current word is due to end. When the timer
  fires, advance, then set the next due time to the old due time plus the
  new delay, not to now plus the delay. That way a late timer does not push
  everything after it later. If the engine is more than one whole delay
  behind (the machine slept, a long task), do not flash through the missed
  words: start again from now.
- **Hidden tab.** When the tab is hidden while playing, clear the timer,
  close the active time span and set `isHeldForHiddenTab`. When it is shown
  again, give the current word its full delay again and go on. Resume
  rewind does not apply here, because the reader did not press pause. The
  owner agreed to this.
- **Snapshots.** Build a new `ReaderSnapshot` only when something changed,
  and return the same object from `getSnapshot()` until then.

Tests, in the `logic` project, with a fake clock that the test moves by
hand:

- Every public method, in every status.
- The rules in the comments of `contract.ts`: restart always ends playing,
  a skip keeps the play state unless forced, `scrubEnd` without a
  `scrubMove` does nothing, `onNewSpeaker` fires only when reading moves on
  its own, stats are never reported twice.
- Words read counts the move of the index, so a chunk of three counts as
  three.
- A late timer, a very late timer, and a hidden tab.
- The desktop tests that drive the loop: `test_skip_and_resume.py`,
  `test_start_reading.py`, and the window halves of `test_seeking.py`.

Then break it on purpose: schedule from now instead of the due time, count
chunks instead of words, let a skip fire `onNewSpeaker`, keep counting
active time while hidden. Each must fail a test.

## 3. The first screen (built on 2026-11-15 and 16)

See "Phase 2: the first screen" and "Phase 2: the browser tests" in
[STATUS.md](../STATUS.md) for what was built and checked. Still open: the
browser tests have only run in Chrome. What follows is the spec the screen
was built from.

One page in `src/ui`: a text box to paste into, a Start button, and the
reader with Play and Pause, skip back, skip forward, Restart, a speed
control, time left and percent. No saving, no settings window, no
shortcuts yet. Those are phases 3 and 4.

- A hook, `useReaderEngine`, that makes one engine for the life of the
  page and reads it with `useSyncExternalStore`. The word must never be
  driven by `setState` inside a timer in a component.
- The ORP letter stays on one spot. A grid with three columns does it: the
  text before the letter right-aligned in the first, the letter in the
  middle, the rest left-aligned in the third, with the outer columns the
  same width. Check with a long word and a one-letter word that the letter
  does not move.
- Speed: the desktop range is 100 to 1000 words a minute, default 300, and
  the keys step by 10 (`core/wpm_step.py`).
- Skip: 10 words by default (`skip_word_count`).
- The flashing word is not a live region. Do not put `aria-live` on it.
  The plain text view comes in phase 7.
- Colours for now: the desktop light defaults, `#3B2E27` on `#F6EFE3` with
  `#D98A3D` for the focus letter. Themes are phase 4.

Tests:

- Component tests with Testing Library and a fake clock: paste, start, the
  first word shows, time moves and the next shows, pause holds it.
- Playwright, starting here. Look up the current version, and check
  whether its clock control (`page.clock`) works in all three browsers
  before leaning on it. Run against `npm run build` and `npm run preview`,
  under the `/rsvp-web-reader/` base path, in Chromium, Firefox and WebKit.
  One smoke test: paste, start, the word changes, pause, the word holds.
  Add a CI job for it that installs the browsers.

## Done when

- `npm run check` passes, and the Playwright smoke test passes locally and
  in CI.
- The owner has pasted a real transcript at the public address, read it,
  and confirmed the phase.
- [STATUS.md](../STATUS.md) says what was run where, and lists the breaks.
