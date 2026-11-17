# Chunking v2 - adaptive sizing - design

Status: agreed spec, building against it. Follows claude/chunking-v1-design.md
(v1 is shipped: fixed 2-5 word chunks, per-transcript + global default, footer
toggle + size stepper, Settings default toggle + size slider). This document
covers only the adaptive-sizing addition. The guiding rule from v1 still holds:
the single-word reader must not change, and fixed-mode chunking must behave
exactly as it does today.

## Summary

Add an "adaptive" chunk sizing mode alongside the existing fixed word-count
mode. In adaptive mode a chunk is filled up to a character-width target
(words plus the single spaces between them) rather than a fixed number of
words, so group size follows the text. Fixed mode is unchanged and stays the
default. Mode and the adaptive width are per-transcript with global defaults,
like the rest of chunking.

## Decisions (adaptive decision sheet)

- A: Adaptive is a MODE, not a replacement. A new per-transcript "size mode"
  picks Fixed (N words) or Adaptive (by width). Fixed is unchanged and is the
  default everywhere.
- B: Adaptive grouping is driven by a character-width target: fill the chunk
  up to the target, stop before the word that would exceed it. Reuses the
  character measuring already in _build_chunks. The existing hard rules still
  apply: never cross a sentence end; the first word of a chunk is always
  included even if it alone exceeds the target (no empty chunk).
- C: Adaptive mode has a word ceiling of 6, so a run of very short words
  cannot pile an absurd number into one flash even when they fit the width.
- D: The target is characters including spaces. CHUNK_CHAR_TARGET_RANGE =
  (15, 60), default 30 (30 matches v1's CHUNK_CHAR_CAP). In adaptive mode the
  target is the driver; v1's fixed-mode safety cap (CHUNK_CHAR_CAP, still 30)
  is unchanged and still applies in fixed mode only.
- E: Clause-level breaks stay OUT of scope. Adaptive = width + the existing
  sentence break only. Breaking at commas/semicolons is a separate future v2
  toggle.
- F: Timing is unchanged. A chunk's dwell is still the sum of its member
  words' delays (WPM-exact). Adaptive changes only how words group, never the
  timing. The sub-1.0 phrase speed-up factor remains a separate future item.
- G: UI. The footer stays as v1 built it (the Group on/off switch and the
  fixed word-size stepper); it is the quick per-transcript control. All the
  detailed chunking settings move into a new dedicated dialog opened from a
  "Configure chunking..." button under Settings -> Defaults, which replaces
  v1's switch+slider block in that tab. The dialog holds every chunking
  setting (on/off, mode, fixed word size, adaptive width), each explained in
  prose, with a selector at the top choosing whether the changes apply to the
  CURRENT transcript or to the DEFAULTS (new transcripts). The footer's
  fixed-size stepper is untouched and keeps editing the fixed word size.
- H: Persistence / back-compat. New Transcript fields chunk_mode ("fixed") and
  chunk_char_target (30); new AppSettings defaults default_chunk_mode and
  default_chunk_char_target plus CHUNK_CHAR_TARGET_RANGE. Old save files miss
  the keys and fall back to the dataclass defaults (fixed, today's behavior),
  confirmed because core/storage.py's parse_data does Transcript(**t) and
  core/settings_store.py's _load does AppSettings(**data), both tolerant of
  missing keys. The export/import bundle round-trips them automatically via
  asdict. No storage.py change needed, same as v1.

## Data model

Transcript (core/models.py) gains, seeded at creation from the global
defaults like the v1 chunking fields:

- `chunk_mode: str = "fixed"`   ("fixed" or "adaptive")
- `chunk_char_target: int = 30` (adaptive width, valid range 15 to 60)

chunk_size (v1) stays and is used in fixed mode. chunking_enabled (v1) stays
and gates chunking in both modes.

AppSettings (core/settings_store.py) gains the matching defaults and a range:

- `default_chunk_mode: str = "fixed"`
- `default_chunk_char_target: int = 30`
- `CHUNK_CHAR_TARGET_RANGE = (15, 60)`

Mode constants live in core/reader.py (added in the grouping step):
`CHUNK_MODE_FIXED = "fixed"`, `CHUNK_MODE_ADAPTIVE = "adaptive"`. A word
ceiling constant for adaptive mode: `ADAPTIVE_MAX_WORDS = 6`.

## Grouping

_build_chunks becomes mode-aware by computing a (max_words, char_limit) pair
and then running the exact same scan loop v1 already uses (reached size, or a
sentence-ending word, or the next word would exceed char_limit, with the
first word always included). The limits:

- Disabled (chunking off): max_words = 1 (every chunk one word, single-word
  reading unchanged).
- Fixed: max_words = chunk_size, char_limit = CHUNK_CHAR_CAP (30). This
  reproduces v1 fixed behavior byte for byte, so the existing tests stay green.
- Adaptive: max_words = ADAPTIVE_MAX_WORDS (6), char_limit = chunk_char_target.

So adaptive is just the same loop with the width target as the char limit and
a 6-word ceiling instead of the 2-5 size. set_chunking() and the __init__
build both go through one helper that derives the limits from the current
mode, so the two can't drift (as _rebuild_chunks already does in v1).

## Position, timing, navigation, rendering

Unchanged from v1. Word index stays canonical; advance/seek/snap, chunk dwell
= sum of word delays, remaining_ms, rendering (first word anchored, rest
trailing), and the peripheral ribbon all operate on whatever chunk ranges
grouping produced, so they need no change for adaptive.

## UI

Footer (gui/components/footer.py): unchanged from v1. Group switch + fixed
word-size stepper, driving the current transcript. (In adaptive mode the
stepper still edits the fixed word size, which only takes effect if the
transcript is switched back to fixed; acceptable, the dialog is where mode and
width live.)

New dialog (a new gui component, e.g. chunking_settings_window.py): opened
from a "Configure chunking..." button added under Settings -> Defaults, which
replaces v1's inline switch+slider there. Contents:

- A target selector at the top: "Apply to: Current transcript | New
  transcripts (defaults)". Controls load from, and save to, whichever target
  is selected (the open transcript via TranscriptStore, or the AppSettings
  defaults via SettingsStore).
- Chunking on/off.
- Mode: Fixed | Adaptive.
- Fixed word size (2-5) - used in fixed mode.
- Adaptive width (15-60 chars) - used in adaptive mode.
- Each setting explained in a short paragraph, including whether it applies to
  the current transcript or to new transcripts only.
- Changing the current transcript re-groups the live reader in place (the v1
  Canvas.set_chunking path, broadened to carry mode + target), keeping the
  word position. Changing defaults only affects new transcripts.

## Scope

v2 adaptive: everything above, in both the main and detached windows. Fixed
mode and the single-word path are untouched.

Still future (not this feature): clause-level breaks, the sub-1.0 phrase
speed-up factor, a skip-by-chunk toggle.

## Implementation plan (core first, tests at each step, commit per step)

1. Data model + settings: add the Transcript fields, the AppSettings defaults,
   and CHUNK_CHAR_TARGET_RANGE. Non-breaking (no signature changes yet).
   Tests: defaults, old-file load, settings load, bundle round-trip.
2. Core grouping: mode constants and ADAPTIVE_MAX_WORDS in core/reader.py,
   mode-aware limits feeding the existing scan loop, chunk_mode/chunk_char_
   target params on ReaderSession.__init__ and set_chunking/_rebuild_chunks.
   Pure tests: adaptive width grouping, the 6-word ceiling, sentence break,
   overlong first word, short final chunk, and that fixed/disabled are
   unchanged.
3. Store + reader wiring: TranscriptStore.add_transcript and
   set_transcript_chunking carry mode + char_target; the ReaderSession builds
   in canvas.py and detached_window.py pass them; Canvas.set_chunking and
   app._handle_chunking_changed carry all four (footer still sends enabled +
   size, app fills mode + target from the current transcript). Tests.
4. The Configure chunking dialog + the Settings button that opens it, removing
   v1's inline Defaults block; apply-to-current/defaults selector and the live
   rebuild.
5. GUI smoke tests for the dialog and adaptive reading (main + detached).
6. Docs (deferred to the very end, with the rest of the chunking docs).
