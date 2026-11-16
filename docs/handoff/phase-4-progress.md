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

| #   | What                                                                  | State   |
| --- | --------------------------------------------------------------------- | ------- |
| 1   | `colors`: `blend_colors`, with fixtures and the desktop tests         | Done    |
| 2   | `settings_search` (36 lines), the same way                            | Done    |
| 3   | Themes: the palette, Light, Dark and System, colours follow the theme | Done    |
| 4   | Guide marks and the focus letter offset                               | Done    |
| 5   | The surrounding-words line (a new snapshot field in the engine)       | Next    |
| 6   | The scrubber, with bookmark ticks                                     | Waiting |
| 7   | Bookmarks: toggle, list, rename, delete, jump                         | Waiting |
| 8   | Chunking: per transcript, and the defaults for new ones               | Waiting |
| 9   | Keyboard shortcuts                                                    | Waiting |
| 10  | Fitting wide flashes: try CSS first, show the owner                   | Waiting |
| 11  | The settings view for all of it, with search and reset                | Waiting |
| 12  | The Normalize button (left over from phase 3)                         | Waiting |

Steps 3 to 7 need nothing but the desktop code. Steps 8, 9 and 10 need
the design notes below.

## Asked of the owner

The brief says three design notes for this phase are kept outside the
desktop repository. Asked for on 2026-11-16, to go into
`reference/desktop-design/`:

- chunking (step 8)
- the keyboard shortcuts (step 9)
- reader fit and scroll (step 10)

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
