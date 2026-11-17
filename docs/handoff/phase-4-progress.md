# Phase 4: where it stands

The plan is [phase-4.md](phase-4.md). This file says what is done, what
is next and what was found on the way. Read it before picking the phase
up again.

The owner confirmed phase 3 on 2026-11-16 and asked for phase 4 to start.
The front end can be polished later, so each step here aims at the
behaviour being right and tested, not at the final look.

## The steps

The pure parts come first, each proven against the desktop, then the UI
that uses them. One commit per step.

| #   | What                                                                  | State |
| --- | --------------------------------------------------------------------- | ----- |
| 1   | `colors`: `blend_colors`, with fixtures and the desktop tests         | Done  |
| 2   | `settings_search` (36 lines), the same way                            | Done  |
| 3   | Themes: the palette, Light, Dark and System, colours follow the theme | Done  |
| 4   | Guide marks and the focus letter offset                               | Done  |
| 5   | The surrounding-words line (a new snapshot field in the engine)       | Done  |
| 6   | The scrubber, with bookmark ticks                                     | Done  |
| 7   | Bookmarks: toggle, list, rename, delete, jump                         | Done  |
| 8   | Chunking: per transcript, and the defaults for new ones               | Done  |
| 9   | Keyboard shortcuts                                                    | Done  |
| 10  | Fitting wide flashes: try CSS first, show the owner                   | Done  |
| 11  | The settings view for all of it, with search and reset                | Done  |
| 12  | The Normalize button (left over from phase 3)                         | Done  |

Steps 3 to 7 need nothing but the desktop code. Steps 8, 9 and 10 need
the design notes below.

## Asked of the owner

The three design notes for this phase (chunking, the keyboard shortcuts,
reader fit and scroll) were asked for on 2026-11-16 and copied into
`reference/desktop-design/` on 2026-11-17. They are tracked in the repo.

## Step 1, colours, done on 2026-11-16

- `src/core/colors.ts`: `blendColors` and `channels`. Fixture
  `colors.json`, 1195 cases. The desktop's `tests/test_colors.py` (13
  tests) is run by the fixture script and replayed in `colors.test.ts`.
- `tools/fixtures/generate.py` has `record_desktop_tests()` now, for any
  test file of a pure module: it runs the file with pytest and returns
  what each test asked. Use it for the next pure ports.
- Python sends a half to the even number, so the port rounds with
  `pyRound`. `max(0.0, min(1.0, ratio))` gives 1.0 for a ratio that is not
  a number, and the port does too.
- One narrowing, on purpose: Python's `int("+f", 16)` and `int(" f", 16)`
  both read as 15, so the desktop takes "#+f+f+f" as a colour. The port
  takes hex digits only. No colour picker writes anything else.

Found on the way, and fixed in this commit:

- `desktop_tests.json` from the last commit of phase 3 was not the same
  on every run. Bookmarks made by the desktop tests carried the time of
  the run. The clock now stands still while those tests are recorded, so
  the file is stable. 11 `save_state` cases that differed only by their
  time stamp merged (130 became 119). Nothing else changed.

## Step 2, settings search, done on 2026-11-16

- `src/core/settingsSearch.ts`: `queryWords` and `matches`. Fixture
  `settings_search.json`, 2027 cases (57 queries, 1970 matches). The
  desktop's `tests/test_settings_search.py` (13 tests) is replayed in
  `settingsSearch.test.ts`.
- Python's `casefold()` and `split()` are used through `pyCasefold` and
  `pySplit`, so "ß" finds "ss" and a no-break space splits words like
  Python. `toLowerCase()` fails the fixture, checked by changing the port.
- `record_desktop_tests()` now also records the optional arguments a test
  names (`keywords="guide marks"`), as a fourth item of the call. Calls
  without any are written as before, so `colors.json` and the other
  fixtures came out byte for byte the same.
- Not done here: the search box itself. That is step 11, which will call
  `matches` with each setting's name, keywords and description.

## Step 3, themes. Part 3a (the colours and rules), done on 2026-11-16

- `src/core/theme.ts`: `LIGHT_PALETTE`, `DARK_PALETTE`, the dark reading
  colours, the two guide mark colours, `isDarkTheme(mode, systemPrefersDark)`,
  `paletteFor`, `themeReadingColors(isDark, lightDefaults)` and
  `themeGuideMarkColor(isDark)`. Fixture `theme.json` (7 cases) holds the
  palettes and constants as `gui/theme.py` assigns them. The fixture script
  reads only those assignments with `ast`, because `gui/theme.py` imports
  tkinter and cannot be imported on this machine.
- `src/core/theme.test.ts` plays the 8 tests of
  `test_reading_colours_follow_theme.py` under their Python names, against
  `addTranscript`, `setFontColor` and `resyncDefaultReadingColors`. They are
  written again by hand, not replayed from a recording, because the desktop
  tests build `RSVPApp`, which needs tkinter. The guide mark rule is
  checked with `resyncGuideMarkColorDefault`.
- The desktop reads its theme once at launch ("takes effect on next
  launch"). `resyncDefaultReadingColors` and `resyncGuideMarkColorDefault`
  already exist from phase 3.

### Part 3b, the page, done on 2026-11-16

- `src/ui/global.css`: the light colours stay in `:root`, the dark ones
  are in `:root[data-theme='dark']`. `src/ui/themeStyles.test.tsx` checks
  the seven variables that are palette colours against `src/core/theme.ts`
  (changing one made it fail). The other variables (blue, pill, card,
  card-current, text-box, on-blue) are not in the desktop palette. The
  dark values for them are my own, made from it. Polish them with the
  rest of the front end.
- `src/ui/useTheme.ts`: puts `data-theme` on `<html>`, follows the
  browser for System, also while the page is open.
- `index.html` has a small script that sets `data-theme` from the saved
  setting before the page is drawn, so a dark page does not flash light.
  It repeats the three-line rule of `isDarkTheme`, because it cannot
  import it. There is no Content-Security-Policy yet. When one is added in
  phase 7, this inline script needs a hash or has to move.
- Settings has an Appearance choice (Light, Dark, System).
- Decision taken, owner can reverse it: the colours that follow the theme
  are resynced live, when the theme or the Defaults change, not only at
  start as the desktop does. The reading colours of a transcript, and the
  guide marks, follow at once.
- The reading stage now uses the transcript's own font, highlight and
  background colours (set as `--reading-*` on the stage). Before this the
  stored colours were not shown at all. The font size is still not used
  by the page. That belongs to step 4 or the reading view work.
- Existing App tests that compare the whole library had to start from
  transcripts already holding the Light colours, because the resync at
  start rightly gives the Defaults to a transcript that follows them (the
  model's own default font colour is white).
- Tests: 7 App tests, 2 style tests, 4 browser tests (`e2e/theme.spec.ts`).
  The browser tests ran in Chrome only, three full runs of all 15, with
  the system Chrome. Firefox and WebKit not run here.

## Step 4, guide marks and the focus letter offset, done on 2026-11-16

Committed together with step 3b.

- `src/core/guideMarks.ts`: the constants and the two length rules of
  `reader_display.py` (`guideMarkLength`, `guideMarkHorizontalLength`).
  That file draws with tkinter and cannot be run here, so there is **no
  fixture**. The numbers in `guideMarks.test.ts` were worked out by hand
  from the code. Python's half-to-even `round()` is used.
- `src/ui/WordDisplay.tsx` and `.module.css` draw the marks: two vertical
  bars above and below the focus letter, 6 px clear of its edge, and
  optionally two 2 px ticks across their outer ends (row width less 34 px
  each side, at least 20 px). Shown only while the status is `playing`.
  The focus letter alone moves up (positive) or down by the offset, and
  the marks follow it, as in the desktop.
- Settings has a "Guide marks" group: horizontal lines, thickness (2 to
  6), length (15 to 60 percent), focus letter height (-3 to 3) and the
  colour. A picked colour stops following the theme (`setGuideMarkColor`).
  This group is a stop-gap. Step 11 builds the real settings view.
- The word is now shown at the transcript's own font size in px (it was a
  fixed clamp). The line height is 1.2, so that the half height of the
  focus letter is 0.6 em. The desktop uses the real height of its label,
  so the gap may differ by a pixel or two. Judge it by eye and say.
- Not done, on purpose: the desktop hides the marks while the flash is
  panned off centre. Panning is the "fit wide flashes" work of step 10.
- A very large font on a narrow screen can overflow the row (cut off at
  the sides). Step 10.
- Browser tests (`e2e/marks.spec.ts`): the marks sit above and below the
  letter and are centred on it, go when paused, and the long ticks cross
  the mark ends. All 18 e2e tests passed three times in Chrome. Firefox
  and WebKit were not run here.

## Step 5, the surrounding-words line, done on 2026-11-16

- Engine: `ReaderSnapshot.context` (a `PeripheralContext` or null) and
  `ReaderEngine.setPeripheralContext(enabled, before = 1, after = 2)`.
  The words are built only when the line is on, from the session's
  `chunkPeripheralContext`, which was ported in phase 2. The setting is kept
  across sessions and can be set before one is loaded. 6 engine tests.
- With chunking on, the line is about the whole chunk: words before its
  first word, and after its last. The middle word is the chunk's first
  word. That is how the desktop does it (`current` of
  `chunk_peripheral_context`), so it is kept.
- The page draws it under the lowest point a guide mark can reach, even
  when the marks are hidden (paused), 8 px below that. Half the font size
  (at least 8 px), the font colour dimmed 55 percent toward the
  background with `blendColors`. 10 px between the middle word and each
  side. The numbers are in `src/core/guideMarks.ts`. Same as the guide
  marks: copied from `reader_display.py` by hand, no fixture.
- Settings: "Show the surrounding words" (the setting
  `peripheral_context_enabled` already existed). The counts 1 and 2 are
  not settable, as on the desktop's Settings window (it passes only the
  switch).
- Hidden on a screen reader (`aria-hidden`): it repeats words that are
  already in the text.
- Tests: 5 App tests, 1 new browser test (below the word, middle word
  under the focus letter, the others on either side). All 19 e2e tests
  passed three times in Chrome only.

## Step 6, the scrubber with bookmark ticks, done on 2026-11-17

- `src/core/scrub.ts`: the read-out ("word 1,234 of 5,678"), the slider's
  range, which tick indices to draw and where (fraction along). From
  `gui/components/scrub_bar.py`, which is tkinter, so no fixture: the
  expected values in `scrub.test.ts` were worked out by hand.
- `src/ui/Scrubber.tsx`: a range input with the read-out above and a row of
  ticks below (a separate row, as on the desktop, so a tick never blocks a
  drag). Off with under two words. It uses the engine's existing
  `scrubMove` on every change and `scrubEnd` when the drag is over (pointer
  up, key up, or focus lost). The state it ends in (paused or reading on)
  is saved once, the way a pause by hand is.
- Settings: "Stay paused after moving the position slider"
  (`scrub_pause_enabled`, already in the settings), sent to the engine with
  `setBehaviour`. The page did not use `setBehaviour` before.
- Keyboard: arrows move it a word, Home and End go to the first and the
  last word (the browser's own range keys). The bookmark keys come with
  step 7 and the shortcuts with step 9.
- Ticks are tested at unit level only (`--fraction` of each tick). A browser
  check of where they sit relative to the thumb needs a way to add a
  bookmark on the page, so it goes with step 7.
- Tests: 7 App tests, 3 browser tests (keys only). All 22 e2e tests
  passed three times in Chrome. The owner ran all three browsers: two
  Firefox failures, both in the tests and not in the page:
  the surrounding-words test compared positions that differed by 0.00006 px
  (now a half pixel tolerance), and the arrow keys test pressed Home while
  reading was still on the first word, where Home does nothing, so a slow
  Firefox was one word on before the arrows came (w4, not w3). That test
  now pauses first, and a separate test presses Home while reading is
  going, after it has left the first word. I could not run Firefox here, so
  the second fix is reasoned from the numbers and checked in Chrome only.
  Run `npm run e2e` again.

## Step 7, bookmarks, done on 2026-11-17

- A Bookmarks button in the reading toolbar opens `BookmarksDialog`: a
  button that adds a bookmark at the current word or removes the one
  there (off when there is no word, as at the end), and the list. A row
  goes to its word, lands paused (saved like a pause by hand) and closes
  the dialog. Each row has a pencil to name it and a ✕ to delete it.
- Different from the desktop on purpose: it renames with a double click
  on the row. Here it is a pencil button, so the keyboard can reach it.
  Enter saves the name (trimmed, and an empty name clears the label so the
  snippet shows again), Escape gives up the name without closing the
  dialog.
- `src/core/bookmarkList.ts`: the row's name (label, else snippet, cut to
  44 characters with "…", counted as Python counts) and its "word X of Y".
  From `bookmarks_popover.py`, which is tkinter: no fixture, expected
  values worked out by hand.
- The rules themselves (`addBookmark`, `removeBookmark`,
  `setBookmarkLabel`, one per word, sorted) are from phase 3 and are
  proven by the store fixtures. The snippet is the engine's
  `bookmarkTarget()`.
- Focus starts on the add button when the dialog opens. Focus does not go
  back to the Bookmarks button when the dialog closes, and Tab can leave
  the dialog. That is the dialog focus work already listed for phase 7.
- The `B` shortcut for "bookmark here" is step 9.
- Tests: 6 hand-checked core tests, 7 App tests, 3 browser tests: the
  whole add, leave, come back flow with the keyboard only; a bookmark
  kept over a reload; and a click on the slider above a tick lands on the
  tick's word (this fails when the tick ignores the thumb's width,
  checked by changing the CSS). 25 e2e tests, Chrome only here: 4 of 5
  full runs passed. In one run `saving.spec.ts` "an export file brings
  everything back" timed out at 30 s. It did not happen again in 30
  repeats of that file, and this step does not touch what it tests, but
  the cause is not known. Watch for it.

## Step 8, chunking, done on 2026-11-17

The design notes are now in `reference/desktop-design/` (chunking v1 and v2,
keyboard shortcuts, reader fit and scroll). This step follows the two
chunking notes.

- The core was already there from phase 2 (`ReaderSession` grouping, fixed
  and adaptive, proven by fixtures) and phase 3 (`setChunking` in the
  library rules, the defaults in settings). This step is the page only.
- The session is now built with the transcript's own chunking
  (`sessionFor` in `App.tsx`). Before, the page always read one word.
- The band under the reader has the quick control of the v1 note: a
  "Group" switch and a 2 to 5 stepper for the open transcript. The size
  is saved while Group is off, as in the desktop's footer.
- Settings has "Configure chunking...", which opens `ChunkingDialog`, the
  v2 note's window: Apply to "This transcript" or "New transcripts", on or
  off, Fixed or Adaptive, words per group (2 to 5), group width (15 to
  60). Nothing changes until Apply. The texts are the desktop's.
- A change to the open transcript is saved and the live reader is grouped
  again at once (`engine.setChunking`), keeping the word and snapping to
  the start of its group.
- Not built: the detached window (the web has none).
- Tests: 8 App tests, 3 browser tests (the focus letter of a group's first
  word is on the same spot as for a single word; reading stops on group
  starts; kept over a reload). 28 e2e tests passed three times in Chrome
  only.
- A long group can be wider than the reading row and is cut off at the
  sides. That is step 10 (fitting wide flashes).

## Step 9, keyboard shortcuts, done on 2026-11-17

Follows `reference/desktop-design/keyboard-shortcuts.md`.

- Keys, as on the desktop: Space play or pause, Left and Right skip by the
  skip count from Settings, R restart, Esc stop (back to the text), B add
  or remove a bookmark at the current word.
- Not bound: F (focus mode), because the web has no focus mode yet. C
  (centre a panned flash) came with the scrollbar in step 10.
- `src/core/shortcuts.ts`: `shortcutFor(press, focus)` is the whole rule,
  pure and unit tested. It is the web's version of the desktop's guard
  (which only kept typing safe):
  - with Ctrl, Cmd or Alt the key is the browser's (Ctrl+R reloads);
  - nothing fires while typing;
  - Space is left to a focused button, checkbox, radio button or dropdown,
    so one press never does two things. This is the "known non-blocking
    item" of the desktop note, settled here;
  - the arrows are left to a focused slider, radio button or dropdown;
  - a held key repeats for the arrows only.
- `src/ui/useShortcuts.ts` listens on the document while the reader is on
  screen and no dialog is open. With a dialog open, Escape closes the
  dialog and reading goes on.
- The buttons show their key in the tooltip ("Pause (Space)"). There is no
  list of shortcuts on the page yet. That fits the settings view of
  step 11.
- A bug caught by the unit tests while writing: the key table was a plain
  object, so a key named "constructor" found an inherited value. It is a
  Map now.
- Tests: 9 core tests, 11 App tests, 4 browser tests with real key
  presses, Chrome only.
- Found while running them: "chunking is kept over a reload" (step 8)
  failed once in four runs. The Group switch was off after the reload. A
  change is saved at once, but the write to IndexedDB finishes a moment
  later, and a reload inside that moment loses it. The two reload tests of
  steps 7 and 8 now wait until the database holds the change. The gap
  itself is still there for a person who reloads in the same instant as a
  change: it is small, it is not new in phase 4, and it cannot be closed
  fully with IndexedDB. Open item for the owner, see below.

### Open item: a change made in the instant before a reload

Every change is written at once, and the page also saves when it is
hidden or left. But IndexedDB writes are not finished when the call
returns, and saves are done one after another, so a second change can wait
behind the first. A reload or a closed tab inside that moment (some
milliseconds) can lose the last change. Possible hardening for phase 7:
do not queue behind an older write when the page is being left, and show
"saving" until the write is done. Not done now.

## Step 10, fitting wide flashes: auto-fit done on 2026-11-17, panning open

Follows `reference/desktop-design/reader-fit-and-scroll-design.md`.

The plan said "try CSS first". Plain CSS cannot do this: it has no way to
shrink text until it fits, and the fit has to be one size for the whole
transcript, from its widest chunk. So the desktop's auto-fit was ported, and
only the measuring is left to the browser.

- `src/core/fit.ts`: `fitCandidates` (the 12 longest chunks by characters
  on their wider side), `requiredWidth` (twice the longer side around the
  focus letter) and `fitRenderSize` (the largest size that fits, never
  under 60 percent of the chosen size, 8 px clear on each side). From
  `reader_display.py`, which is tkinter: no fixture, values by hand.
- `ReaderEngine.chunkTexts()` hands out the session's chunk texts
  (`ReaderSession.chunkTexts` is from phase 2).
- `WordDisplay` measures the candidates with an unseen span in the word's
  own font, follows the row's width with a ResizeObserver, and measures
  again when the web fonts have loaded. The guide marks and the
  surrounding words are sized from the fitted size, as on the desktop.
- Render only: the saved Word size is never changed.
- New on the page: a Word size stepper under the reader (16 to 96, by the
  step from Settings), as in the desktop's footer. It was missing, and the
  fit cannot be judged without it.
- Letter spacing is not on the page yet, so it is not in the measure.
- Tests: 12 core tests by hand, 2 engine tests, 8 App tests (widths
  handed to jsdom), 3 browser tests with real text widths (a wide group
  is drawn smaller and nothing is cut off; a narrower window is fitted
  again). 35 e2e tests passed three times in Chrome only.

### For the owner to decide: what is left over past the floor

When the widest chunk does not fit even at 60 percent, the sides are cut
off, as before. The desktop adds a horizontal scrollbar, a centre button
and the C key for that case (`core/scroll.py`, pure, with tests). Its own
note calls it an edge-case fallback and says a flash wider than the window
cannot be read in one glance by panning anyway. Choices:

1. Leave it cut off. Nothing more to build.
2. Port the scrollbar, the centre button and C as on the desktop.
3. Lower the floor on the web, or let a group that is still too wide wrap.
   Both differ from the desktop.

Until decided, `scroll.py` is not ported and C is not bound.

## The browser tests under load, 2026-11-17

The owner ran `npm run e2e` twice after step 10, on all three browsers.
94 and 103 of 105 passed. Every failure, 13 in all, was "Test timeout of
30000ms exceeded", none was a wrong value, and the page snapshots show each
test still going the right way when the time ran out. The first run was on
a laptop under heavy load, the second at about 40 percent.

Why it is load and not the page: the same tests pass in Chromium in 2 to
8 s, and the Firefox ones that passed took 9 to 28 s, right under the 30 s
limit. Playwright ran 10 workers (half the laptop's threads), three
browsers at a time.

Changed in `playwright.config.ts`: at most 4 workers on a local machine
(CI keeps the default) and 60 s a test. Not verified on Firefox or WebKit
here, because the workspace cannot download those browsers. The owner's
next run is the check. If a test still runs out of time with 4 workers on
a quiet machine, that is worth a real look.

## Step 11a, the reading settings reach the reader, done on 2026-11-17

Step 11 is split. The settings view (11b) would have shown four switches
that did nothing, because the page never used them. This part connects
them, the way the desktop's `canvas.py` and `reader_display.py` do:

- Length pacing and the warm-up: a session is made with them
  (`sessionFor` now takes the settings), and a change reaches the session
  being read at once (`engine.setLengthPacingEnabled`,
  `engine.setWarmUpEnabled`).
- Rewind on resume: sent to the engine as `resumeRewindWords`, 0 when the
  switch is off.
- Pause when skipping: the skip buttons and the arrow keys call
  `engine.skip(delta, pauseOnSkip)`, and the pause is saved, as the
  desktop's `Canvas._skip` does.
- Tests: 6 App tests. Taking the setting out of `sessionFor`, or the
  `pauseOnSkip` out of the skip, each made a test fail.
- Not yet testable on the page: changing one of these while reading. The
  switches come with 11b, and its tests cover that.

## Step 11b, the Settings window, done on 2026-11-17

Ported from the desktop's `gui/components/settings_window.py`, with the
owner's go-ahead to keep its Apply model.

- `src/core/settingsView.ts` holds the Defaults tab as data (each entry's
  name, keywords, description, in the desktop's order), the search layout
  (`defaultsLayout`, a port of `_layout_defaults`), the form
  (`formFromSettings`, `resetDefaultsForm`) and the checks Apply makes
  (`checkSettingsForm`, a port of `_handle_apply`: the three typed numbers
  in the desktop's order, then the letter shift, with the desktop's
  messages).
- New fixture `settings_view.json` (29 cases). The fixture script reads
  `_build_defaults_tab` with `ast` (the file imports tkinter): it runs the
  string assignments, so the descriptions come out as drawn, and records
  every `_defaults_item` call with the texts shown in it. The test checks
  the web's entries against it.
- Where the web words it differently, on purpose, it is listed in
  `WEB_WORDING` (the desktop's detached window and "launch the app"), and
  the test checks the desktop still has those words. Left out:
  "Configure speaker cues" (phase 6), listed in `NOT_YET`.
- `src/ui/SettingsDialog.tsx`: tabs Defaults, Appearance and Data. The
  desktop's Layout (window sizes), Profiles (phase 6) and Stats tabs are
  not here. Storage is Data (export and import).
- Nothing is saved until Apply. A wrong number stops Apply: the message is
  shown, the window stays open, the search is cleared and the box gets the
  cursor with its text selected. The skip amount and pause when skipping
  are saved at once, as the desktop's note says. Closing drops the rest.
- Reset to Original Defaults puts the Defaults tab back. As on the
  desktop, it saves the two skip settings at once and the rest on Apply.
  It also sets the guide mark colour to the original one, which in the dark
  theme then counts as picked by hand. That is the desktop's behaviour,
  kept, and pointed out to the owner.
- The Chunking window opens over Settings, which stays open. `Dialog` now
  keeps a stack, so Escape closes only the window on top.
- The theme is on the Appearance tab and now waits for Apply too.
- Different from the desktop, on purpose: there is one Close (the title
  bar ✕), not a second Close button by Apply. A colour from the browser's
  picker is lowercase, as Tk's picker gives it.
- A small difference that cannot be avoided: Python's `isdigit()` lets
  "²" through and `int()` then fails, so the desktop applies nothing and
  shows nothing. The web shows "must be a whole number".
- Tests: 28 core tests, 11 new App tests (24 older ones moved to the new
  window), 2 new browser tests. Taking out the search clearing, or the
  instant save of the skip amount, each failed a test. 37 e2e tests passed
  three times in Chrome only.

## Step 12, the Normalize button, done on 2026-11-17

The last step of the plan. The rules (`toggleNormalization`, `canRevert`)
were ported in phase 3 with fixtures. This is the button, from the
desktop's `gui/components/transcript_input.py` and the saving side of
`gui/app.py` (`_handle_normalization_changed`, `_handle_draft_changed`).

- A button left of Start reading. It shows a page with a tick (Normalize)
  or a plain page (Revert), as the desktop's two icons do. Its name says
  which: "Normalize the text" or "Revert to the original text".
- A click saves the way back first, then the new text. Revert lasts only
  while the text is what normalizing made, spaces at the ends aside. An
  edit ends it, and so does Start reading. Text that needs no tidying is
  left alone, nothing is kept, and "Nothing to change" shows for two
  seconds beside Start reading.
- "Split long paragraphs when normalizing" from Settings is used.
- The web keeps one text per transcript where the desktop keeps a text and
  a draft, so the desktop's draft checks became checks of the text.
- Not here: the bold word starts button next to it (phase 6), and the
  detached window.
- Tests: the 9 tests of `test_normalize_in_app.py` that do not need the
  detached window, written again under the same names (they click the
  real tkinter app, so they cannot be replayed), and one for the split
  setting. One browser test: normalize, reload, revert. Leaving out the
  clear on Start reading, or comparing the text without the spaces at its
  ends taken off, each failed a test. 38 e2e tests passed three times in
  Chrome only.

## Phase 4: what is left before the owner confirms it

All twelve steps are done, except the choice in step 10 about a flash
still too wide at 60 percent. The phase is done when the owner has read a
long transcript with chunking on, used the scrubber and bookmarks by
keyboard only, and confirmed it.

## The layout of the desktop, 2026-11-17

The owner tried phase 4 ("looks and works great") and asked for the page
to be laid out exactly like the desktop's main window, from screenshots of
it. Menus and functions that are not built yet come later.

- The line between the sidebar and the rest is now the same 3 px line as
  under the two headers (it was a wide brown gap).
- The footer and the Space band are the same height, 5.75rem, so they line
  up, and both are shorter than before.
- The footer is the desktop's `footer.py`: three equal columns. Left: the
  open transcript's Font and Background colours. Middle: the speed, << and
  > > beside the slider, and Group as a switch with its - and + below.
  > > Right: the word size with - and +, and the Highlight colour. The colour
  > > squares are new on the page and set the transcript's own colours, which
  > > then stop following the theme, as on the desktop. The footer is there
  > > with no transcript open too, empty.
- The toolbar is the desktop's `canvas.py` row: Stop at the left, the
  position slider beside it while reading, and at the right the time left,
  the percent, Pause, Restart and Bookmarks. It stays over the text box,
  where its buttons do nothing (`aria-disabled`), as on the desktop. The
  time read-out no longer says "left". Detach and focus mode are not
  built.
- Settings: the list now runs out to the window's edge, so its scrollbar
  is beside the settings and not over them. Its sliders and colour squares
  look like the ones on the page.
- On a narrow screen the position slider gets its own row and the footer
  stacks.
- A question from the owner: the Word size in Settings does not change
  the number in the footer. That is on purpose and the desktop's: the
  Defaults note says speed, the three colours and the word size are what
  new transcripts start with. The footer shows the open transcript's own
  size.
- Tests: 3 App tests (the toolbar over the text box, the footer colours,
  the footer with nothing open). The keyboard bookmark test now tabs past
  Play and Restart to reach Bookmarks. 38 e2e tests passed in Chrome.
  Looked at by eye in Chrome at 1000 and 390 px wide, light and dark.

## Step 10, the rest: the scrollbar for a flash too wide to fit, 2026-11-17

The owner chose the desktop's answer: a horizontal scrollbar along the
bottom of the reader, there only when the widest flash of the transcript
(with its grouping) still spills out at the 60 percent floor.

- `src/core/scroll.ts` is `core/scroll.py` (committed on its own, with
  fixture `scroll.json` and the desktop's `test_scroll.py` replayed).
- `WordDisplay` now measures how far the widest chunk reaches on each side
  of the focus letter, not only its width, and works out the overflow on
  each side at the fitted size, as `_pan_overflows()` does. The flash and
  the surrounding words slide by the pan (`--pan`). The reading area cuts
  off what is outside it. The part before the focus letter spills to the
  left, so it can be slid into view too.
- `HorizontalScrollbar.tsx`: a track and a rounded grey thumb, in the Tk
  terms first and last, so the desktop's arithmetic is used as it is. Drag
  the thumb, click the track (a whole row), the wheel or arrow keys (24 px,
  `SCROLL_UNIT_PX`), Page Up and Page Down, Home and End.
- The centre button (20 px, ember, a crosshair) sits 6 px above the
  scrollbar at the left, and C does the same, as on the desktop. While the
  flash is slid, the guide marks are hidden.
- The pan is kept by the page, not saved. A new reading session starts
  centred, and when nothing spills any more the pan goes back to 0.
- Tests: 4 App tests (no scrollbar when it fits, keys slide it and stop at
  the end, marks hidden and C and the button centre it, a new session
  starts centred). 3 browser tests at the largest word size with two
  13-letter words to a group: the end of the flash comes into view with
  End, C and the button centre it, a drag of the thumb slides it, and the
  scrollbar goes when Group is off. Hiding the marks and the C key were
  each taken out once, and a test failed.
- Not ported: the desktop's note about the words "tearing" during a drag.
  That was a Tk drawing problem.
- The owner's first run on all three browsers had two failures, both
  read from the page snapshots Playwright saved:
  - WebKit: the test pressed Tab before C. Tab went to the Font colour
    square, which Playwright's WebKit on Windows draws as a text box, so
    "c" was typed into it. A test mistake: C is now pressed while the
    scrollbar has the keyboard. Not load.
  - Firefox: the thumb drag did not move the flash at all (the scrollbar
    had taken the focus). The drag followed the pointer on the thumb with
    pointer capture. It now follows it on the whole window and stops the
    browser's own text selection on the press, which does not depend on
    pointer capture. Firefox could not be run here, so this fix is not
    proven on Firefox yet. The owner's next run is the check.
- The owner's second run: WebKit passed, Firefox still failed the drag,
  with the flash not moved at all. A one-off probe (not kept) logged the
  events in Firefox on the owner's machine. A drag that stays inside the
  window works. The test's drag ends 30 px past the 900 px window, and
  there Firefox, under Playwright, sends one move on the document with no
  button held and x 0, and no pointerup. The page took that x 0 as a real
  position and slid the flash back to the start.
- Fix: a move with no button held ends the drag without moving, since the
  button must have come up somewhere we did not see (letting go outside
  the window is the real case). Two unit tests in
  `HorizontalScrollbar.test.tsx` drag the thumb in jsdom, and the second
  one fails with the check taken out. The e2e test is unchanged: in
  Firefox it now goes through this check. Passed in Chrome here; Firefox
  and WebKit are the owner's run.
