# Phase 5: importing files

This phase starts with research and testing, not code. Nothing here is
decided, on purpose. The owner decides how each format is read after seeing
the comparison. Read "File import" in section 3 of the brief again before
starting.

The rule that does not bend: files are read in the browser. No server, no
upload, no third-party service, no network.

## Step 1: read what the desktop app does

`core/importers.py` (370 lines), `tests/test_importers.py` (58 tests) and
`tests/test_importer_errors.py` (9 tests). Its list of extensions is
`.txt`, `.srt`, `.vtt`, `.md`, `.markdown`, `.html`, `.htm`, `.docx` and
`.pdf`. The brief's list leaves out `.vtt` and Markdown, so ask the owner
whether those two are wanted.

Write down, per format: what text comes out, what is dropped, which errors
exist and their exact messages, and how text encodings are guessed
(`_read_text_with_fallback`). Also find the warning for very large imports
in `gui/app.py` (`LARGE_IMPORT_WORD_WARNING_THRESHOLD`).

## Step 2: research, with current facts

For each format the owner wants, list the realistic ways to read it in the
browser. For each: current version, licence, download size, browser
support, whether it runs in a Web Worker, and what it cannot do. Look these
up at that time. Do not rely on memory, and do not treat any library as the
expected answer.

## Step 3: test on real files

Ask the owner for test files, or make them:

- A PDF encrypted only to block printing or editing. The desktop app opens
  these.
- A scanned PDF with no text layer. Say plainly that text cannot be read
  out of it without OCR.
- A Word file with tables and footnotes.
- A very long file, to see whether the page stays responsive.
- A subtitle file, and a web page saved from a browser.

Compare the text each option gives with what the desktop importer gives
for the same file.

## Step 4: the owner decides

Give a short comparison and a recommendation per format. Wait for the
answer.

## Step 5: build

- The seam, whatever is chosen: an importer takes a `File` and gives back
  plain text, or an error with a plain message. After that the text is
  treated like pasted text.
- Importer code loads only when someone picks a file (a dynamic
  `import()`), so the reader stays small.
- Long work runs off the main thread, with progress shown.
- The site must still make no network request. Add a Playwright test that
  fails on any request to another origin.
- Fixtures: the desktop importers' output for the test files is the
  expected text, where the chosen option can match it. Where it cannot,
  write the difference down and show the owner.

## Done when

Each chosen format imports the test files, the errors read well, the
reader's own download did not grow, and the owner confirmed.
