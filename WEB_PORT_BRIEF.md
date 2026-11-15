# Web port brief: from RSVP Desktop Reader to a website

This is the starting brief for turning RSVP Desktop Reader, a Python desktop
app, into a website that does the same job. Read all of it before writing any
code or proposing any change. It says what exists, what was decided, how the
work should be done, and what is still open.

## 1. What this is

RSVP Desktop Reader is an offline speed-reading app. It takes a transcript,
strips timestamps, and flashes it one word at a time in a fixed spot, with the
Optimal Recognition Point (ORP) letter of each word highlighted so the eye
never has to move. It is written in Python 3.13 with CustomTkinter, around 5,700
lines of logic in `core/`, a GUI in `gui/`, and a large test suite (over 3,000
tests, a hundred test files) that drives the real windows. Its version is 4.1.1.

The website is a sibling project: a new repository, a new codebase, the same
idea. The desktop app is not being replaced or changed. It stays the reference
for what correct behaviour is.

The desktop repository is `QuiteNew/rsvp-desktop-reader`. It is reference
material only, and it is read-only for you. Section 7 says how to reach it and
what you may never do to it.

## 2. Ground rules for working with the owner

These come from how the desktop project was built, and they stay.

- **Slow and steady, step by step, no vibecoding.** Act as a senior developer
  guiding the process, not as a code generator. Explain the reasoning before a
  non-trivial change. The owner knows Python from university and is learning the
  web stack as this goes, so say why, not only what.
- **Whole files only.** When a file changes, give the entire updated file, ready
  to paste over the old one. Never a diff, a snippet, or "add this line here".
- **Never write, edit, create, move or delete anything in the owner's folders**,
  the desktop one or the new repository's. They are read-only (the desktop
  repository is the strictest case, see section 7). Show the file in
  the chat, with its path, and the owner saves it. If you are not certain of a
  file's current content, read it, or ask for it to be pasted. Do not assume you
  remember it.
- **Give a checksum for every file**, with the Git Bash command that checks it.
  The owner's editor drops the final newline, so the command is
  `git show :PATH | sed -e '$a\' | md5sum`, with the expected value next to it.
  Also give `git add`, `git status --short` and `git diff --cached --numstat`
  with what each should show.
- **One small commit at a time.** Give the title and the description
  separately. Humanize them, and the code comments: plain words, no em dashes,
  no marketing tone. No `Co-Authored-By` or session lines. The owner commits and
  pushes by hand.
- **Verify before claiming.** Do not present a guess about a bug as a fix. Say
  plainly when something is unconfirmed. Do not say something works until it has
  been run, and say what was and was not run.
- **Check the current state of the web.** Library versions, browser support and
  APIs change. Look up current versions and support before choosing or using
  them. Do not rely on memory for them.

## 3. The stack decision

**TypeScript (strict) with Vite and React, running entirely in the browser.**
No server, no database, no accounts.

Why this and not something else:

- **The product is offline by nature.** The desktop app promises that nothing
  leaves the machine. A static site that keeps everything in the browser keeps
  that promise, costs nothing to host, and needs no privacy policy beyond one
  sentence. It can also work offline as an installed app (a PWA).
- **The hard part is timing and display, which is browser work.** Flashing words
  at a fixed spot, fonts, colours, themes and keyboard shortcuts are what
  browsers do best.
- **Python in the browser (Pyodide) was rejected.** It would let the existing
  `core/` run unchanged, but it adds a download of several megabytes, a slow
  first start, two languages in one app, and hard-to-debug libraries (`pypdf` and
  `cryptography`). The core is small, pure and well tested, so porting it is
  cheaper than carrying a Python runtime.
- **A Python backend (FastAPI or similar) was rejected.** It would send people's
  transcripts to a server, which is the opposite of the product, and it adds
  hosting, cost and security work for no gain. That includes reading PDF and
  Word files: file parsing stays in the browser too.
- **React over Svelte:** both would work. React has the largest set of learning
  material and answers, the most mature testing tools, and the owner will need
  to look things up. If the owner prefers Svelte, that is fine, but decide it
  before phase 0 and not afterwards.

Tooling (check each against the current version when scaffolding):

| Need | Choice |
| --- | --- |
| Language | TypeScript, `strict` on, no `any` without a comment saying why |
| Build and dev server | Vite |
| UI | React, function components, no UI framework at first, plain CSS (CSS modules) |
| Unit and component tests | Vitest, with Testing Library for components |
| End-to-end tests | Playwright against the built site, Chromium, Firefox and WebKit |
| Lint and format | ESLint (with the boundary rule below) and Prettier |
| Saved data | IndexedDB (via the `idb` wrapper) for transcripts, `localStorage` for small settings |
| File import (PDF, Word, HTML and others) | Not decided. Decided in phase 5, and always in the browser. See below. |
| Offline install | a PWA service worker (`vite-plugin-pwa`) |
| Hosting | GitHub Pages, deployed by a GitHub Actions workflow |
| Package manager | npm, on the current Node LTS |

### File import: client-side only, decided in phase 5

The owner has not chosen how PDF, Word and other files will be read, and wants
that decision made when phase 5 starts, not before. Until then:

- **Do not choose, install, import or design around any file-parsing library.**
  Text comes in by pasting. Phases 0 to 4 must work without any import code.
- **Whatever is chosen later must run in the browser.** No server, no upload, no
  third-party service, and no network needed. An option that sends a file
  anywhere is ruled out, however good it is.
- **When phase 5 starts, research and test before deciding.** For each format
  the owner wants (PDF, Word, HTML, SRT and plain text, and any others), list the
  realistic client-side options. Look up their current versions, licences,
  download size and browser support. Try them on real files: a PDF encrypted only
  to block printing or editing (the desktop app opens these), a scanned PDF with
  no text layer, a Word file with tables and footnotes, and a very long file.
  Then give the owner a short comparison and a recommendation, and let the owner
  decide. Say plainly what each option cannot do, for example reading text out of
  a scanned page.
- **Keep the seam small, so the choice can change.** An importer takes a file and
  gives back plain text, or an error with a plain message. Everything after that
  is the same as pasted text.
- **Load importer code only when someone picks a file**, so the reader itself
  stays small and starts fast.

## 4. Architecture: keep the same strict split

The desktop app has one rule that made it testable: `core/` never imports
anything from `gui/`. Keep that rule, in the same shape.

```
src/
  core/    pure TypeScript. No DOM, no React, no timers, no storage.
  engine/  the reading loop: timers and the clock, built on core/.
  store/   saved data: IndexedDB and localStorage, behind small interfaces.
  ui/      React components. Imports from the layers above, never the reverse.
```

- Enforce the rule with ESLint (`no-restricted-imports`), so a wrong import
  fails the lint and CI instead of depending on anyone remembering.
- `core/` takes everything it needs as arguments and returns plain data. The
  desktop code already works this way (the caller hands in a function that
  measures text, for example), so the port is mostly translation.
- The reading loop is a plain class that owns the timer and tells the UI when
  the word changes. Do not drive the words through React state updates inside
  render. Connect the class to React with `useSyncExternalStore`.

## 5. How to port: the Python code is the specification

The desktop `core/` is the specification and its tests are the proof. Do not
rewrite the behaviour from the description. Port it, and prove the port.

1. **Read the Python module and its tests first.** The tests under
   `tests/test_<module>.py` say what the module must do, including the odd edge
   cases that were found the hard way.
2. **Generate golden fixtures from the Python code.** Write a small script
   (in the new repository, run by the owner with Python against a clone of the
   desktop repository, and with `python -B` so nothing is written into it) that
   feeds many inputs through the real Python functions and writes input and
   output pairs to JSON files in the new repository. Include awkward
   input: empty text, only punctuation, emoji, Cyrillic and Greek, very long
   words, Windows line endings, and a transcript with speaker labels.
3. **Port the module to TypeScript, then run the TypeScript against the same
   fixtures.** A port is done only when it matches every fixture.
4. **Port the module's own tests too**, as Vitest tests, for behaviour a fixture
   does not show.
5. **Break it on purpose** in a few small ways, as the desktop project did, and
   check that a test fails each time. A test that cannot fail proves nothing.

Two traps are specific to this port:

- **Characters.** Python counts code points. JavaScript strings count UTF-16
  units, so an emoji is two. Anywhere the Python code counts, slices or
  measures characters (ORP position, bold ranges, speaker name limits), use code
  points (`Array.from`, or `Intl.Segmenter` where the rule is about letters), and
  put an emoji case in the fixtures.
- **Timing.** `setTimeout` is not exact and the browser slows timers in hidden
  tabs. Schedule from `performance.now()` and correct for drift. Pause when the
  tab is hidden. Never trust the timer to be on time, only to be about on time.

## 6. What carries over, and what changes

Desktop module in `core/` or `gui/`, and what to do with it:

| Desktop | On the web |
| --- | --- |
| `parser`, `tokenizer`, `punctuation`, `orp`, `timing`, `reader` | Port exactly, with golden fixtures. This is the heart. |
| `normalizer` | Port, with fixtures. |
| `speakers` | Port, with fixtures. |
| `bold_starts` | Port the rules (what counts as a word, the length curve). |
| `bold_spans`, `rich_copy`, `gui/rich_clipboard` | Not needed in this form. Bold is a styled run in the DOM, and copying with bold uses the browser clipboard with an HTML part. |
| `chime`, `gui/chime_player` | Rebuild with the Web Audio API, so the chimes play on every system, not only Windows. Browsers need a user click before sound, so start audio from the first press of Play. |
| `letter_spacing` | Probably not needed. CSS `letter-spacing` does what the thin-space plan did by hand. Confirm by eye before dropping it. |
| `font_choice` | Bundle the same fonts as web fonts (Fredoka, Quicksand, OpenDyslexic, all SIL OFL, with their licence texts). The switch can apply at once and needs no restart. |
| `scroll`, `text_fit` | Probably not needed. CSS overflow, sizing and `text-overflow: ellipsis` cover them. Confirm before dropping. |
| `profiles`, `profile_apply` | Port, with fixtures. |
| `reopen`, `transcript_sort`, `wpm_step` | Port. |
| `window_placement` | Drop. There is no window to place. |
| `settings_store`, `transcript_store`, `storage` | Rebuild on IndexedDB and `localStorage`. Keep the same behaviour: save on a throttle, flush when a session ends, keep a copy of data that cannot be read before saving over it. |
| `data_bundle` | Rebuild as export to and import from a file. Aim to read the desktop app's bundle, so a user can move their transcripts across. Read `core/data_bundle.py` and `docs/data.md`, then confirm the format before promising it. |
| `importers` | Left open on purpose. Client-side only, decided in phase 5 after testing real files (see "File import" in section 3). Read `core/importers.py` and `tests/test_importers.py` and `tests/test_importer_errors.py` then, to see what the desktop app handles, including PDFs encrypted only to block printing or editing. |
| `self_check` | Not needed. A Playwright smoke test against the built site does that job. |
| Detached window | Later, if at all. Look at the Document Picture-in-Picture API and `window.open`, and check browser support first. |

Product features to bring over, in the order they matter: the reader with ORP,
speed, pause, skip and restart; transcripts and Spaces; saving and picking up
where you left off; the progress scrubber and bookmarks; chunking; settings and
themes; importing files; reading profiles; the comfort features (letter spacing,
the dyslexia font, bold word starts); speaker cues. The behaviour of each is
written in the desktop `docs/usage.md`, `docs/technique.md`, `docs/faq.md` and
`docs/data.md`.

## 7. Where the reference material is, and the one rule that never bends

### Reading the desktop repository

Read it from GitHub, `QuiteNew/rsvp-desktop-reader`, branch `main`, with read
access only. If you have a way to attach another repository to the session, use
it with read access, and clone into a scratch folder that is not the web
repository and not one of the owner's own folders. If you cannot reach it that
way, say so and ask the owner. Do not look for a way around it.

You may read everything in it: the code, the tests, the docs, the workflows, the
fonts, the history. What GitHub holds is what was pushed. If it looks out of
date, ask the owner to push. It does not hold the design notes mentioned below.

If the owner has also connected the desktop folder on their own computer, it is
the same repository, so read from it the same way and treat it exactly the same.

### What you must never do to it

**You are not allowed to change anything in the desktop repository.** Look only.

- No editing, creating, moving, renaming or deleting files.
- No commits, branches, tags, pull requests or issues. Never push, and never ask
  for push access to it.
- No running its code in a way that writes into it. Python writes `__pycache__`
  folders, pytest writes `.pytest_cache`, and the app's own code can create data
  folders. Those count as changes. Run Python with `-B` (or
  `PYTHONDONTWRITEBYTECODE=1`), run pytest with `-p no:cacheprovider`, and when
  in doubt do the work in a scratch clone.
- If something in it looks wrong or out of date, tell the owner. Do not fix it.
  Changes to the desktop app are the business of the desktop project's own chat.

### What is in it

- `README.md`: the feature list and the full file tree.
- `docs/architecture.md`: how the layers fit together, module by module. Read
  this first.
- `docs/usage.md`, `docs/technique.md`, `docs/faq.md`, `docs/data.md`.
- `core/`: the logic to port. `tests/`: what it must do.
- `assets/fonts/`: the bundled fonts and their licence files.
- `RELEASING.md` and `.github/`: how the desktop pipeline works.

Design notes written while the desktop features were built (chunking, reading
profiles, speaker cues, bold starts, the dyslexia font, the keyboard shortcuts,
reader fit and scroll) live in the desktop project's documents on claude.ai, not
in the repository. The owner should copy the ones that matter into the new repository
under `reference/desktop-design/`. Ask for them when a feature's phase starts,
and do not guess at a design that was already worked out.

## 8. Lessons from the desktop pipeline to reuse

The desktop project's CI/CD was upgraded in v4.1.1. Copy the ideas, not the
files, and re-derive the details for a static site.

- **Tests on every push and pull request**, with older runs cancelled when a
  newer push arrives, and no run for changes that cannot affect the result
  (docs only).
- **Docs and the site build on pull requests**, so a broken build shows up
  before the merge.
- **A release guard:** a release starts only from a pushed version tag, the tag
  must equal the version in the code, and the tagged commit must be on `main`.
- **Check the built thing, not just the source.** On the desktop it is a
  `--self-check` flag. On the web it is a Playwright run against the production
  build, served as it will be served.
- **Dependabot**, monthly, grouped, nothing merged on its own.
- **One version number in one place**, set by hand, with a test that fails if it
  falls behind the newest tag.

## 9. Phases

Each phase is several small commits. Do not start a phase until the last one is
done and the owner has confirmed it. Stop at the end of each phase and say what
was verified.

0. **Scaffold.** Vite, React, strict TypeScript, ESLint with the layer rule,
   Prettier, Vitest, a first test, the licence (MIT), a README, and a CI
   workflow. Deploy a plain "hello" page to GitHub Pages and confirm it loads at
   the real address.
1. **Golden fixtures and the core pipeline.** The fixture script, then
   `tokenizer`, `parser`, `punctuation`, `orp` and `timing`, each matching its
   fixtures.
2. **The reading session and a first screen.** `reader` and the engine loop,
   then one page: paste text, press play, see words with the ORP letter fixed on
   its spot, change the speed, pause, skip, restart. This is the first usable
   thing, so get it in front of the owner.
3. **Saved data.** Transcripts, Spaces and settings in the browser, picking up
   where you left off, export and import of a file.
4. **The reading experience.** Guide marks, the surrounding-words line, the
   scrubber, bookmarks, chunking, keyboard shortcuts, themes, fitting wide
   flashes.
5. **Importing files.** Starts with research and testing, not code (see "File
   import" in section 3). Then the owner decides how each format is read, in the
   browser only, and only then is anything built. The desktop app reads `.txt`,
   `.srt`, `.docx`, `.pdf` (including PDFs encrypted only to block printing or
   editing) and HTML, so that is the bar to compare with.
6. **Comfort and the rest.** Reading profiles, letter spacing, the dyslexia font,
   bold word starts and copying with bold, speaker cues with Web Audio chimes.
7. **Offline and polish.** PWA install and offline use, accessibility, browser
   checks, a help page, a real first release (`v1.0.0`).

A first public version could ship after phase 4 or 5, but that is the owner's
call.

## 10. Browser concerns to plan for

- **Accessibility.** Words flashing at a fixed spot must not be read out by a
  screen reader one by one. Keep the flashing area out of live announcements and
  offer a plain text view. Respect `prefers-reduced-motion` and keep full
  keyboard use. Say clearly in the app what a person with a seizure or
  photosensitivity condition should know before flashing text, and check what is
  already written in the desktop docs first.
- **Storage can be cleared.** Browsers may drop site data. Ask for persistent
  storage, tell the user their data lives in this browser only, and make export
  easy to find.
- **Large files.** Whatever reads a long file must not freeze the page, so keep
  the work off the main thread (a Web Worker, for example) and show progress.
  Check this as part of the phase 5 testing.
- **Secure context.** The clipboard and service worker APIs need HTTPS.
  GitHub Pages provides it. Local development works on `localhost`.
- **Base path.** A GitHub Pages project site lives under `/<repo-name>/`, so set
  the Vite `base` and the PWA scope to match, or the built site will not load its
  files.
- **Licences.** The code is MIT. The fonts are SIL OFL and need their licence
  texts shipped with them. Keep the desktop README's note about the word
  "Bionic Reading" being a trademark of someone else, and do not use their name
  in the app.
- **No tracking.** No analytics and no outside requests at first. The site must
  work with the network cut.

## 11. Still open for the owner to decide

- React or Svelte (the recommendation above is React).
- Whether the first public version waits for all of phases 0 to 5.
- Whether to host on GitHub Pages first and move to a custom domain later.
- Whether bundle compatibility with the desktop app is a promise or a nice
  extra.
- Whether to build the detached window at all.
- How PDF, Word and other files are read in the browser. Decided in phase 5, not
  before, and never on a server.

When one of these comes up, put it to the owner as a short question with a
recommendation, and wait for the answer.