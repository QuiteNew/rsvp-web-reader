# Phase 3: saved data

Transcripts, Spaces and settings kept in the browser, picking up where you
left off, and export and import of a bundle file.

## Ask the owner first

- Are there design notes for saved data, Spaces, bookmarks or the bundle?
  If so they go in `reference/desktop-design/`.
- For an export file made by the owner's own desktop app, with text the
  owner does not mind having in the repository, or made from a throwaway
  data folder. It becomes a fixture: the promise is that the web app reads
  what the desktop app writes.
- Confirm the bundle promise as it stands in STATUS.md: reading desktop
  bundles (transcripts, Spaces, positions, bookmarks) is promised. Taking
  over the desktop settings and writing bundles the desktop can read are
  extras. Writing them is cheap once reading works, so recommend doing both
  and say so.

## The split

The rules are pure, so they go in `src/core` with fixtures. `src/store`
only keeps the current value, saves it and loads it. See the top of
`src/store/contract.ts`.

### Core, each with fixtures and its ported tests

| New file                 | From                       | Notes                                                                                                      |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `core/library.ts`        | `core/transcript_store.py` | Every method as a function from a `Library` to a new `Library`. Scenario fixtures, like `reader`.          |
| `core/storageFormat.ts`  | `core/storage.py`          | `parse_data` and the write side. The only place that knows the snake_case names.                           |
| `core/bundle.ts`         | `core/data_bundle.py`      | `BUNDLE_FORMAT_VERSION` is 1. The four error messages are shown to the person, so keep them word for word. |
| `core/settings.ts`       | `core/settings_store.py`   | The defaults, the ranges, the clamping in each setter, `_known_settings`, `_whole_number_or_none`.         |
| `core/reopen.ts`         | `core/reopen.py`           | 18 lines.                                                                                                  |
| `core/transcriptSort.ts` | `core/transcript_sort.py`  | Six sort orders. Check how it compares titles, Python and JavaScript sort strings differently.             |
| `core/wpmStep.ts`        | `core/wpm_step.py`         | 22 lines.                                                                                                  |
| `core/normalizer.ts`     | `core/normalizer.py`       | 446 lines of regular expressions, 96 tests. The biggest port left. Give it its own commit.                 |

Things in `parse_data` that are easy to miss:

- A transcript without the three `*_color_is_default` flags gets `false`,
  not the dataclass default `true`. Old files keep their colours.
- Keys the app does not know are dropped, on transcripts and on bookmarks.
- `speaker_custom` goes through `cleanCustomSpeakers`, which is ported.
- A transcript missing `id`, `title` or `space`, or anything that is not an
  object, makes the whole result `None`. That is 'damaged', not 'missing'.
- `current_space_index` is clamped to the last Space when loading.
- Python's `True` is an `int`. Check what `_whole_number_or_none` does with
  it before porting, and put the case in the fixtures.

In the fixture script, `TranscriptStore` and `SettingsStore` write files.
Give each a temporary folder outside the desktop repository
(`TranscriptStore(data_directory=...)`, `SettingsStore(settings_directory=...)`)
and never let them use their default folder.

### Store

- `LibraryStore` and `SettingsStore` from the contract, over a
  `Persistence`. Tests use a `Persistence` that lives in memory.
- The real ones: the library in IndexedDB, the settings in `localStorage`
  (the brief's choice). Look up the current `idb` version and whether it is
  still the sensible wrapper before installing it.
- Recommended shape: the whole library as one record, like `data.json`. It
  keeps saving and the damaged-copy rule as simple as on the desktop. Say
  the cost to the owner: every save writes every transcript, which is fine
  for hundreds of transcripts and worth measuring with a very long one.
- Saving: at once for everything, except position and speed, which save at
  most once a second (`LIVE_SAVE_INTERVAL_SECONDS`). `flush()` when a
  session ends and when the page is hidden. Use `visibilitychange`, because
  `beforeunload` and `unload` are not reliable, least of all on phones.
- A value that cannot be read is copied aside before anything is saved over
  it (`keep_damaged_copy` in `storage.py`), and the person is told once.
- Ask the browser to keep the data (`navigator.storage.persist()`), and say
  in the app that the data lives in this browser only.

## Stored data

The names and record types are real code already: `src/store/schema.ts`
for the browser side and `src/core/savedShapes.ts` for the desktop's file
shapes. Build against them.

| Where                                     | Key       | Holds                                              |
| ----------------------------------------- | --------- | -------------------------------------------------- |
| IndexedDB `rsvp-web-reader`, `library`    | `current` | One `LibraryRecord`: `{ format, savedAt, data }`   |
| IndexedDB `rsvp-web-reader`, `damaged`    | see below | `DamagedRecord`, one per value that was unreadable |
| `localStorage` `rsvp-web-reader.settings` | -         | The settings as JSON text                          |

- `data` in the record is the desktop's `data.json` shape, snake_case and
  all. So one function, the port of `parse_data`, reads the saved library
  and the `data` part of a bundle, as on the desktop. Nothing else needs a
  second set of reading rules.
- Reading: no record is 'missing'. A record whose `format` is not 1, or
  whose `data` the port of `parse_data` refuses, is 'damaged'.
- A damaged value is copied to `damaged` before anything is written. The
  key is `library.damaged-YYYYMMDD-HHMMSS` (local time, like the desktop),
  with `-2`, `-3` when taken. If an earlier copy holds the same content,
  no new copy is made and that key is given back. Making the copy must
  never throw: on failure `keptAs` is null and the app still starts.
- Damaged settings: the text goes to the same `damaged` store with a
  `settings.` key, because `localStorage` is small.
- Writing: one `put` in one transaction. Never read then write in two
  transactions.
- Two tabs: not handled on the desktop, so there is no rule to port. The
  simplest safe choice is a `BroadcastChannel` message after each save
  that makes other tabs show "changed in another tab, reload". Ask the
  owner before building more than that.

## Versioning

Three numbers, each with one job:

| Number                  | Now | Raise it when                                              |
| ----------------------- | --- | ---------------------------------------------------------- |
| `DATABASE_VERSION`      | 1   | An object store is added or removed. Add an upgrade step.  |
| `LIBRARY_RECORD_FORMAT` | 1   | Old code can no longer read the record. Write a migration. |
| `bundle_format`         | 1   | Never on the web side. It follows the desktop's number.    |

A new field raises none of them. The desktop's rule is the rule here: a
missing key gets its default and an unknown key is dropped, on transcripts,
bookmarks and settings. Two things follow, and both are true on the desktop
as well:

- An older version of the app that opens newer data and saves it loses the
  newer fields. With an installed PWA an old cached version can do that.
  Phase 7 should make the app update before it writes.
- A migration is only needed for a change of meaning, never for a new key.

## Export and import rules

Read from `core/data_bundle.py`, `TranscriptStore` and `SettingsStore`.
The fixtures must prove each one.

Export:

- The file is `{ "bundle_format": 1, "data": ..., "settings": ... }`,
  written as JSON with an indent of 2. The desktop suggests the name
  `rsvp-reader-export.json`.
- `data` is the whole library in the saved shape. Keep every field of
  `SavedTranscript` in the web model even when no screen uses it yet, so a
  desktop file that goes in and out loses nothing.
- `settings` must be an object, or the desktop refuses the file. Never
  write `data_directory`.
- Whether the desktop reads a web export cleanly is not checked yet. That
  is the "writing bundles" extra the owner still has to confirm.

Reading a file, in this order, each with its message word for word:

1. Not JSON: "That file isn't valid JSON, so it can't be an RSVP Reader export."
2. Not an object, or no `bundle_format`: "That file doesn't look like an RSVP Reader export bundle."
3. `bundle_format` is not 1: "This bundle was made by a different version of RSVP Reader (format N, this app reads format 1) and can't be imported here."
4. `data` or `settings` is not an object: "That file is missing data this app expects in an export bundle."
5. The port of `parse_data` refuses `data`: "The transcript data in that file is malformed and can't be imported."

Replace:

- Spaces become the file's list, or `["General"]` when that list is empty.
- The current Space index is the smaller of the file's index and the last
  Space. A negative index is not corrected here.
- Transcripts and `next_id` are taken as they are.
- Settings are replaced by the file's, unknown keys dropped. Profiles are
  the exception: a file without a `profiles` key keeps the ones here.

Expand:

- Each Space name in the file that is not here yet is added at the end, in
  the file's order. Names are compared exactly, case included.
- Every transcript in the file is added after the ones here, with a new id
  counted up from this library's `next_id`. Everything else on it stays,
  its Space, position and bookmarks included.
- The current Space and the settings are left alone.

After an import the desktop closes, because nothing there reloads. On the
web, reload the page after the save has finished. It is the same idea and
the least code.

Three things in `parse_data` that look like gaps. They were checked by
running it on 2026-11-16. Port them as they are, put them in the fixtures,
and do not fix them without the owner:

- `next_id`, `current_space_index` and `spaces` are not checked at all. A
  string or a negative number passes.
- Field values are not checked either. `"wpm": "fast"` and a bookmark with
  `"index": "no"` pass.
- A transcript whose Space is not in `spaces` passes.

The web UI must not crash on such a library. Decide with the owner whether
the web port cleans these on load, which would be a difference from the
desktop, or shows them as they are.

### UI

The sidebar: Spaces (add, rename, delete, switch), the transcript list with
its sort menu, add, rename, move and delete a transcript, the edit box with
its unsaved draft, Normalize and its undo, reading stats, reopening the
last transcript, and export and import with Replace, Expand and Cancel. On
the desktop an import closes the app. On the web, reload the stores in
place and say so to the owner as a difference.

The desktop tests that say how these behave: `test_transcript_store.py`,
`test_storage.py`, `test_models.py`, `test_data_bundle.py`,
`test_damaged_files.py`, `test_settings_store.py`,
`test_export_import_in_app.py`, `test_keeping_unsaved_edits.py`,
`test_spaces_and_deleting.py`, `test_space_and_move_guards.py`,
`test_deleting_an_open_transcript.py`, `test_adding_a_transcript.py`,
`test_reopen_last_transcript.py`, `test_transcript_sort.py`,
`test_transcript_list_current.py`, `test_sidebar_rows.py`,
`test_normalizer.py`, `test_normalize_in_app.py`.

## Desktop tests left over from phase 2

`tests/test_transcript_speaker_list.py` has 19 tests that need the store or
the storage format: "The store setter", "Loading data.json" and "Export and
import". Port them with the store, next to the rules they check. Its
cleaner tests are already in `src/core/speakers.desktop.test.ts`.

`tests/test_chunking.py` has 25 tests of the same kind: the settings store
defaults and setters, the transcript store seeding and setting chunking,
and old saves loading with defaults. Its reader tests are already in
`src/core/reader.desktop.test.ts`.

## Done when

- The owner's desktop export loads in the web app with every transcript,
  Space, position and bookmark in place.
- Reading, closing the tab and coming back lands on the same word.
- A damaged record is kept aside and reported, shown by a test.
- Playwright covers: add a transcript, read, reload, still there.
