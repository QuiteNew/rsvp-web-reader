# Phase 3 progress

The running record of phase 3, so the work can stop at any point and be
picked up by whoever comes next without guessing. The spec is
[phase-3.md](phase-3.md). Update this file with every commit.

## How each step is done

1. Add a `build_<module>()` to `tools/fixtures/generate.py` and run it with
   Python 3.13 against the desktop clone. The older fixture files must come
   out unchanged.
2. Port the module into `src/core`, test it against its fixture, then port
   the desktop project's own tests for it under their Python names.
3. Break the port once on purpose to see a test fail, and put it back.
4. `npm run check`, then one commit.

## Steps

| #   | What                                                                  | State   |
| --- | --------------------------------------------------------------------- | ------- |
| 1   | `wpmStep`, `transcriptSort`, `reopen`, and Python's `lower()` exactly | Done    |
| 2   | `storageFormat`: the port of `parse_data` and the write side          | Next    |
| 3   | `bundle`: reading and writing an export file, the five messages       | Waiting |
| 4   | `library`: every `TranscriptStore` method as a pure function          | Waiting |
| 5   | `settings`: defaults, ranges, clamping, `_known_settings`             | Waiting |
| 6   | The store over a `Persistence`, with one in memory for tests          | Waiting |
| 7   | IndexedDB and `localStorage`, the damaged copy, `flush()`             | Waiting |
| 8   | The UI on the real store, export and import in Settings               | Waiting |
| 9   | `normalizer` (446 lines, 96 tests), its own commit                    | Waiting |

Still needed from the owner before step 8: a real export file from the
desktop app, and any design notes on saved data, Spaces, bookmarks or the
bundle. Steps 2 to 7 can be done from the desktop code alone.

## Step 1, done on 2026-11-16

- `src/core/wpmStep.ts`, `src/core/transcriptSort.ts`, `src/core/reopen.ts`,
  with fixtures `wpm_step.json`, `transcript_sort.json` and `reopen.json`.
- Tests in `src/core/libraryHelpers.test.ts`: the fixtures, then the pure
  tests of `test_transcript_sort.py` (7), `test_reopen_last_transcript.py`
  (5) and `test_wpm_keys.py` (4). The other tests in those three files are
  about the settings store or drive the app, and belong to steps 5 and 8.
- `WPM_RANGE` sits in `wpmStep.ts` for now. Move it to `settings.ts` in
  step 5 and import it from there.

Found on the way, and fixed:

- Sorting by title needs Python's `str.lower()` and its string comparison.
  Python compares by code point, JavaScript by UTF-16 unit, so an emoji
  sorts on the wrong side of a character near U+FFFF. `pyCompareText` in
  `pythonText.ts` does it Python's way.
- The browser's `toLowerCase()` is not Python's `lower()` when their
  Unicode versions differ. Node 22 has Unicode 17, Python 3.13 has 15.1,
  and 55 newer characters are lower-cased by one and not the other. The
  old `pyCasefold` used `toLowerCase()` and was wrong for those, which
  would have made a speaker's label key differ from the desktop's. Both
  `pyLower` and `pyCasefold` now use `src/core/pythonLowerTable.ts`, which
  the fixture script writes. `src/core/pythonCase.test.ts` checks every
  character against the new `case.json` fixture.
- Not covered by a table: which characters count as "cased" for the sigma
  at the end of a Greek word. That still comes from the browser.
