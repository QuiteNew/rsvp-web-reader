# src/importers

Reading a file someone picked, in the browser, into plain transcript text.
The port of the desktop app's `core/importers.py`, for the parts that need
the browser: reading the file's bytes, decoding text, and later HTML, Word
and PDF.

- Imports from `src/core` only, never from `engine`, `store` or `ui`, and no
  React. ESLint enforces it.
- One way in: `importFile()` takes a `File` and gives back the text with a
  title, or a plain message to show. After that the text is treated like
  pasted text.
- Nothing leaves the browser. No network, no upload.
- The UI loads this folder only when someone picks a file, so the reader's
  own download does not grow.

The rules that need no browser (the file types, the file name rules, the
subtitle and Markdown formats) are in `src/core/importers.ts`.
