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

## Done when

- The owner's desktop export loads in the web app with every transcript,
  Space, position and bookmark in place.
- Reading, closing the tab and coming back lands on the same word.
- A damaged record is kept aside and reported, shown by a test.
- Playwright covers: add a transcript, read, reload, still there.
