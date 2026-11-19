# Test files

Files to import, for the tests of `src/importers` and, later, the browser
tests. All of the text in them is invented for the tests.

- `rich.docx`: a heading, paragraphs, a table, a text box, a list, a
  footnote, a header and a footer, with curly quotes and words that PDFs
  turn into ligatures (office, first, efficient).
- `long.docx`: about 150,000 words in plain paragraphs and headings, about
  400 pages, to see that a long file still reads.
- `rich.pdf` and `long.pdf`: the same two documents as PDFs. `long.pdf` is
  the biggest file here (750 KB).
- `locked-rc4-128.pdf`, `locked-aes-128.pdf`, `locked-aes-256.pdf`:
  `rich.pdf` locked against printing and editing only, with the three kinds
  of encryption PDFs use. They open with no password, as on the desktop.
- `password-aes-256.pdf`: `rich.pdf` with a real password to open
  ("secret"), which the app has to refuse.
- `scanned.pdf`: pictures of the pages of `rich.pdf` at 150 dpi, with no
  text in it, which the app has to report as having no readable text.

Made on 2026-11-17 with LibreOffice 24.2.7.2, from flat OpenDocument text
written by a script in the assistant's workspace, outside both
repositories. The locked PDFs were encrypted with pypdf 6.19.0 (owner
password "owner"), and the scanned one was made with pdftoppm and
img2pdf. `tools/fixtures/generate.py` records what the desktop app's
own importer gives for each of them, in `fixtures/core/importers.json`.
