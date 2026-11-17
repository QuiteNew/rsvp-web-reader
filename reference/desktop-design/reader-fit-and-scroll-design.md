# Reader fit and horizontal scroll - design

Status: BUILT and committed, shipping in v3.1.0 (2026-10-12/13). Auto-fit,
the horizontal scrollbar, the centre button and the C shortcut are all in, in
the main, detached and selection-preview windows. Docs/README for 3.1.0 written
at release time. Follows the chunking work (shipped in v3.0.0). This was the
"Horizontal scrollbar in the reader display" roadmap item, reframed after
discussion: the real fix is auto-fit, the scrollbar is an edge-case fallback.

## Problem

With chunking on (especially a large Word size plus a chunk of 3 to 5 words), a
flash can be wider than the reading row and gets clipped, so the words spill out
of the window and cannot be seen. A single very large word can do the same.

## Goal and decisions (agreed)

- Both auto-fit and a scrollbar, but auto-fit does the work; the scrollbar is
  only for the edge cases auto-fit cannot cover.
- Auto-fit is RENDER-ONLY: it changes the on-screen font size, never the saved
  Word size (the setting, the +/- stepper, and the stored value are untouched).
- Build auto-fit first, test it well, then the scrollbar.
- On by default for every transcript, in both the main and detached windows. A
  Settings toggle is a maybe, not now.
- The scrollbar appears only when needed (overflow remains after auto-fit); it
  is absent otherwise.
- Floor: auto-fit shrinks no smaller than 60% of the chosen Word size.
- Fit sizing is computed over the WHOLE transcript, so it is one stable size for
  the session, not a size that changes per flash. (Widest chunk is measured once
  per load or re-group and cached per unit of font size; a resize or Word-size
  change only re-derives the render size.)

## The fit model (grounded in reader_display.py)

A flash is centered on the ORP letter, not on the flash's geometric center. The
first word of a chunk keeps its before/focus/after split; the rest of the chunk
trails in the after part. In the shared word_font:

- left_extent  = before_width + focus_width / 2
- right_extent = after_width  + focus_width / 2   (the trailing words live here,
  so for a multi-word chunk this dominates)
- the flash fits the row only when 2 * max(left_extent, right_extent) <=
  usable_width.

Auto-fit finds, across all chunks in the transcript, the largest required width
(2 * max(left, right)), then picks the largest render size <= the chosen Word
size, down to the 60% floor, that satisfies the inequality for the current
usable width. Font width scales almost linearly with size, so this is one pass
to find the widest chunk at the chosen size, then a direct
size * usable / required estimate with a small correction, cheap even for long
transcripts. The result is applied to word_font's display size only.

Recompute on: load/play, a chunking change, a Word-size change, and a window
resize. Guide marks and the peripheral ribbon already derive from word_font's
size, so they follow the scaled size with no extra work.

The floor is the seam to the scrollbar: auto-fit stops at 60%. Whatever still
overflows past the floor is exactly what the scrollbar pans over. If nothing
overflows past the floor, there is no scrollbar.

## Core / GUI split

- Core (reader.py) owns how a chunk's text is assembled from its ORPWord frames
  (the "first word split, rest trail in the after part" rule). A read-only
  helper exposes, per chunk, the assembled (before, focus, after) text. This is
  the single source of truth, used both by rendering and by fit-measuring.
- Core (scroll.py) owns the pan arithmetic only: pan_range, clamp_pan,
  scrollbar_fractions, pan_from_fraction. Pure, unit-tested (tests/test_scroll.py).
- GUI (reader_display.py) owns pixel measurement (font metrics), the fit-size
  calculation, applying the render size, the scrollbar widget, the centre button
  and the anchor_x pan offset.

## As built: the scrollbar and centre button

- A pixel offset (_pan_offset_px) is added to the centre anchor. Positive moves
  the flash right (reveals left overflow), negative moves it left (reveals right
  overflow). Travel is bounded to exactly the overflow of the widest chunk, so a
  position set once holds for the whole session and there is no empty space to
  scroll into.
- CTkScrollbar (horizontal, ember colours, transparent track), packed along the
  bottom of the reader only while overflow remains; removed (and pan reset to
  centred) when nothing overflows. Tk scrollbar protocol handled in
  _handle_scroll: ("moveto", fraction) and ("scroll", n, "units"|"pages").
- Panning goes through a light path (_apply_pan) that only re-places the three
  word labels and the context ribbon at cached sizes. It does NOT re-run the
  full layout.
- Centre button: 20px square, 4px corner radius, ember colours, Pillow-drawn
  crosshair icon (gui/icons.py center_icon). Placed in_ the reading row at its
  bottom-left corner (just above the scrollbar), shown/hidden together with the
  scrollbar. Lives in ReaderDisplay, so all three windows get it. C / c key
  (guarded by the usual Entry/Text focus check) calls center_pan(); the main
  window routes via Canvas.center_pan() (follows the detached reader while one
  is open, like pause/restart), the detached and preview windows call their own
  reader directly.
- Pan position is NOT persisted: it resets to centred on every load and
  whenever the scrollbar goes away. Decided against persisting (per transcript
  or per session): panning only happens in the rare floor-overflow case and the
  centre button is one click away.

## Findings worth keeping (visual artifacts while panning)

- Ghosting root cause (confirmed by user screenshots): the guide marks are solid
  canvas-backed CTkFrames; sliding them with .place() leaves uncleared copies of
  the old pixels. Words are text labels and repaint cleanly. Fix: hide the guide
  marks whenever pan != 0 (they mark the fixed centre point, which is no longer
  where the focus letter is); they return when the pan returns to 0.
- A first diagnosis (blame the per-tick full layout / update_idletasks reflow)
  was wrong on its own: removing the reflow without hiding the marks made the
  ghosting MORE visible, because the forced redraw had been partly masking it.
- Residual: during a scrollbar DRAG the three word labels (before/focus/after)
  are moved by three separate place() calls and Tk can repaint between them, so
  the word can briefly "tear". Tried a single update_idletasks() flush at the end
  of _apply_pan; the user reported it made things worse, so it was removed.
  Parked (accepted as is): option #2, put the three labels in one container frame
  and move only that, so one place() per tick. Unverified (no Tk in the build
  container), risk of ghosting the container, so only worth doing if it bothers
  real reading. It is a rare path: scrollbar visible AND being dragged.
- Honest limitation already discussed: a flash wider than the window still
  cannot be fully seen in one glance by panning; the scrollbar is a positioning
  aid for the leftover, auto-fit is what keeps things visible.

## Open / deferred

- Settings toggle for auto-fit (still a maybe).
- Option #2 above, if the drag tearing ever matters.
- Guide marks hidden while panned vs pinned at row centre: kept hidden.

## Commit history (2026-10-12), for reference

1. Added a shared chunk-text assembler to ReaderSession
2. Fit the reader font to the widest chunk (render-only)
3. Added GUI smoke tests for reader auto-fit
4. Added pure horizontal-scroll geometry for the reader
5. Added a horizontal scrollbar to pan a wide flash into view
6. Stop the reader scrollbar from ghosting the flash and flickering
7. Added a centre button and C shortcut for the reader's horizontal pan
