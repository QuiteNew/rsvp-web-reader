# Test files

Files to import, for the tests of `src/importers` and, later, the browser
tests. All of the text in them is invented for the tests.

- `rich.docx`: a heading, paragraphs, a table, a text box, a list, a
  footnote, a header and a footer, with curly quotes and words that PDFs
  turn into ligatures (office, first, efficient).
- `long.docx`: about 150,000 words in plain paragraphs and headings, about
  400 pages, to see that a long file still reads.

Made on 2026-11-17 with LibreOffice 24.2.7.2, from flat OpenDocument text
written by a script in the assistant's workspace, outside both
repositories. `tools/fixtures/generate.py` records what the desktop app's
own importer gives for each of them, in `fixtures/core/importers.json`.
