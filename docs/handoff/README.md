# Handoff

One spec per phase that is not finished. Each one says what to build, what
in the desktop repository it is ported from, how to prove it, and what to
ask the owner first. They were written on 2026-11-15, after phase 1 and the
core half of phase 2.

Read in this order before doing anything:

1. [WEB_PORT_BRIEF.md](../../WEB_PORT_BRIEF.md): the plan and the rules.
2. [STATUS.md](../STATUS.md): what is done, what was checked, what was
   decided.
3. [PORTING.md](../PORTING.md): the recipe for porting one module, and the
   table of Python and JavaScript differences.
4. The spec for the phase in hand.

| Spec                               | Phase                                       |
| ---------------------------------- | ------------------------------------------- |
| [phase-2-rest.md](phase-2-rest.md) | The desktop tests, the engine, first screen |
| [phase-3.md](phase-3.md)           | Saved data                                  |
| [phase-4.md](phase-4.md)           | The reading experience                      |
| [phase-5.md](phase-5.md)           | Importing files                             |
| [phase-6.md](phase-6.md)           | Comfort and the rest                        |
| [phase-7.md](phase-7.md)           | Offline and polish                          |

## The pattern to copy

`src/core/reader.ts` with `reader.test.ts`, `fixtures/core/reader.json` and
the `reader` part of `tools/fixtures/generate.py` is the finished example
of a module that keeps state. `src/core/timing.ts` is the example of plain
functions. A new module should look like one of them.

## The layer contracts

These are real types, checked by `npm run check`. Build against them, and
change them only with a reason written in the commit.

- `src/core/models.ts`: `Transcript`, `Bookmark`, `Library`, `Settings`.
- `src/engine/contract.ts`: `ReaderEngine`, `ReaderSnapshot`, `Clock`,
  `PageVisibility`, `ReaderEvents`. What the engine promises to the UI.
- `src/store/contract.ts`: `LibraryStore`, `SettingsStore`, `Persistence`,
  `BundleService`. What the store promises to the UI.

## Working with the owner

The brief and the project instructions have the full list. These are the
points that came up in practice.

- A phase starts only after the owner has confirmed the one before it.
- The owner commits and pushes by hand. For every commit give `git add`,
  what `git status --short` and `git diff --cached --numstat` should show,
  then the title and the description separately. Write each paragraph of
  the description as one line, with no line breaks inside it.
- No em dashes, no marketing tone, no `Co-Authored-By` or session lines.
- The assistant may write files into the web repository (allowed since
  2026-11-15). After writing, compare the md5 of each file on the owner's
  disk with the tested copy. Files have been written empty before.
- Never run Git in the owner's folder from the remote shell, not even
  `git status`. The shell cannot delete files, so Git leaves `.lock` files
  behind and the owner's next commit fails. Use `md5sum` and `cat` to look,
  and let the owner run Git.
- The remote tools cannot write into `.github/` or `.vscode/`. Show those
  files in the chat for the owner to paste.
- The desktop repository is read-only, always. Run its code only from a
  scratch clone, with `python -B`, and `pytest -p no:cacheprovider`.
- Ask for the desktop design notes when a feature's phase starts. They go
  in `reference/desktop-design/`. For `reader` the owner said: no notes,
  and where a note and the code disagree, the code wins.
- The assistant's workspace has Google Chrome but cannot download
  Playwright's browsers. To run the browser tests there, use a throwaway
  config that sets `channel: 'chrome'`, and do not commit it. Firefox and
  WebKit run on the owner's machine and in CI.
- Say what was run and what was not. Look up current versions before
  adding a dependency, and pin them exactly in `package.json`.

## Fixtures need Python 3.13

The owner's machine has Python 3.11. Its Unicode tables are older, so
fixtures made with it would differ. Generate fixtures with Python 3.13, in
the assistant's workspace or after the owner installs 3.13, and check that
the Python and Unicode versions written inside each fixture file say 3.13
and 15.1.
