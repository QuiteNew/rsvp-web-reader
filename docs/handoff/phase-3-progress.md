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
| 2   | `storageFormat`: the port of `parse_data` and the write side          | Done    |
| 3   | `bundle`: reading and writing an export file, the five messages       | Done    |
| 4   | `library`: every `TranscriptStore` method as a pure function          | Next    |
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

## Step 2, done on 2026-11-16

- `src/core/storageFormat.ts`: `parseData` (the port of `parse_data`),
  `toSavedData` (what `save_state` and `export_state` write, as an object)
  and `LIVE_SAVE_INTERVAL_SECONDS`. Fixture `storage.json`, 62 cases, about
  half readable and half not.
- `parseData` does not change what it is given. The desktop's does.
- Values are not checked, as on the desktop, so a `Library` from
  `parseData` can hold a speed of "fast" or a Space index of -3. The type
  is a promise the data may break. Whether the web app cleans such data
  is still the owner's call, see "Export and import rules" in the spec.
- Python walks more than lists: `"transcripts": ""` or `{}` reads as no
  transcripts, and the same for `bookmarks`. Ported as it is.
- Not ported yet: turning the object into text. `save_state` uses
  `json.dumps(data, indent=2)`, which also writes every non-ASCII
  character as a `\u` escape. `JSON.stringify(data, null, 2)` does not.
  Both read back the same, so it only matters if a file has to match the
  desktop's byte for byte. Decide in step 3.
- Not ported yet: `keep_damaged_copy` and `read_state`. They work on files
  and belong to step 7, with the rules in the spec under "Stored data".
- The desktop tests for this (`test_storage.py`, `test_models.py`,
  `test_damaged_files.py`) are not ported yet. Do them with step 6, when
  there is a store to run the save and load ones against.

## Step 3, done on 2026-11-16

- `src/core/bundle.ts`: `buildBundle`, `bundleText`, `parseBundle` with
  the five messages word for word, `BUNDLE_FORMAT_VERSION` and
  `BUNDLE_FILE_NAME`. Fixture `bundle.json`.
- `src/core/library.ts` is started with the two functions an import needs:
  `replaceAll` and `mergeAll`, checked against the real `TranscriptStore`
  in a temporary folder. Step 4 adds the rest of the store's methods here.
- `parseBundle` gives the file's settings back raw, as the desktop does.
  Turning them into `Settings` is step 5. The `Bundle` type in
  `src/store/contract.ts` says `Settings | null`, so the store's
  `BundleService` does that conversion when it is built.
- `bundleText` is `JSON.stringify(bundle, null, 2)`. The desktop escapes
  every non-ASCII character, this does not. Decided: leave it, both sides
  read both. Whether the desktop takes a web export in full is still to be
  tried with the real app, by the owner.

Known differences from the desktop, all in refusing a bad file:

- Python's JSON reader accepts `NaN` and `Infinity`. JavaScript's does
  not, so such a file gets the "isn't valid JSON" message here.
- The "different version" message shows the file's format the way Python
  prints it. A format written as `2.0` shows as `2` here, and a number
  beyond 2^53 loses its last digits.
- `"bundle_format": true` is let in, because in Python `True == 1`.

Not done in this step: the desktop tests `test_data_bundle.py` and
`test_export_import_in_app.py`. Port the first with step 6, when the store
exists. The second drives the app and belongs to step 8.
