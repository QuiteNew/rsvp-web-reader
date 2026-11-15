# Phase 4: the reading experience

Guide marks, the surrounding-words line, the scrubber, bookmarks, chunking,
keyboard shortcuts, themes, and fitting wide flashes. After this phase the
owner announces the preview.

## Ask the owner first

For the design notes on chunking, the keyboard shortcuts, and reader fit
and scroll. The brief names all three as written down outside the
repository.

## What to build, and where the behaviour is written

The core side of most of this is already ported. This phase is mostly UI
over `ReaderSession` and the engine.

- **Guide marks.** The marks above and below the focus letter, and the
  optional horizontal ticks. Settings: thickness 2 to 6 px, length 15 to
  60 percent of the word size, a colour that follows the theme until picked
  by hand, and the focus letter offset of -3 to 3 px. Drawing rules are in
  `reader_display.py` (`_update_guide_marks` and the constants at the top).
- **The surrounding-words line.** `ReaderSession.peripheralContext` and
  `chunkPeripheralContext` are ported. The desktop shows one word before
  and two after, at half the word size, dimmed 55 percent towards the
  background. The snapshot in `engine/contract.ts` does not carry this
  line yet: add a field for it, built only when the setting is on.
- **The scrubber.** `scrubMove` and `scrubEnd` are in the engine contract.
  Bookmarks show as ticks on the bar. See `gui/components/scrub_bar.py`
  and `test_seeking_in_the_windows.py`.
- **Bookmarks.** Toggle one at the current word (the engine's
  `bookmarkTarget()` gives the index and the snippet), list them, rename,
  delete, jump (lands paused). See `bookmarks_popover.py` and
  `test_bookmarks_list.py`.
- **Chunking.** Per transcript, with defaults for new transcripts. Fixed
  mode 2 to 5 words, adaptive mode 15 to 60 characters. Only the first
  word of a chunk has a focus letter. See `chunking_settings_window.py`.
- **Keyboard shortcuts.** Read the bindings in `gui/app.py` and the design
  note. Check each against what browsers keep for themselves, and do not
  take over a browser shortcut. Shortcuts must not fire while typing in a
  text box.
- **Themes.** Light, Dark and System (`prefers-color-scheme`). Colours of a
  transcript follow the theme until picked by hand: that is what the
  `*IsDefault` flags and `resyncDefaultReadingColors` are for. Palette in
  `gui/theme.py`. Port `core/colors.py` (`blend_colors`, 27 lines, 13
  tests). See `test_theme_following_colours.py` and
  `test_reading_colours_follow_theme.py`.
- **Fitting wide flashes.** The desktop shrinks the font to no less than 60
  percent so the widest chunk fits, keeps 8 px clear each side, and lets
  the row pan when it still does not fit. The brief says `scroll` and
  `text_fit` are probably not needed with CSS. Confirm that by eye with a
  very long word and a five-word chunk on a narrow phone screen, show the
  owner, and only then drop them.
- **Settings.** A settings view for everything above, with search
  (`core/settings_search.py`, 36 lines) and reset to defaults. See
  `test_settings_apply.py`, `test_settings_pickers_and_resets.py` and
  `test_settings_search.py`.

## Checks

- Every new setting applies at once, with no reload.
- Playwright: scrub, bookmark, reload, the bookmark is there; the theme
  follows the system setting; the reader is usable at 360 px wide.
- Respect `prefers-reduced-motion` for anything that animates.

## Done when

The owner has read a long transcript with chunking on, used the scrubber
and bookmarks by keyboard only, and confirmed the phase.
