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

| #   | What                                                                  | State |
| --- | --------------------------------------------------------------------- | ----- |
| 1   | `wpmStep`, `transcriptSort`, `reopen`, and Python's `lower()` exactly | Done  |
| 2   | `storageFormat`: the port of `parse_data` and the write side          | Done  |
| 3   | `bundle`: reading and writing an export file, the five messages       | Done  |
| 4   | `library`: every `TranscriptStore` method as a pure function          | Done  |
| 5   | `settings`: defaults, ranges, reading, Replace, then the store        | Done  |
| 6   | The store over a `Persistence`, with one in memory for tests          | Done  |
| 7   | IndexedDB and `localStorage`, the damaged copy, `flush()`             | Done  |
| 8   | The UI on the real store, export and import in Settings               | Done  |
| 9   | `normalizer` (446 lines, 96 tests), its own commit                    | Next  |

Saving works end to end as of step 8, and the settings are real settings
as of step 5. What is left of phase 3 is step 9 (the normalizer), plus the
desktop tests listed at the end of this file.

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

## Steps 4, 6, 7 and 8, done on 2026-11-16

Step 4, the rules:

- `src/core/library.ts` has every `TranscriptStore` method as a pure
  function from a `Library` to the next one. A function with nothing to
  change gives back the very library it was given.
- Fixture `library.json`: 17 scripts of calls played on the real desktop
  store in a temporary folder, with the answer and the whole state after
  each call. The test fails if a ported method is in no script.
- `addBookmark` takes the time as an argument. The store stamps it the
  way Python's `isoformat()` writes UTC (`pythonUtcNow`).

Steps 6 and 7, the store:

- `src/store/libraryStore.ts`: `SavedLibraryStore`, the `LibraryStore` of
  the contract over a `Persistence`. `load()` reads once. Changes save at
  once, position and speed at most once a second, `flush()` writes what is
  waiting. Writes go one at a time and only the newest waiting one is
  written. A failed write is reported by `saveProblem()`.
- `src/store/indexedDbLibrary.ts`: the real `Persistence`, written against
  IndexedDB directly, no library. A record that cannot be read is copied
  to the `damaged` store first, once per content.
- `src/store/memoryPersistence.ts` for tests, `storageHealth.ts` for
  `navigator.storage.persist()`.
- `src/store/memoryLibrary.ts` and its test are gone. The stand-in is no
  longer needed.

Step 8, the page:

- `main.tsx` makes the one store and hands it to `App`. `App` shows
  "Opening your library" until it is read, a notice for a damaged save and
  for a failed write, and flushes on `visibilitychange`, on `pagehide`,
  when reading stops and when another transcript is opened.
- Settings has "Your data": export to a file, import with Replace or Add.
- `e2e/saving.spec.ts` checks the real thing in a browser: a reload keeps
  everything, a damaged record is put aside once, and an export file
  brings back what was deleted.

Where the web differs from the desktop, on purpose:

- A held-back position is written when its second is up, without waiting
  for the next change. The desktop waits. A tab can close with no warning.
- After an import the page is not reloaded. The store tells the page, and
  the page closes what was open. The desktop has to restart.
- A saved library with no Spaces, or an open Space past the end, is tidied
  on load the way an import is. The desktop would crash on the first.
- The notice texts for a damaged save, a failed write and a browser that
  will not save are new. The desktop's wording was not looked up.
- Damaged settings text is put aside in `localStorage` under
  `rsvp-web-reader.settings.damaged`, not in IndexedDB as the spec said.

Step 5 so far: `src/store/savedSettings.ts` keeps the settings of an
imported file as they are, so an export loses nothing on a round trip.

## Step 5a, the settings rules, done on 2026-11-16

- `src/core/settings.ts`, with the fixture `settings.json` (171 cases)
  made from the desktop's `SettingsStore` in a temporary folder.
- The settings stay in the desktop's own shape, one object with
  snake_case names (`SavedSettings`), so an export made here is the one
  the desktop would make. `DEFAULT_SAVED_SETTINGS` has every desktop
  setting but `data_directory`, window sizes included, in the desktop's
  order.
- `loadSavedSettings` is `_read_settings_file`: not an object is damaged,
  unknown keys are dropped, missing ones get the default, and a missing
  `guide_mark_color_is_default` is worked out from the colour.
- `replaceFromBundle` is `replace_from_bundle`, with the profiles rule.
- `setGuideMarkColor`, `restoreGuideMarkColor`,
  `resyncGuideMarkColorDefault`: the three setters that have a rule.
- `settingsView` gives the page its `Settings`. `withChanges` takes
  changes from the page and cleans them before they are saved.
- `WPM_RANGE` moved here from `wpmStep.ts`.

Found on the way:

- The desktop setters do not clamp. Its Settings window checks the ranges
  before it calls them, and the store saves what it is given. The spec
  and the contract said the setters clamp. Both are corrected.
- The desktop checks only ten settings when it reads them (the speaker
  cue ones, bold starts, reopen, the last id, the sort). The rest are
  read as they are, so `"default_wpm": "fast"` in a file reaches its
  window as text.

Where the web differs from the desktop here, on purpose:

- What is saved is not cleaned, as on the desktop. What the page reads
  (`settingsView`) always is: the wrong kind of value reads as the
  default, a number outside its range as the nearest end. For the ten
  settings the desktop checks, the view is tested against its getters.
- Profiles: a value that is not a list reads as no profiles, as on the
  desktop. The entries of a list are not checked yet. The desktop's
  `clean_profile_list` comes with phase 6. Until then a damaged entry is
  carried along, not dropped.
- JSON in the browser cannot tell `3.0` from `3`. The desktop reads
  `"last_transcript_id": 3.0` as no transcript, the web as transcript 3.

## Step 5b, the settings store, done on 2026-11-16

- `src/store/settingsStore.ts`: `SavedSettingsStore` over `localStorage`.
  It reads when it is made and writes after every change, so there is no
  `load()` and no `flush()`. The contract's `SettingsStore` was changed to
  match: `saved()`, `saveProblem()`, `setGuideMarkColor()` and
  `replaceFromBundle()` in, `flush()` and `replaceAll(Settings)` out.
- `savedSettings.ts` and its test are gone. `main.tsx` makes the one store
  and `App` gets it as the `settings` prop.
- Text that is not settings (not JSON, or not an object) is copied to
  `rsvp-web-reader.settings.damaged`, the defaults are used and the page
  says so once. The text itself stays until a change is saved over it.
- What the page takes from the settings now: reopening and the last
  transcript, the number of words a skip moves, and the nine values a new
  transcript starts with (speed, colours, size, chunking).
- Settings has its first switch: "Reopen the last transcript when the
  page opens".
- An export now carries every setting, not only the ones a file brought.

Not done here, on purpose:

- No controls for the other settings. They come with the features that
  use them (phases 4 and 6).
- The colours a new transcript gets are the desktop's light theme ones.
  Nothing on the page draws with them until themes exist.
- Two tabs open at once: the last one to save a setting wins, and the
  other does not notice. Same as the library.

Next for settings: the desktop's own tests, `test_settings_store*.py` and
the settings halves of the sort, reopen and wpm tests.

## Coming back where you left off, done on 2026-11-16

Asked for by the owner after trying the saving, and it is what the desktop
does (`_reopen_last_transcript` in `gui/app.py`, `core/reopen.py`):

- The transcript that is open is remembered in the saved settings under
  the desktop's own name, `last_transcript_id`. Nothing open is `null`.
- A transcript keeps whether it was left in the reader or as text
  (`isStopped`) and whether it was paused (`isPaused`). Start sets
  `isStopped` false, Stop sets it true, the pause button saves `isPaused`.
- After a reload that transcript is open again. Left in the reader, it
  comes back in the reader on the same word, always paused, and the pause
  is saved. Left as text, it comes back as text. Its Space is opened if
  another one was.
- The same holds when a transcript is picked in the list: one that was
  left in the reader opens in the reader, paused.
- `reopen_last_transcript: false` in the saved settings switches it off.
  There is no switch for it on the page yet. That comes with step 5.

Where the web differs from the desktop here:

- A transcript made on the page starts with `isStopped` true, so it shows
  as text until Start is pressed. The desktop's default is false.
- Leaving a transcript (a new Space, a switch of Space) forgets it as the
  last one. The desktop keeps a transcript open across a switch of Space.
- After an import nothing is open, whatever the file's settings say.

Saving the place when the reader is not playing:

- While words go by, the position is saved at most once a second, as the
  desktop does. When the reader is not playing, a position change is a
  skip, a drag or a pause, so `App.tsx` calls `flush()` and it is written
  at once. Without that, a skip made within a second of the last write and
  a reload right after lost the skip (found in the browser tests: about 1
  run in 10 in Chrome).
- The browser tests no longer assume where a pause lands. Restart leaves
  the reader playing, so they pause first and read the word back.
- `e2e/smoke.spec.ts` had the same kind of timing race, and failed in
  WebKit on the owner's machine. Fixed: no browser test expects a certain
  word while reading is going. They pause first, or ask only that the word
  changes, and the Restart test lets the page write down the words it
  shows. The text is 300 words longer so a pause never lands at the end.
