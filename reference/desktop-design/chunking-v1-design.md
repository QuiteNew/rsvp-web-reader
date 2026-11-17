# Chunking (multi-word flash) - v1 design

Status: agreed spec, not yet implemented. This is the thing we build against.
Guiding rule: the single-word reader must not change. Chunking-off behaves
exactly as today, and that is also the implicit "chunk of one word" path.

## Summary

Chunk mode groups consecutive words and flashes them together, a configurable
2 to 5 words at a time. It is a per-transcript setting with a global default for
new transcripts, and can be turned on or off on any transcript, including one
already open. The first word of each chunk keeps the Optimal Recognition Point
highlight, anchored to the same fixed point as today; the rest of the chunk
flows out to the right. WPM stays exactly true, the word index stays the
canonical reading position, and chunks never span a sentence end.

## Decisions (from the Chunking decision sheet)

- A1: per-transcript, seeded from a global default. Override per transcript.
- A2: fixed word count (adaptive is v2).
- A3 / F1: an on/off toggle plus a size of 2 to 5 (model X). "Off" is the
  toggle's job; size never goes to 1.
- B1: a sentence-ending word closes the chunk. No chunk crosses a period.
- B2: clause-level breaks are v2.
- B3: a short final chunk is allowed.
- B4: a soft character cap can end a chunk early so long words do not overflow.
- C1 / C2: highlight model (a). The first word's ORP letter is highlighted and
  anchored; the rest of the chunk reads left to right from there.
- C3: guide marks stay, around the anchored first-word letter, while flashing.
- D1: a chunk stays up for the sum of its member words' delays (WPM exact).
- D2: punctuation pauses are already inside those per-word delays, so they land
  at the chunk's end with no special handling.
- D3: ease-in stays word-based.
- D4: long-word length pacing is unchanged.
- E1: word index stays canonical; pausing or seeking snaps to the chunk
  containing that word.
- E2: skip moves by words, then snaps to the enclosing chunk. Skip-by-chunk is
  a v2 toggle.
- E3: read-outs (word X of Y, time remaining, percent) stay word-based.
- F1 / F2: Settings gets the default toggle and the size slider; takes effect on
  Apply.
- F3: the peripheral surrounding-words line stays user-controlled.
- Item 3: the per-transcript override lives in the bottom control band; the
  global default lives in Settings.
- Item 4: chunking rides along in the detached window in v1 (same reader, zero
  extra cost). The "chunking active" icon and detached-specific polish are v2.

## Data model

Transcript (core/models.py) gains two fields, seeded at creation from the
global defaults, like wpm and colors:

- `chunking_enabled: bool = False`
- `chunk_size: int = 2`   (valid range 2 to 5)

AppSettings (core/settings_store.py) gains the global defaults and a range:

- `default_chunking_enabled: bool = False`
- `default_chunk_size: int = 2`
- `CHUNK_SIZE_RANGE = (2, 5)`

Backward compatibility: old save files lack these keys. `chunk_size` and the
`*_enabled` flags have safe dataclass defaults (disabled, size 2), so a missing
key resolves correctly with no explicit backfill, the same way the stats fields
already do. Confirm during implementation that core/storage.py's parse_data
needs no special handling here.

A soft character cap constant (a tuning value, finalized during manual testing):

- `CHUNK_CHAR_CAP` around 28 to 32 characters including spaces. Never yields a
  zero-word chunk; a single over-long word still forms a one-word chunk.

## Grouping

Grouping is computed once at ReaderSession construction, alongside the existing
per-word frames and pacing tables, producing an ordered list of chunks. Each
chunk is a contiguous range of word indices.

Rules, scanning words left to right and closing the current chunk when any hold:

1. The chunk has reached `chunk_size` words.
2. The just-added word ends a sentence (its trailing punctuation classifies as
   a sentence pause; reuse the existing `_paces[i] == "sentence"`).
3. Adding the next word would push the chunk past `CHUNK_CHAR_CAP`. The current
   word still joins; the next starts a new chunk. A chunk always holds at least
   one word.

The final chunk may be short. When `chunking_enabled` is False, every chunk is a
single word, which reproduces today's behavior through the same code path.

## Position, timing, navigation

Word index stays canonical. ReaderSession keeps `self.index` as a word index and
adds a word-to-chunk mapping and each chunk's first word index.

- current_chunk(): the chunk containing `self.index`.
- current_chunk_delay_ms(): the sum of current_delay_ms for each member word.
  Each member delay already carries punctuation pacing, optional length pacing,
  and warm-up, so summing them makes WPM exact and lands the pause at the
  chunk's end.
- advance(): moves `self.index` to the first word of the next chunk, and
  increments `_words_shown` by the chunk's word count so the warm-up ramp stays
  word-based. (Single-word path: +1 word, +1 shown, as today.)
- seek() / seek_to() (skip and the scrubber): operate on the word index as
  today, then snap `self.index` to the first word of the chunk containing the
  landed word.
- remaining_ms() and progress percent: unchanged. remaining_ms already sums
  per-word delays from the current word to the end, and a chunk's dwell is the
  sum of its words' delays, so the total is identical grouped or not. No change
  needed.
- Bookmarks: still word indices. Jumping snaps to the enclosing chunk's start.

## Rendering and alignment

ReaderDisplay renders the current chunk as:

`[first-word before][first-word FOCUS (highlighted, anchored to the fixed x)][first-word after] [remaining words of the chunk, normal color, flowing right]`

Only the first word's ORP letter is highlighted and pinned to the anchor point.
The rest of the chunk reads left to right from there. Guide marks stay around
the anchored first-word letter and show only while flashing, as today. The soft
character cap keeps the line within the reading width; a lone over-long word
falls back the same way single-word does now.

Peripheral context ribbon (when enabled): "before" words precede the chunk's
first word, "after" words follow the chunk's last word. Left user-controlled,
not auto-disabled.

## Settings and UI

Settings, Defaults tab (global defaults for new transcripts):

- A "Chunk words together" toggle, default off.
- A "Chunk size" slider, 2 to 5, default 2, read-out like "2 words".
- Both take effect on Apply, and set default_chunking_enabled /
  default_chunk_size.

Bottom control band (per-transcript override for the open transcript, beside
speed and colors):

- A chunking on/off toggle and a size control for the current transcript.
- Changing either rebuilds the current session's grouping, keeping the word
  position, snapped to a chunk boundary.

## Scope

v1: everything above, in both the main and detached windows. The single-word
path is untouched.

v2: adaptive chunking (by characters or punctuation), clause-level breaks, a
sub-1.0 speed-up factor so a phrase is not simply the sum of its words, a
skip-by-chunk toggle, a "chunking active" reader icon, and any detached-specific
polish.

## Implementation plan (core first, tests at each step)

1. Model and settings: add the Transcript fields, the AppSettings defaults, and
   CHUNK_SIZE_RANGE. Confirm storage migration needs nothing. Tests for defaults
   and old-file loading.
2. Core grouping and navigation in ReaderSession: grouping rules, current_chunk,
   current_chunk_delay_ms, chunk-aware advance, seek snapping, warm-up word
   counting. Pure-logic tests: sentence breaks, size cap, char cap, uneven last
   chunk, delay sums equal to single-word totals, seek snapping, and a check
   that the disabled path matches today exactly.
3. ReaderDisplay rendering: draw a chunk with the first word anchored and the
   rest trailing, guide marks on the anchor, peripheral ribbon around the chunk.
4. Display timing loop: schedule by chunk dwell, advance by chunk.
5. Settings UI: the Defaults toggle and size slider, wired to the defaults, with
   an Apply rebuild.
6. Bottom control band: the per-transcript toggle and size, with a live rebuild.
7. Detached window: confirm it inherits chunking; smoke test.
8. Full test pass, manual check at several sizes and WPMs, then docs (usage, a
   note on the technique page, and the new fields on the data-format page).
