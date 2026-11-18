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
| 5. Build                     | Planned, below. Nothing built yet        |

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
