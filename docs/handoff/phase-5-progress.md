# Phase 5 progress: importing files

Where phase 5 stands, so the work can carry on after a break. The plan is
[phase-5.md](phase-5.md). The research and tests are done, and the owner
decided on 2026-11-18 (step 4). Nothing is installed yet: the build plan is
step 5, one small commit at a time.

The owner confirmed phase 4 on 2026-11-17 ("It's good").

| Step                         | State                                    |
| ---------------------------- | ---------------------------------------- |
| 1. What the desktop app does | Done, below                              |
| 2. Research, with facts      | Done, below                              |
| 3. Test on real files        | Done on made test files in Chrome, below |
| 4. The owner decides         | Done on 2026-11-18, below                |
| 5. Build                     | Steps 2 to 5 of the plan done, below     |

## Step 1: what the desktop app does

Read from `core/importers.py`, `tests/test_importers.py`,
`tests/test_importer_errors.py`, `gui/app.py`, `docs/usage.md` and
`docs/faq.md` at desktop commit `8112ff1` (v4.1.1).

Extensions: `.txt`, `.srt`, `.vtt`, `.md`, `.markdown`, `.html`, `.htm`,
`.docx`, `.pdf`. The brief's list leaves out `.vtt` and Markdown; the owner
is asked whether they are wanted.

Every importer gives raw text, then `clean_transcript_keep_lines()` tidies
it (timestamps out, ligatures repaired, lines kept). That is already ported
as `cleanTranscriptKeepLines` in `src/core/parser.ts`. Empty text after that
is an error: "NAME didn't contain any readable text." An unknown extension
gives "Unsupported file type: .ext".

Per format:

- **Text** (`.txt`): bytes read as UTF-8 with a BOM stripped, and if that
  fails, as latin-1, which never fails. No library.
- **Subtitles** (`.srt`): line by line, drops blank lines, lines that are
  only digits and lines with `-->`, strips `<...>` tags. No library.
- **Subtitles** (`.vtt`): block by block, drops the `WEBVTT` header, `NOTE`,
  `STYLE` and `REGION` blocks, cue ids and timing lines, and blocks with no
  timing line; strips inline tags. No library.
- **Markdown**: a line-based pass with regular expressions (headings, lists,
  quotes, emphasis, links, code fences kept as text). No library.
- **HTML**: lxml. Drops `script`, `style`, `noscript`, `head`, `template`;
  block elements and `<br>` start new lines; whitespace inside a block is
  collapsed. The encoding comes from the page's own `<meta charset>`.
  "Couldn't open NAME as HTML:" plus lxml's message when the parser fails.
- **Word** (`.docx`): python-docx, `document.paragraphs` only, blank ones
  dropped. That means the text of **tables, footnotes, endnotes, headers,
  footers and text boxes is not read**. "Couldn't open NAME as a Word
  document:" plus the library's message.
- **PDF**: pypdf, `extract_text()` page by page, a page that fails is
  skipped. Encrypted files are tried with an empty password, which opens
  the ones locked only against printing or editing (RC4-128, AES-128 and
  AES-256 are all tested). Otherwise "NAME is password-protected, so it
  can't be imported." "Couldn't open NAME as a PDF:" plus pypdf's message.
  A scanned PDF has no text layer and ends as "didn't contain any readable
  text". There is no OCR.

The app: importing is one blocking call with an "Importing" notice. Over
30,000 words (counted with the tokenizer) the create dialog shows a
heads-up that very large transcripts have crashed the app; it is a
warning, not a block, and the number is a guess, not measured. The title
is the file name without its extension. The text lands as a draft in the
edit box and does not start reading. Errors show in a "Couldn't add that
file" message.

## Step 2: research, first pass

Checked on 2026-11-17. Versions, licences and dates are from the npm
registry (`npm view`), nothing was installed. "Package size" is the size of
the npm package, not what the page would download; the real download size
is measured in step 3.

Formats that need no library at all, in any option:

- `.txt`, `.srt`, `.vtt`, Markdown: plain string work, ported exactly with
  golden fixtures like the rest of `src/core`.
- HTML: the browser has its own HTML parser (`DOMParser`), so no library is
  needed. It is the real HTML5 parser, so a badly broken page may be read
  slightly differently from lxml. To compare in step 3.
- Reading bytes: `File.arrayBuffer()` and `TextDecoder`, in every browser.

A difference found, for the owner to decide: the browser's `latin1`
decoder is really Windows-1252 (the Encoding standard says so; checked in
Node 22). For bytes 0x80 to 0x9F, Windows-1252 gives curly quotes, the euro
sign and dashes, where Python's latin-1 gives invisible control
characters. For an old Windows text file, Windows-1252 is the better
reading. Recommendation: use it and write the difference down.

Word (`.docx` is a zip of XML files):

| Option                                  | Version | Licence      | Package | Notes                                                                                              |
| --------------------------------------- | ------- | ------------ | ------- | -------------------------------------------------------------------------------------------------- |
| mammoth                                 | 1.13.0  | BSD-2-Clause | 1.7 MB  | Turns a docx into HTML or plain text. Widely used. What it does with footnotes and tables: to test |
| Own code: unzip + `DOMParser`           | none    | ours         | none    | Read `word/document.xml` ourselves. Unzipping with the browser's own `DecompressionStream`         |
| Own code: fflate to unzip + `DOMParser` | 0.8.3   | MIT          | 0.8 MB  | Same, with a small unzip library instead of the browser's                                          |

The browser's `DecompressionStream('deflate-raw')` is in Chrome and Edge
103, Firefox 113 and Safari 16.4 (caniuse, web.dev). Firefox and Safari are
strict about bytes after the end of the data, which a zip entry should not
have, but to test.

PDF:

| Option           | Version | Licence           | Package | Notes                                                                                                        |
| ---------------- | ------- | ----------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| pdfjs-dist       | 6.5.438 | Apache-2.0        | 38 MB   | Mozilla's pdf.js, the PDF reader inside Firefox. Has a Web Worker. Package is big; the page downloads a part |
| unpdf            | 2.2.1   | MIT               | 3.1 MB  | A wrapper around a build of pdf.js, for text extraction                                                      |
| @embedpdf/pdfium | 2.15.1  | MIT               | 7.6 MB  | Google's PDFium (Chrome's PDF engine) compiled to WebAssembly                                                |
| mupdf            | 1.28.6  | AGPL-3.0-or-later | 14 MB   | Ruled out: AGPL would bind the whole site's code, which is MIT                                               |

Scanned PDFs: none of the above reads text out of a picture. That needs
OCR. tesseract.js (7.0.0, Apache-2.0) does OCR in the browser, but it needs
language data of several megabytes that would have to ship with the site,
since nothing may be fetched from elsewhere, and it is slow. Listed so the
owner can say no to it plainly.

Not considered: anything that sends a file to a server or a service.
officeparser (8.8.0, MIT, 38 MB) reads many formats but is built for
Node first; looked at, not a candidate unless the owner wants more formats.

## Step 3: the tests

Done on 2026-11-17 in the workspace, outside both repositories, in Chrome
(system Chrome through Playwright 1.65.1). Firefox and Safari could not be
run there; a short check on the owner's machine comes with the build.

### The test files

Made by a script with the desktop's own tools, all invented text: a Word
file and a PDF from the same document with a heading, a table, a footnote,
a header, a footer, a text box, a list, curly quotes, a time inside a
sentence and words that PDFs turn into ligatures (office, first,
efficient). The same PDF locked only against printing or editing with
RC4-128, AES-128 and AES-256, and once with a real password. A scanned
PDF (pictures of the pages, no text layer). A 150,000-word Word file and
PDF (about 400 pages). A UTF-8 file with a BOM, an old Windows-1252 text
file, an `.srt`, a `.vtt`, a Markdown file and a saved web page with a
script, a style, a nav, a comment, `noscript`, `template` and entities.

The desktop's expected text came from its own `import_file`, run with
`-B` from outside its repository, in a fresh environment with its pinned
versions (pypdf 6.19.0, python-docx 1.2.0, lxml 6.1.3, cryptography
50.0.2). The desktop repository was checked unchanged afterwards,
ignored files included.

Each option's text went through our ported `cleanTranscriptKeepLines`,
then was compared with the desktop's.

### Results

PDF, all three options against the desktop:

- Same text as the desktop, character for character, on every PDF: the
  plain one, the three locked ones, the 400-page one.
- The password one: all three refuse it, as the desktop does.
- The scanned one: all three find no text, as the desktop does.
- No request to any other address, for any option.
- 400-page PDF: about 0.8 s for each.

These PDFs come from LibreOffice and are simple. Real PDFs (several
columns, odd fonts, old scans with a text layer) are where engines differ,
so the owner's own files are the next test if he has some.

| PDF option | Download when used (gzip)       | Notes                                                                                                   |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| pdf.js     | about 510 KB (132 + 378 worker) | Mozilla, Apache-2.0. Reads in its own Web Worker. Opened with `isEvalSupported: false`                  |
| unpdf      | about 500 KB                    | The same pdf.js inside, but without its worker, so the page froze for 0.9 s on the long PDF. No gain    |
| PDFium     | about 2.2 MB (37 + 2,164 wasm)  | Chrome's engine. Fetches its wasm from a CDN by default, so we would ship it ourselves. Raw C functions |

Word:

| Word option           | Download when used (gzip) | Text                                                                       |
| --------------------- | ------------------------- | -------------------------------------------------------------------------- |
| Own, like the desktop | a few KB, no library      | Same as the desktop, character for character: body paragraphs only         |
| Own, everything       | a few KB, no library      | Also tables, the text box and footnotes (at the end). Not headers, footers |
| mammoth               | about 94 KB               | Also tables and the text box, but not footnotes. Blank lines between lines |

"Own" is about 100 lines: a small zip reader on the browser's
`DecompressionStream`, then `DOMParser` on `word/document.xml` (and
`word/footnotes.xml`). The long Word file took about 0.25 s with each
option.

The rest:

- Saved web page: the port of `import_html` on the browser's `DOMParser`
  gave the desktop's text exactly.
- UTF-8 with a BOM: exact.
- Old Windows file: the desktop's text has invisible control characters
  where the curly quotes were (checked: `\x93` and `\x94`). Windows-1252
  gives the real quotes. That is the only difference.
- `.srt`, `.vtt` and Markdown were not run in the browser yet: they are
  plain string work, ported with golden fixtures in the build step.

What was not measured well: how long the page freezes. The browser's
long-task numbers came out uneven, so they are not used here.

A correction to what was written here before: not everything can be read
in a Web Worker. `DOMParser` does not exist in a worker (checked on
2026-11-18 in Chrome: `typeof DOMParser` is `"undefined"` there, while
`DecompressionStream` and `TextDecoder` are functions). So HTML and Word,
which need `DOMParser`, are read on the page itself. That is about 0.25 s
for the 150,000-word Word file. PDF is read by pdf.js in its own worker.

## Step 4: the owner's decisions

Asked on 2026-11-17, answered on 2026-11-18. The owner took every
recommendation:

| Question                  | Decision                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| PDF                       | pdf.js (`pdfjs-dist`), version 6.5.438, still the newest on 2026-11-18                                      |
| Word                      | Our own code, no library. It reads the body and also tables, text boxes and footnotes. A written difference |
| `.vtt` and Markdown       | Yes, both. The web app opens the same file types as the desktop                                             |
| Old text files, not UTF-8 | Read as Windows-1252. Curly quotes and dashes come out right, where the desktop gives control characters    |
| Real files to test with   | Asked again with the build plan                                                                             |

The questions as they were asked:

1. PDF: pdf.js (recommended: same text as the desktop on every test, a
   quarter of PDFium's size, its own worker, made by Mozilla).
2. Word: our own code, no library (recommended). And: only the body
   paragraphs like the desktop, or also tables, text boxes and footnotes?
   Recommended: also those, since the desktop drops that text without a
   word. It would be a written difference from the desktop.
3. `.vtt` and Markdown too? Recommended: yes, no library needed.
4. Old text files read as Windows-1252? Recommended: yes.
5. Real PDFs or Word files to test with, if the owner has some.

## Step 5: the build plan

One small commit at a time, each checked before the next. The order puts
the plain string work first, because it needs nothing new, and pdf.js
last but one, because it is the only new dependency.

1. **Docs.** These decisions, in this file and in STATUS.md.
2. **Fixtures.** The fixture script records the desktop importers' output
   for `.srt`, `.vtt`, Markdown, HTML and text decoding, and their error
   messages, run with `-B` against the desktop's real code.
3. **The text formats in core.** `.srt`, `.vtt` and Markdown are pure
   string functions in `src/core`, checked against those fixtures, with
   the matching desktop tests from `test_importers.py` ported.
4. **The seam.** A new layer, `src/importers/`, that may import from
   `src/core` only, with the ESLint rule for it. One function takes a
   `File` and gives back a title and the text, or a plain error message.
   It picks the reader by extension, decodes text files (UTF-8 with a
   BOM stripped, then Windows-1252) and gives the desktop's messages for
   an unknown type and for a file with no readable text.
5. **HTML.** The port of `import_html` on `DOMParser`.
6. **Word.** A small zip reader on `DecompressionStream`, then
   `DOMParser` on the document and the footnotes. Body, tables, text
   boxes and footnotes, in that order. Where it differs from the desktop
   it is written down, and the body alone is checked against it.
7. **PDF.** `pdfjs-dist` installed with an exact version. Its worker file
   is shipped with the site, nothing is fetched from elsewhere. Opened
   with an empty password first, as the desktop does, and with
   `isEvalSupported: false`.
8. **The screen.** An import button where a transcript is created. The
   importer code loads only when a file is picked (`import()`), with an
   "Importing" notice, the desktop's heads-up above 30,000 words, and its
   "Couldn't add that file" message. The text lands as a draft and does
   not start reading, as on the desktop.
9. **Browser tests.** Each test file in Chromium, Firefox and WebKit, no
   request to another address while importing, and the reader's own
   download no bigger than before.

Then the owner tries it, ideally with real files, and confirms.

What stays as on the desktop and is said plainly in the app and the
README: a scanned PDF has no text to read without OCR, so it gives "didn't
contain any readable text", and a PDF that needs a real password is
refused.

### Build step 2: the fixtures (2026-11-18)

`fixtures/core/importers.json`, written by `tools/fixtures/generate.py`
from the desktop's `core/importers.py` at `8112ff1`, with lxml 6.1.3
(libxml2 2.14.6). Run twice with the same output, and the desktop clone
was unchanged afterwards, ignored files included. The other fixture files
came out byte for byte as before.

What is in it, each as the file's bytes (one character per byte) or the
text, and the desktop's answer, `{"text": ...}` or `{"error": message}`:

- `read_text_with_fallback`: 38 byte strings, through `import_txt`. UTF-8,
  byte order marks, Latin-1, Windows-1252, every byte, broken UTF-8.
- `import_srt`, `import_vtt`, `import_md`: their own awkward inputs plus
  the shared `TEXTS`. The argument is the text the desktop worked on, after
  decoding.
- `strip_inline_md`: every line of those, called directly.
- `import_html`: 35 pages as bytes, the encoding cases included.
- `import_file`: 30 files by name, for picking the importer by extension
  and for the error messages.
- `desktop_tests`: the calls 50 of the desktop's importer tests make, with
  the files' bytes, for the text and HTML importers. Word and PDF come with
  their own steps. One test is left out because it changes the desktop's
  code while it runs (it makes lxml fail on purpose).

Found while recording, for the owner. These are in the desktop app, not
fixed there, and not decided for the web yet:

- **HTML with no declared character set comes out garbled.** A UTF-8 page
  without a `<meta charset>` is read as Latin-1, so "Café" becomes
  "CafÃ©". Pages saved by a browser usually declare one, so the common
  case is fine. A page with an XML declaration that names ISO-8859-1 gives
  "Caf�". Decided at the HTML step (step 5): the web app reads such a
  page as UTF-8 when it is valid UTF-8.
- A file named only `.txt` is refused as "Unsupported file type: .txt",
  because to Python a name that starts with a dot has no extension. Harmless,
  and the port copies it.

### Build step 3: the text formats in core (2026-11-18)

`src/core/importers.ts` ports `import_srt`, `import_vtt`, `import_md` and
`_strip_inline_md`. They take the decoded text, not a path: reading and
decoding the file belongs to `src/importers/` (step 4).

- `pySplitlines()` in `pythonText.ts` is Python's `str.splitlines()`. It
  also ends a line at `\v`, `\f`, U+001C to U+001E and U+0085, which
  JavaScript does not. Checked character by character against Python, and
  on 164 whole texts.
- Python's `.` became `[^\n]`, and `\s`, `\w` and `str.isdigit()` use the
  Python lists, as everywhere in core.
- Checked against every case in `importers.json` and the 22 desktop tests
  that call these importers.

The fixtures got more cases in this step, for the places where Python and
JavaScript part ways: `strip()` against `trim()`, `.` across U+2028, and
`\s` and `\w` on characters outside ASCII. Each of these changes to the port
was tried on purpose and made a test fail: `split("\n")` for
`pySplitlines()`, `.` for `[^\n]` in each of the six inline patterns,
JavaScript's `\s` and `\w`, `trim()` for `pyStrip()` in each of the five
places, and an ASCII-only digit test.

The escapes in the step 2 additions to `generate.py` had come out as the
characters themselves, some of them invisible (a no-break space, a line
separator). They are written as `\u` escapes again. The fixture output is
the same either way, checked.

### Build step 4: the seam (2026-11-18)

A new layer, `src/importers/`, for the part of importing that needs the
browser. It may import `src/core` only, and no React. The ESLint layer rule
has it, and core, engine and store may not import from it. The rule now
only looks at paths that leave a folder (`../`) or name `src/`, because
`src/core/importers.ts` has the layer's name and its own test imports it.
Each of the five wrong imports was tried and refused.

- `importFile(file)` is the way in. It picks the importer by extension
  before reading the file, as the desktop does, reads the bytes, and ends
  with `finishImport()` from core. It gives `{kind: 'text', title, text}`
  or `{kind: 'error', message}`. The title is the file name without its
  extension, as the desktop offers.
- `decodeText()` reads UTF-8 with a byte order mark dropped, and
  Windows-1252 when the bytes are not UTF-8.
- In core: `SUPPORTED_EXTENSIONS`, `fileSuffix()` and `fileStem()` (Python's
  `Path.suffix` and `Path.stem`), the lower-cased suffix, the "Unsupported
  file type" message and `finishImport()`, with fixtures for the file name
  rules.
- One message of the web app's own: "Couldn't read NAME." when the browser
  cannot read the file it was given. The desktop has none for that.
- `.html`, `.htm`, `.docx` and `.pdf` are refused as an unsupported type
  until their steps. Nothing offers importing yet, so nobody meets that.

Checked: every `import_file` case for the formats built so far, every
`read_text_with_fallback` case, and the desktop tests that call
`import_txt` or `import_file`. Where the desktop read Latin-1, the test
expects the same text with Windows-1252's characters for 0x80 to 0x9F,
from a table written in the test, not asked of the browser. Breaking the
decoder on purpose (keeping the byte order mark, not failing on bad UTF-8,
true Latin-1) and a naive suffix rule each made tests fail. Using
`toLowerCase()` for the suffix instead of `pyLower()` made none fail: the
two agree on every name tried, so the Python one is kept for safety, not
because a case needs it.

The reader's own download is the same file as before, byte for byte
(nothing imports the new layer yet).

### Build step 5: HTML (2026-11-18)

`src/importers/importHtml.ts` ports `import_html` on the browser's own
`DOMParser`, so no library is added. Same steps as the desktop: drop
`script`, `style`, `noscript`, `head` and `template`, start a line at `<br>`
and at the edges of block elements, and squeeze the spaces in each line
with Python's list of spaces.

The owner's choice on the character set (2026-11-18: "We could go with
both, implement whichever is easier"): reading a page that names no
encoding like a text file was the simpler one, because `decodeText()`
already does it. So: a byte order mark first, then a `<meta charset>` or
`<meta http-equiv>` tag, else UTF-8 when the bytes are valid UTF-8, else
Windows-1252. The desktop reads that last kind as Latin-1.

The importer tests now run in jsdom (a third Vitest group, `importers`),
because Node has no `DOMParser`.

Compared with the desktop on 67 pages, the 13 recorded desktop tests that
call `import_html`, and the saved web page from step 3. Everything matched
except eight pages, all listed in `importHtml.test.ts`:

- Four about the character set, all from the choice above: UTF-8 and
  Windows-1252 pages that name no encoding, a page whose encoding is named
  only in an XML declaration (a browser does not look there either; the
  desktop gave "Caf�"), and a page that names an encoding nobody knows.
- One from the parser: a `<noscript>` before the page's body, with plain
  text in it. The browser's HTML parser moves that text out into the body,
  so it is kept. lxml keeps it inside, and it is dropped. Saved pages
  usually put `<style>` or `<link>` in such a `<noscript>`, which stay
  inside.
- Three where the desktop crashes (see below), and the web app reads the
  text.

The same pages were also run in real Chrome, and gave exactly the same
answers as jsdom. Firefox and Safari come with the browser tests in step 9.

Broken on purpose, to see a test fail: keeping the text after a dropped
element, JavaScript's whitespace, keeping `noscript`, no `<meta>` lookup, a
UTF-16 label taken as UTF-16, and leaving out `dd`, `figcaption`, `th`,
`hr`, `nav` or `h6` from the block list. Each failed a test. Leaving out
`tfoot` failed none: inside a table the rows and cells already start lines,
and a browser moves text that is loose in a table out of it, so it cannot
make a difference.

Found in the desktop app, for the owner. Not fixed there. The port copies
the first one, as PORTING.md says, until the desktop changes:

- **Text right after a dropped element is lost.** lxml counts the text
  after an element as part of it, so removing a `<script>`, `<style>`,
  `<noscript>` or `<template>` removes that text too. `<p>a<script>x</script>b</p>`
  gives "a". A page whose body starts with a `<script>` followed by loose
  text loses that text entirely.
- **A control character inside a block crashes the import.** lxml refuses a
  form feed, a vertical tab or U+001C to U+001F when the desktop adds its
  line marks, and raises an error the desktop does not catch, so no message
  is shown (the "Importing" notice is likely left open). A form feed in a
  `<p>` is enough. The web app has no such limit and reads the text, with
  those characters as spaces, as Python counts them.

The desktop's "Couldn't open NAME as HTML" message cannot happen in the
web app: the browser's parser reads anything.
