# How to port a desktop module

The desktop app's Python code is the specification. A module is ported by
translating it, then proving the translation against answers the real Python
gave. This is the recipe. `src/core/parser.ts` with `parser.test.ts` is the
finished example to copy, and `timing.ts` is the example for numbers.

The desktop repository is read-only. Never change, run tests inside, or write
anything into it. See section 7 of [WEB_PORT_BRIEF.md](../WEB_PORT_BRIEF.md).

## The steps

1. **Read the Python module and its tests.** `core/<module>.py` and
   `tests/test_<module>.py` in the desktop repository, and any other test file
   that imports the module. Note every Python feature from the table below.

2. **Add the module to the fixture script.** In `tools/fixtures/generate.py`,
   write a `build_<module>()` function and add it to `MODULES`. Feed every
   public function the shared `TEXTS` and words, plus inputs aimed at that
   module's own edges. Add new awkward input to `TEXTS` rather than to one
   module, so every module gets it.

3. **Generate.** From the web repository's root, with Python 3.13:

   ```bash
   python -B tools/fixtures/generate.py --desktop PATH_TO_DESKTOP_CLONE
   ```

   It writes `fixtures/core/<module>.json`. Run it twice and compare: the
   output must be identical. Check `git status` in the desktop clone
   afterwards: it must show nothing.

4. **Port the module** to `src/core/<module>.ts`. Same file name, same
   function order, the same constants, `snake_case` names turned into
   `camelCase`. Keep the comments that explain why, in plain words. Do not
   improve the behaviour, even where it looks odd. If something looks wrong,
   tell the owner. It is fixed in the desktop project first, or not at all.

5. **Test against the fixtures** in `src/core/<module>.test.ts`, one test per
   Python function, with `expectToMatchFixture` from `src/testing/fixtures.ts`.
   A port is not done until every case matches.

6. **Port the module's own tests** into the same test file. Keep each Python
   test's name, so the two suites can be compared line by line. Simple
   input and output pairs go in a `test.each` table. Add tests for anything
   that JavaScript can get wrong and Python cannot (emoji, rounding, spaces).

7. **Break it on purpose.** Change the port in a few small ways, one at a
   time: a boundary, a constant, a dropped step, a JavaScript shortcut in
   place of a helper from `pythonText.ts`. Each change must make a test fail.
   If one does not, the fixtures have a hole: add input that covers it,
   generate again, and repeat. Put everything back.

8. **Run `npm run check`**, then write down in [STATUS.md](STATUS.md) what was
   ported, how many cases, and which breaks were tried.

## Python features and what to use for them

All of these are in `src/core/pythonText.ts`, and each is checked against
Python's own lists in `fixtures/core/charsets.json`.

| Python                                  | In the port                               | Why not the JavaScript look-alike                                                      |
| --------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `round(x)`                              | `pyRound(x)`                              | `Math.round` sends every half up. Python goes to even                                  |
| `len(text)`                             | `pyLength(text)`                          | `.length` counts an emoji as two                                                       |
| `text[i]`, `text[a:b]`                  | `characters(text)`, then index            | Indexing a string can cut an emoji in half                                             |
| `text.split()`                          | `pySplit(text)`                           | `\s` in JavaScript is a different list of spaces                                       |
| `text.strip()`                          | `pyStrip(text)`                           | `trim()` uses that different list too                                                  |
| `ch.isspace()`                          | `isPySpace(ch)`                           | Same reason                                                                            |
| `ch.isalnum()`                          | `isPyAlnum(ch)`                           | There is no built-in for it                                                            |
| `\s` in a regular expression            | `[${PY_SPACE}]`                           | Same list problem                                                                      |
| `\d` in a regular expression            | `${PY_DIGIT}` with the `u` flag           | `\d` in JavaScript is 0 to 9 only                                                      |
| `^` and `$` with `re.MULTILINE`         | `(?<=^\|\n)` and `(?=\n\|$)`, no `m` flag | JavaScript's also stop at `\r`, U+2028 and U+2029                                      |
| `text.casefold()`                       | `pyCasefold(text)`                        | `toLowerCase()` differs for about 300 characters, and for a sigma at the end of a word |
| `ch.islower()`                          | `isPyLower(ch)`                           | There is no built-in for it                                                            |
| `text.lstrip()`, `text.rstrip()`        | `pyLstrip(text)`, `pyRstrip(text)`        | The list of spaces again                                                               |
| `" ".join(text.split())`                | `pySqueeze(text)`                         | The list of spaces again                                                               |
| `\w` in a regular expression            | `[${PY_WORD}]` with the `u` flag          | `\w` in JavaScript is ASCII only                                                       |
| `[^\W\d_]` in a regular expression      | `[${PY_WORD_NOT_DIGIT}]`                  | There is no short form for it                                                          |
| `pattern.match(text)`                   | a `^` at the start, then `exec`           | `match` in Python only looks at the start of the text                                  |
| a `dict` used as a lookup               | a `Map`                                   | A plain object has names of its own, such as `constructor`                             |
| `isinstance(value, dict)` on saved data | a plain object or a `Map`, not an array   | In JavaScript an array is an object too                                                |
| `None` as a default argument            | `null`, with `= null` as the default      | So that leaving it out and passing `null` mean the same                                |
| `raise ValueError`                      | `throw new RangeError(...)`               | The fixture helper expects a `RangeError`                                              |
| a tuple or a dataclass                  | an object with `readonly` fields          | Named fields read better than positions                                                |
| `divmod(a, b)` on whole numbers         | `Math.floor(a / b)` and `a % b`           | Only equal for numbers that are not negative                                           |

Not met yet, so check them when they first come up: `str.lower()` on a whole
text, `str.title()`, `str.isalpha()`, `str.isdigit()`, sorting text, `//` and `%` on
negative numbers, and the order of keys in a dictionary.

Never use `Intl.Segmenter` to count characters. It counts what a person sees
as one character, which is a third answer, different from both Python's and
JavaScript's.

## A class that keeps state

One call and one answer is not enough for a class such as `ReaderSession`.
Its fixtures are scenarios: what the object is made with, then a list of
steps, and after every step everything the object shows. `build_reader()` in
the fixture script and `reader.test.ts` are the example. Two functions in
the script, `light()` and `detail()`, decide what is recorded, and the test
has the same two. Record the cheap things after every step and the large
ones only where they can have changed, or the file grows fast.

## The fixture files

```
{
 "meta": { desktop commit and version, Python and Unicode versions },
 "functions": {
  "python_function_name": [
   [[argument, ...], result],
   [[argument, ...], null, "ValueError"]
  ]
 }
}
```

- One file per desktop module, named after it. Function names are the
  Python names.
- The files are plain ASCII. Every other character is a `\u` escape, so no
  editor or Git setting can change one.
- They are written by the script, never by hand. Prettier ignores them.
- `charsets.json` is different: it holds Python's own character rules as
  `[first, last]` ranges, not calls.
- Use Python 3.13. The script stops on any other version, because the
  Unicode tables differ between versions. `meta` records both.

## Rules for src/core

- No DOM, no React, no timers, no storage, no network. Take what is needed
  as an argument, return plain data.
- No imports from `engine`, `store` or `ui`.
- `tsconfig.core.json` and ESLint enforce both. Test files are the one
  exception: they may import from `src/testing`.
