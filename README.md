# Rapid Serial Visualization Presentation Web Reader

![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19.3.1-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-8.3.8-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-5.1.0-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-1.65.1-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)
<br>
<img src="https://img.shields.io/badge/Chromium%20%7C%20Firefox%20%7C%20WebKit-4C4C4C?style=for-the-badge" alt="Browsers" align="middle">
<img src="https://img.shields.io/badge/No%20server%20%7C%20no%20tracking-2E7D32?style=for-the-badge" alt="No server, no tracking" align="middle">
<a href="https://github.com/QuiteNew/rsvp-web-reader/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/QuiteNew/rsvp-web-reader/release.yml?style=flat-square&amp;label=Release&amp;labelColor=222222" alt="Release status" align="middle"></a>
<a href="https://github.com/QuiteNew/rsvp-web-reader/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/QuiteNew/rsvp-web-reader/ci.yml?branch=main&amp;style=flat-square&amp;label=CI&amp;labelColor=222222" alt="CI status" align="middle"></a>

A speed-reading website that flashes transcript text one word at a time -
so your eyes never have to move across the page.

**Live site:** https://quitenew.github.io/rsvp-web-reader/

## About

RSVP Web Reader takes raw video transcripts, strips out timestamps, and flashes them word by word in a fixed spot
on screen, with each word's **Optimal Recognition Point** highlighted, the letter your eye naturally lands on to
recognize a word fastest. Instead of your eyes scanning back and forth across a page, the words come to you.

It is the website version of [RSVP Desktop Reader](https://github.com/QuiteNew/rsvp-desktop-reader), and everything
stays in your browser: there is no server, no account and no tracking, and nothing you paste is sent anywhere.
Your transcripts and settings are saved in the browser itself.

It was built one small, testable step at a time, as a port of the desktop app. The reading logic is the desktop
app's, rewritten in TypeScript and checked against **golden fixtures**: answers recorded from the desktop app's real
Python code, which the TypeScript has to match exactly. The layers are kept apart the same way too: the pure reading
logic in `src/core/` knows nothing about the page, and a lint rule stops it importing anything else.
<br>

For the background, the eye-movement physiology, the Optimal Viewing Position research behind the highlighted letter,
and what the studies actually say about reading this way (including where it helps and where it does not), see
[The science behind RSVP](https://github.com/QuiteNew/rsvp-desktop-reader/blob/main/docs/technique.md) in the desktop
project.

## Contents

- [Features](#features)
- [The RSVP Technique](#the-rsvp-technique)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Built With](#built-with)
- [Settings and Configuration](#settings-and-configuration)
- [Roadmap](#roadmap)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## Features

- Word-by-word RSVP display with real Optimal Recognition Point highlighting
- Adjustable reading speed (words per minute)
- Optional multi-word chunking: flash a few words at once instead of one at a
  time, sized by a fixed words-per-group count or an adaptive character width,
  set per transcript
- Auto-fit for wide flashes: the words shrink to fit the window (never below
  60% of your Word size, and the saved size is never changed), with a horizontal
  scrollbar, a centre button, and a `C` shortcut for anything still too wide
- Skip forward/backward by a configurable word count, with an optional
  auto-pause when you skip
- Pause, resume, restart, and stop (return to the edit box) controls
- A progress slider to jump anywhere in the transcript, with the time left and
  the percentage read, and bookmarks you can add, list, jump to and remove,
  by keyboard or mouse
- Organize transcripts into **Spaces**, categories you can create, rename,
  delete and switch between
- Transcript management: create, edit drafts, search by title, delete (with a
  confirmation step)
- Everything is saved automatically in your browser: reading position, pause
  state and in-progress drafts, without clicking anything
- Per-transcript font, highlight and background colours, and a Normalize button
  that tidies a transcript's line breaks (and puts the original back if you
  change your mind)
- Searchable settings: the Defaults tab has a live search that filters by a
  setting's name or, when you turn on the toggle beside it, its description
- Reading comfort settings that follow the desktop app: guide marks, a line of
  surrounding words, slowing down for long words, easing in at the start,
  and rewinding a few words when you resume
- Light / Dark / System theme support, with reading colors that automatically
  follow the active theme unless you've customized them
- Picks up where you left off: the last transcript reopens at launch, paused
  at the same word (a Settings switch, on by default)
- Keyboard friendly: Space pauses, the left and right arrows skip, Up and Down
  change the speed by 10 WPM, `R` restarts, `B` sets a bookmark, `C` centres a
  wide flash and Esc stops reading. The keys stay out of the way while you type
  and leave the browser's own keys alone
- Export everything (transcripts, Spaces and settings) to one file and import
  one, in the same file format the desktop app uses. Reading a desktop export is
  tested against the desktop app's own code. Opening a web export in the desktop
  app itself has not been tried yet
- A save that can't be read is kept aside in the browser before anything is
  saved over it, and the page tells you
- Asks the browser to keep your data instead of clearing it when space runs low

## The RSVP Technique

**RSVP (Rapid Serial Visual Presentation)** is a reading method where text
is shown one word at a time in a single fixed location, instead of being
laid out across a page. Normal reading requires your eyes to physically
jump from word to word (these jumps are called saccades) and often
backtrack. RSVP removes that entirely, since the words come to a
stationary point instead of your eyes having to find them.

The **Optimal Recognition Point (ORP)** is the specific letter within a
word where your eye naturally focuses to recognize it fastest, usually
just left of center, and shifting slightly depending on the word's length.
This site calculates that letter for every word and shows it in a distinct
color, keeping it aligned in the exact same screen position from word to
word, so your eye never has to search for where to look next.

## Installation

There is nothing to install. Open https://quitenew.github.io/rsvp-web-reader/
in a current desktop browser.

Your transcripts and settings live in that browser on that device, and a
browser can clear a site's data. Use **Export** in Settings, on the **Data** tab,
to keep a copy or to move your transcripts somewhere else.

Using the site with no network, and installing it as an app, are planned but
not built yet (see the [Roadmap](#roadmap)).

### Running it yourself

You need [Node.js](https://nodejs.org/) 24 and npm.

```bash
npm ci            # install the exact versions from package-lock.json
npm run dev       # start the dev server, then open the address it prints
npm run check     # lint, formatting, types, tests and a production build
```

The browser tests run the built site in Chromium, Firefox and WebKit. They
are separate from `npm run check` because they need the browsers, which are
a one-time download of a few hundred megabytes:

```bash
npx playwright install   # once, and again after Playwright is updated
npm run e2e              # builds the site, then runs the browser tests
```

The single steps behind `npm run check`:

| Command                | What it does                                 |
| ---------------------- | -------------------------------------------- |
| `npm run lint`         | ESLint, including the layer rule             |
| `npm run format:check` | Prettier, without changing files             |
| `npm run format`       | Prettier, fixing files                       |
| `npm run typecheck`    | TypeScript, strict                           |
| `npm test`             | Vitest, once                                 |
| `npm run test:watch`   | Vitest, re-running on every save             |
| `npm run build`        | Type-check, then build the site into `dist/` |
| `npm run preview`      | Serve `dist/` the way GitHub Pages will      |

## Usage

1. Click **+** in the sidebar to create a new transcript - give it a title
   and choose which Space it belongs to.
2. Click the transcript to open it, paste in your raw transcript text, and
   click **Start reading**.
3. Use the controls above the reader to pause, restart, jump with the
   progress slider, set bookmarks, or stop and go back to the text.
4. Adjust speed, word size, grouping and colors for the current transcript
   from the control band at the bottom of the page.
5. Open **Settings** for new-transcript defaults, theme, and your data.
<br>

Text comes in by pasting for now. Importing PDF, Word and other files is next
on the [Roadmap](#roadmap).

For what is done, what was checked and what is open, see [docs/STATUS.md](docs/STATUS.md).

## Project Structure

```
rsvp-web-reader/
├── .github/
│   ├── workflows/           # GitHub Actions: CI (checks, then the Pages deploy) and the release
│   └── dependabot.yml       # Monthly pull requests for new versions of the actions and the pinned packages
├── docs/
│   ├── STATUS.md            # What is done, what was checked, what was decided
│   ├── PORTING.md           # The recipe for porting one desktop module, and the Python/JavaScript differences
│   └── handoff/             # One spec per phase, and the progress notes of the phases built
├── e2e/                     # Playwright tests: the built site in Chromium, Firefox and WebKit
├── fixtures/
│   ├── core/                # Golden fixtures: what the desktop app's real code answered, as JSON
│   └── files/               # Word and PDF files to import in the tests, all invented text
├── reference/
│   └── desktop-design/      # Design notes copied from the desktop project
├── src/
│   ├── core/                # Pure TypeScript, no DOM, no React, no timers, no storage
│   │   ├── models.ts            # The shapes of saved data: Transcript, Bookmark, Library
│   │   ├── savedShapes.ts       # The shapes of saved data as they are written, with the desktop app's names
│   │   ├── storageFormat.ts     # Reading and writing saved data in the desktop app's shape
│   │   ├── bundle.ts            # Export files: building one and reading one
│   │   ├── library.ts           # The rules for changing a library: add, rename, delete, replace, merge
│   │   ├── settings.ts          # The app-wide settings: defaults, ranges and the rules for them
│   │   ├── settingsView.ts      # The Settings window's Defaults tab as data, and its form
│   │   ├── settingsSearch.ts    # Pure matching for the Settings search (name, keywords, description)
│   │   ├── parser.ts            # Strips timestamps from raw transcript text
│   │   ├── normalizer.ts        # Normalizes transcript text and can split long walls of text into paragraphs
│   │   ├── importers.ts         # Import rules without a browser: file types, names, subtitles, Markdown
│   │   ├── tokenizer.ts         # Splits cleaned text into words
│   │   ├── punctuation.ts       # Splits punctuation off each word and classifies the pause that follows it
│   │   ├── orp.ts               # Calculates each word's Optimal Recognition Point
│   │   ├── timing.ts            # Converts WPM into a per-word delay
│   │   ├── reader.ts            # ReaderSession: ties the above together
│   │   ├── speakers.ts          # Finds who is speaking in a labelled transcript
│   │   ├── fit.ts               # Fits a wide flash into the reading row
│   │   ├── scroll.ts            # Pure geometry for the reader's horizontal pan
│   │   ├── guideMarks.ts        # The numbers behind the guide marks and the surrounding-words line
│   │   ├── scrub.ts             # The numbers behind the progress slider
│   │   ├── bookmarkList.ts      # How a bookmark reads in the list
│   │   ├── shortcuts.ts         # The reading shortcuts, and when a key press is one
│   │   ├── theme.ts             # The two colour palettes and the rules that tie colours to the theme
│   │   ├── colors.ts            # Colour helpers (hex parsing, blending one colour toward another)
│   │   ├── reopen.ts            # Which transcript to open again at launch
│   │   ├── transcriptSort.ts    # The ways a Space's transcripts can be sorted
│   │   ├── wpmStep.ts           # The Up and Down keys' 10 WPM step
│   │   ├── appInfo.ts           # The app's name, version, license and project link
│   │   ├── pythonText.ts        # Python's rules for text (casefold, split, digits), rebuilt for JavaScript
│   │   └── python*Table.ts      # Unicode tables behind those rules, generated from Python 3.13
│   ├── engine/              # The reading loop: the clock and the timer, built on core/
│   │   ├── contract.ts          # What the engine promises to the UI
│   │   ├── readerEngine.ts      # The loop itself
│   │   └── browserClock.ts      # The real clock and tab visibility
│   ├── store/               # Saved data, behind small interfaces
│   │   ├── contract.ts          # What the store promises to the UI
│   │   ├── schema.ts            # The IndexedDB database, its stores and keys
│   │   ├── indexedDbLibrary.ts  # Saves and loads the library in IndexedDB
│   │   ├── libraryStore.ts      # The library in memory, saved on a throttle and flushed when a session ends
│   │   ├── settingsStore.ts     # The settings, kept in localStorage
│   │   ├── storageHealth.ts     # Asks the browser not to clear this site's data
│   │   └── memoryPersistence.ts # A stand-in that keeps data in memory, for tests
│   ├── importers/           # Reading a picked file into text, in the browser. Loaded only when a file is picked
│   │   ├── importFile.ts        # The way in: a File becomes a title and text, or a message
│   │   ├── importHtml.ts        # The readable text of a web page, with the browser's own HTML parser
│   │   ├── importDocx.ts        # The text of a Word file: body, tables, text boxes and footnotes
│   │   ├── unzip.ts             # A small zip reader on the browser's own DecompressionStream
│   │   ├── importPdf.ts         # The text of a PDF, with pdf.js
│   │   └── decodeText.ts        # A text file's bytes as text: UTF-8, else Windows-1252
│   ├── ui/                  # React components. The only layer that may import the others
│   │   ├── App.tsx              # The page: header, sidebar, reader, control band
│   │   ├── WordDisplay.tsx      # The flashing word, the guide marks and the surrounding words
│   │   ├── HorizontalScrollbar.tsx  # The scrollbar for a flash too wide to fit
│   │   ├── Scrubber.tsx         # The progress slider
│   │   ├── Sidebar.tsx          # The transcript list and the Space picker
│   │   ├── SettingsDialog.tsx   # Settings: Defaults, Appearance and Data
│   │   ├── ChunkingDialog.tsx   # The chunking window
│   │   ├── BookmarksDialog.tsx  # The bookmarks list
│   │   ├── DataSettings.tsx     # Export and import
│   │   └── fonts/               # Bundled Fredoka and Quicksand font files, with their licenses
│   └── testing/             # Helpers shared by tests: a fake clock, fixtures, store steps
├── tools/
│   └── fixtures/
│       └── generate.py      # Runs the desktop app's real code and writes the golden fixtures
├── index.html
├── vite.config.ts           # Also holds the base path GitHub Pages needs
├── playwright.config.ts
├── eslint.config.js         # Holds the layer rule
├── WEB_PORT_BRIEF.md        # The plan and the reasons behind it
├── RELEASING.md             # How a release is made, step by step
└── package.json
```

<br>

Each module has its test file next to it (`name.test.ts`). The README of each layer,
[src/core](src/core/README.md), [src/engine](src/engine/README.md), [src/store](src/store/README.md)
and [src/ui](src/ui/README.md), says what may import what. For the plan and the reasons, see
[WEB_PORT_BRIEF.md](WEB_PORT_BRIEF.md).

## Built With

- [TypeScript](https://www.typescriptlang.org/) - strict mode throughout
- [React](https://react.dev/) - the UI framework
- [Vite](https://vite.dev/) - the dev server and the production build
- [Vitest](https://vitest.dev/) with [Testing Library](https://testing-library.com/) - the unit and component tests
- [Playwright](https://playwright.dev/) - the browser tests, in Chromium, Firefox and WebKit
- [ESLint](https://eslint.org/) & [Prettier](https://prettier.io/) - the layer rule, and formatting
- [Fredoka](https://fonts.google.com/specimen/Fredoka) & [Quicksand](https://fonts.google.com/specimen/Quicksand) - bundled fonts
- [pdf.js](https://mozilla.github.io/pdf.js/) - reading the text of a PDF, loaded only when a PDF is picked

## Settings and Configuration

Settings are organized into three tabs, and changes take effect when you press **Apply**:

- **Defaults** - the speed, colours and word size new transcripts start with,
  and the reader settings that apply to every transcript straight away: guide
  marks, pacing, skipping, the surrounding-words line, reopening the last
  transcript at launch, and more. A live search filters them by name or by
  description. **Configure chunking** opens its own window
- **Appearance** - Light / Dark / System theme
- **Data** - export everything (transcripts, Spaces and settings) to a file, or
  import one, choosing whether to replace what's here or add to it. The version,
  the license and a link to the source are at the bottom

## Roadmap

- ~~Scaffold, checks and the deploy to GitHub Pages~~
- ~~Golden fixtures and the core reading pipeline~~
- ~~The reading session and the first screen~~
- ~~Saved data in the browser, with export and import~~
- ~~The reading experience: guide marks, surrounding words, progress slider, bookmarks, chunking, keyboard shortcuts, themes, fitting wide flashes~~
- Importing files (PDF, Word, HTML and subtitles), read in the browser only
- Comfort features: reading profiles, letter spacing, a dyslexia-friendly font, bold word starts, speaker cues
- Offline use and installing as an app, accessibility, and a help page

## License

Released under the MIT License. See [LICENSE](LICENSE) for the full text.

The bundled Fredoka and Quicksand fonts are each released under
the SIL Open Font License, not the MIT license. A copy of each font's license
sits next to the font files in [src/ui/fonts](src/ui/fonts), and the fonts are
credited under Acknowledgments. pdf.js is released by Mozilla under the Apache
License 2.0, and its license notice is kept at the top of its files. The MIT
license covers the project's own code.

## Acknowledgments

- [RSVP Desktop Reader](https://github.com/QuiteNew/rsvp-desktop-reader) - the app this one is ported from. Its code is
  the specification, and its tests are replayed here
- [Fredoka](https://fonts.google.com/specimen/Fredoka), by Milena Brandão and
  Ben Nathan (Hafontia), licensed under the
  [SIL Open Font License](https://openfontlicense.org/). See
  [OFL-Fredoka.txt](src/ui/fonts/OFL-Fredoka.txt)
- [Quicksand](https://fonts.google.com/specimen/Quicksand), by Andrew
  Paglinawan, licensed under the SIL Open Font License. See
  [OFL-Quicksand.txt](src/ui/fonts/OFL-Quicksand.txt)
- [React](https://react.dev/) by Meta and its contributors
