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

| #   | What                                                                  | State                 |
| --- | --------------------------------------------------------------------- | --------------------- |
| 1   | `colors`: `blend_colors`, with fixtures and the desktop tests         | Done                  |
| 2   | `settings_search` (36 lines), the same way                            | Done                  |
| 3   | Themes: the palette, Light, Dark and System, colours follow the theme | Part 3a done, 3b next |
| 4   | Guide marks and the focus letter offset                               | Waiting               |
| 5   | The surrounding-words line (a new snapshot field in the engine)       | Waiting               |
| 6   | The scrubber, with bookmark ticks                                     | Waiting               |
| 7   | Bookmarks: toggle, list, rename, delete, jump                         | Waiting               |
| 8   | Chunking: per transcript, and the defaults for new ones               | Waiting               |
| 9   | Keyboard shortcuts                                                    | Waiting               |
| 10  | Fitting wide flashes: try CSS first, show the owner                   | Waiting               |
| 11  | The settings view for all of it, with search and reset                | Waiting               |
| 12  | The Normalize button (left over from phase 3)                         | Waiting               |

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

### Part 3b, still to do (page work, with browser tests)

- Put the palette on the page as CSS custom properties, chosen by a
  `data-theme` attribute on `<html>`. The current CSS has the light
  colours written in `src/ui/*.css`; move each to a variable named after
  the palette key (`--hearth-paper` and so on).
- An Appearance choice in Settings (Light, Dark, System) writing
  `appearance_mode` through the settings store. System follows
  `matchMedia('(prefers-color-scheme: dark)')`, and should follow a
  change while the page is open.
- At page start, and when the theme changes: call
  `resyncDefaultReadingColors` on the library and
  `resyncGuideMarkColorDefault` on the settings, with the theme's colours.
  New transcripts take `themeReadingColors` instead of the plain Defaults.
  Open question for the owner: the desktop does this only at launch. On
  the web a live switch is natural, because the chrome changes at once, and
  the reading colours would otherwise lag until a reload.
- Avoid a flash of the wrong theme: set `data-theme` from the saved
  setting before React renders (a small script in `index.html` reading
  localStorage), without breaking the CSP if there is one.
- Tests: App tests for the Appearance choice; one e2e that picks Dark,
  reloads and sees it kept.
