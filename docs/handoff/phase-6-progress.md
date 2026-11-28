# Phase 6 progress: comfort and the rest

Where phase 6 stands, so the work can carry on after a break. The plan is
[phase-6.md](phase-6.md). Phase 5 was called done by the owner on
2026-11-22 and released as `v1.1.0`. Phase 6 started on 2026-11-23.

| Step                                   | State                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. What the desktop app does, and plan | Done, below                                                                                                                     |
| 2. Design notes from the owner         | Done on 2026-11-23, below                                                                                                       |
| 3. Build, one feature at a time        | All built. Letter spacing is in 1.2.0, the font and bold word starts in 1.3.0, reading profiles in 1.4.0, speaker cues in 1.5.0 |
| 4. The owner tries each feature        | Every feature is waiting for the owner's eye check, and the chimes for the ear check                                            |
| 5. The HTML import fix from phase 5    | Done on 2026-11-28 in a commit of its own, `0753ac4`. In 1.5.0                                                                  |

## Step 1: what the desktop app does

Read at desktop commit `8112ff1` (v4.1.1): the modules below, their tests,
`docs/usage.md` ("Letter spacing and the OpenDyslexic font", "Bold word
starts and copying with bold", "Speaker cues", "Profiles") and the Settings
window. Nothing was run. The desktop clone was left as it was.

What the web app has already, from phases 3 and 4: every setting these
features use is saved and checked (`src/core/settings.ts`:
`letter_spacing_level`, `dyslexia_font_enabled`, `bold_starts_enabled`, the
six `speaker_cue_*` settings, and `profiles`, which is kept as a list but
not yet checked entry by entry). The speakers core (`speakers.ts`) and the
session's turns and pause are ported. Fredoka and Quicksand are bundled.
None of the four features has a screen yet.

### Letter spacing

`core/letter_spacing.py`, 187 lines, 58 tests. Four levels, Off, Small,
Medium and Large, adding 0, 0.10, 0.18 and 0.30 of the word size between
letters. Between the words of a chunk the gap is at least twice the letter
gap. The highlighted letter stays on its point. The surrounding-words line
is left as it is. On the Appearance tab, applied at once, and saved in
profiles.

Most of the module exists because Tk has no letter spacing: it measures
thin space characters and picks the mix closest to each gap. CSS has
`letter-spacing` and `word-spacing`, so the plan (phase-6.md) is to port
only the level table and the clamp. To check by eye first: CSS also puts
the gap after the last letter of each piece, and the word is drawn in three
pieces around the focus letter, so the focus letter could move off its
spot. Shown to the owner next to the desktop app before it is kept.

### The OpenDyslexic font

The desktop ships `OpenDyslexic3-Regular.ttf` and `OpenDyslexic3-Bold.ttf`
(about 240 KB each) with `OFL-OpenDyslexic.txt`. The switch changes every
font in the app, takes effect at the next start on the desktop, is not
saved in profiles, and is on the Appearance tab.

The license names "OpenDyslexic" as a Reserved Font Name. Under the SIL
OFL a changed font may not keep that name, and converting to another format
could count as a change. So the plan is to ship the two `.ttf` files as
they are, as Fredoka and Quicksand are now, with the license next to them.
A browser downloads a font only when the page uses it, so people who leave
the switch off do not download it. On the web the switch can apply at once.

### Reading profiles

`core/profiles.py` (224 lines) and `core/profile_apply.py` (94 lines), with
`test_profiles.py` (65 tests), `test_profile_apply.py` (39) and
`test_settings_store_profiles.py` (56), and `gui/components/profiles_tab.py`
with its two dialogs. A profile is a name and the 18 settings in
`PROFILE_KEYS`: the guide marks, pacing, rewind on resume, surrounding
words, skip amount and pause on skip, the default speed and word size, the
size step, the scrubber pause, splitting long paragraphs, and letter
spacing. It never changes a transcript, the colours, chunking, speaker
cues, the theme or the font switch. A missing key means "leave that
setting alone", and the guide mark colour is stored as nothing while it
still follows the theme. It has its own Settings tab, Profiles.

### Bold word starts, and copying with bold

`core/bold_starts.py` (218 lines, 48 tests) decides which letters of each
word are bold. `core/rich_copy.py` (117 lines, 26 tests) and
`gui/rich_clipboard.py` put the bold on the clipboard. On the desktop it is
a small button next to Normalize, a look for the edit box only. It does not
change the text, is not in profiles, and is remembered on its own. Very
long lines stay plain there, because bolding them made the box slow.

This is the feature with the most open design: a `<textarea>` cannot show
bold. phase-6.md asks for the choices, a read-only view beside the editor
or an editable rich area, laid out with their costs, and for the browser's
clipboard support to be checked first. That comes at its own step, with
current facts, before anything is built.

### Speaker cues

`core/chime.py` (235 lines, `test_chime.py` 49 tests), `gui/chime_player.py`
(32 tests), the speaker cues window and its tests, and the parts of the
reader display that show the name tag and the flash (63 tests). On the
desktop the chime plays on Windows only; the web app can play it in every
browser, after the first click or key press. Six settings, off by default,
set in their own window from the Defaults tab.

## Plan

One feature at a time, each in small commits, each shown to the owner
before the next. The order puts the small, settled ones first, and
profiles after the settings they hold have a screen. On 2026-11-23 the
owner set a release after each group (see the end of step 2), and bold
word starts moved before profiles to go out with the font in 1.3.0:

1. **Letter spacing** (1.2.0). The level table, the CSS spacing, the eye
   check of the focus letter next to the desktop, the Appearance tab
   control.
2. **The OpenDyslexic font** (1.3.0). The two files and the license, the
   switch on the Appearance tab, applied at once.
3. **Bold word starts** (1.3.0). The port of `bold_starts.py` with
   fixtures. Then the display and copying choices for the owner, with
   their costs, before any screen work.
4. **Reading profiles** (1.4.0). The port with fixtures and the three
   desktop test files, the `profiles` field settled, then the Profiles tab.
5. **Speaker cues** (1.5.0). The chime maths with fixtures, the sound (the
   recommendation is to port the desktop's sample maths into an
   `AudioBuffer`, to keep the same sound, and compare by ear), the name tag,
   the flash, the speakers window.
6. **The phase 5 HTML fix** (1.5.0), in a commit of its own, as the owner asked:
   keep the text after a dropped `<script>` or `<style>`, as a written
   difference from the desktop.

## Step 2: what the design notes add

The owner put the notes in the desktop repository, not in this one:
`reference/desktop-design/` at desktop commit `eccfc89` ("Added the desktop
design notes to reference/"), which changes nothing else there. Read on
2026-11-23:

- `dyslexia-font-design.md`: the font switch and letter spacing (v3.6.0).
- `reading-profiles-design.md`: profiles (v3.5.0).
- `bionic-reading-design.md` and `bold-starts-step4-notes.md`: bold word
  starts and copying with bold (v3.7.0). The second is about Tk.
- `speaker-cues-design.md` and `speaker-cues-start.md`: speaker cues
  (v4.1.0).

The desktop released each of these as a minor version of its own.

### Corrections to step 1

The test counts in step 1 counted test functions. Counted by pytest, with
their parameters, they are: `test_letter_spacing` 78, `test_font_choice` 41,
`test_profiles` 65, `test_profile_apply` 64, `test_settings_store_profiles`
56, `test_bold_starts` 106, `test_rich_copy` 40, `test_chime` 132,
`test_chime_player` 37, `test_reader_display_speaker_cues` 69,
`test_speaker_cues_wiring` 25. Nothing else in step 1 changes.

### Letter spacing

- The word gap rule: between the words of a chunk, the plain space plus
  whatever it takes to reach twice the letter gap. So the gap is the larger
  of the plain space and twice the letter gap, not the two added together.
  CSS `letter-spacing` puts its gap after the space too, which gives the
  plain space plus twice the gap. To match the desktop, `word-spacing` has to
  take the difference back off, which needs the width of the font's space.
  To decide by eye at the build, with the focus letter check.
- Auto-fit measures the word with the spacing in it, so the fit is right for
  what is drawn.
- The levels were tuned by eye, not proven. Medium is close to the spacing
  of one study of children with dyslexia, on running text.
- Applied with Settings' Apply, and saved in profiles.

### The OpenDyslexic font

- The whole app changes: body text to OpenDyslexic Regular and headings to
  OpenDyslexic Bold, the way Quicksand and Fredoka share the work now.
- The switch is read strictly: only a real `true` turns it on, so a damaged
  settings file cannot (`core/font_choice.py`, 41 tests). The web settings
  already read it as a flag.
- OpenDyslexic is about 40 percent taller than Fredoka, and its space is
  0.85 em against Fredoka's 0.24. On the desktop the focus letter stays at
  the same height and the guide marks sit farther out. To look at by eye.
- Not in profiles. The desktop needs a restart for it; the web will not.
- For the docs: a comfort setting, with no claim that it helps. The note
  sums up the research (weak evidence for the typeface, better for
  spacing, none on single flashed words).

### Reading profiles

- The Profiles tab sits after Appearance (on the desktop, between Appearance
  and Stats). A paragraph on it says what a profile holds and does not
  change, and that Spaces are the way to keep texts apart.
- Settings' own Apply is hidden on that tab. Saving and updating a profile
  apply the pending changes first and take the snapshot from them. Applying
  a profile closes Settings on the desktop, so no window shows old values;
  the web can show the new values instead, to decide at the build.
- Names are unique, case aside, at most 30 characters. Save, rename,
  update, delete. Clicking the selected profile again unselects it. No
  starter profiles. A profile is a snapshot, not a live link.
- Speed and Word size in a profile are only the Defaults sliders, for the
  next new transcript.
- The guide mark colour keeps its "follows the theme" flag through a
  profile.

### Bold word starts, and copying with bold

- The look is for the edit box only: not the reader, not the surrounding
  words, not profiles. The text never changes. A button next to Normalize,
  with an icon that swaps between off and on, remembered as
  `bold_starts_enabled`.
- The rules (`bold_starts.py`, 106 tests): words of Latin, Cyrillic or
  Greek letters; each part of a hyphenated word on its own; a word touching
  a digit left plain; web and email addresses left plain; a length curve,
  with a nudge to a vowel and consonant boundary in words of seven letters
  or more.
- Lines over 4,000 characters stay plain on the desktop, because Tk's cost
  for formatting a line grows with the square of its words. A browser may
  not need that limit; to measure at the build.
- Copying: Ctrl+C while the look is on, and a "Copy with bold" item in the
  right-click menu, put HTML next to the plain text. Cut stays plain.
  `rich_copy.py` builds the HTML: one paragraph per line with no margin,
  `<b>` around the bold, spaces that HTML would squeeze kept as `&nbsp;`, a
  tab as four of them, control characters left out of the HTML only. The
  Windows header around it (CF_HTML) is not needed in a browser, which
  writes its own.
- The desktop edit box never had undo; the web text box has the browser's.
- The name: never "Bionic Reading", in the app, the settings or a release
  title. The docs and the README License section say once that it is a
  trademark of BRCG Casutt GmbH and that the project is not affiliated with
  it, as the desktop does. The note also records a French patent
  publication (FR1755215) whose status was never checked, and says the
  owner should know of it before releasing publicly. That note is not legal
  advice, and neither is this.
- No claim that it helps; the note lists the studies.

### Speaker cues

- Off by default, and with it off the reader does not change at all.
- The name tag: the font colour blended 0.55 towards the background. Above
  the word (and moving with it when the reader is panned sideways), or a
  fixed spot in the top right corner, 12 px in. It stays while paused.
- The flash: 330 ms, the tag in the highlight colour and the background
  moved 0.18 towards the highlight. Each with its own switch, both on by
  default.
- The sound: one chime for any change, or a pattern for each speaker (C5;
  C5-G5; G5-C5; C6; C5-E5-G5; the sixth wraps round), the change chime on
  A4, four styles (Bell, Soft, Glass, Wood). No two chimes closer than
  400 ms. On the desktop only Windows plays it; the web can play it in
  every browser.
- The window: a "Configure speaker cues…" button under "Configure
  chunking…" on the Defaults tab. Close and Apply (Apply keeps it open and
  says "Applied."). The top part is for the whole app (the switch, the name
  and its position, the flash, Sound and Style with a Listen button, greyed
  while the sound is off). The bottom part is for the open transcript: one
  row per speaker with a tick box, an editable name and "seen N times",
  Automatic or Custom, and "Back to automatic".
- Not in profiles. No per-transcript switch, and nothing about speakers in
  the edit box.

### What this changes in the plan

The order stays. Two things are added:

- Letter spacing: the word gap rule above is part of the eye check.
- Bold word starts: the 4,000-character limit is measured in a browser
  before it is copied or dropped.

One question for the owner, not blocking: the desktop released each of
these features as a minor version. Release the web app once at the end of
phase 6, as for phase 5, or after each feature?

Answered on 2026-11-23: once, at the end of phase 6, as `v1.2.0`. The
owner asked whether it should be `v2.0.0`. It should not: a major version
is for a change that breaks something people rely on, and phase 6 only
adds features. Saved settings, the library and export files from 1.1.0
keep working unchanged, since every setting phase 6 uses is already saved
and checked since phase 3.

Changed by the owner later the same day: a release after each group
instead of one at the end. `v1.2.0` letter spacing (with the Fredoka fix
below), `v1.3.0` the OpenDyslexic font and bold word starts, `v1.4.0`
reading profiles, `v1.5.0` speaker cues and the HTML import fix. Each is
a minor version, for the same reason.

## Step 3: building

### 1. Letter spacing

Built on 2026-11-23, in two commits: the core port with its fixtures, then
the reader and the Settings control.

What was ported. Only the level table and `clamp_level()` of
`core/letter_spacing.py`, into `src/core/letterSpacing.ts`, checked against
`fixtures/core/letter_spacing.json` (the four tables and 22 levels for
`clamp_level`, generated at desktop `eccfc89`). The rest of the desktop
module (measuring thin space characters in the font and building each gap
out of them) is not needed, because CSS has `letter-spacing` and
`word-spacing`. One difference that cannot matter: Python gives 0 for the
level `1.0` and JavaScript cannot tell `1.0` from `1`. The settings are
checked before the level gets there.

How the desktop's gaps map to CSS, in `WordDisplay`:

- `letter-spacing` goes on the text before and after the focus letter, not
  on the focus letter. The focus column then stays exactly as wide as the
  letter, so the letter stays on its spot.
- The desktop puts a letter gap at the start of the after text, even when
  it starts with a space. The page adds it as padding (`gapStart`).
- The desktop puts a letter gap at the end of the before text even when it
  ends with a space (the focus letter starts its word). `letter-spacing`
  gives one already; the page adds the second as padding (`gapEnd`).
- Between two words of a chunk the desktop has the larger of the font's
  space and twice the letter gap. CSS gives the space plus two letter gaps
  (one after the last letter, one after the space), so `word-spacing` takes
  the difference back off. That needs the width of the space, which the
  page measures with its ruler (`wordSpacingEm` in `letterSpacing.ts`).
- Auto-fit measures the text with the spacing in it.

The control is a "Letter spacing" list on the Appearance tab, under the
theme, with the desktop's note. The desktop's note also says the level is
saved in reading profiles. That part is left out until profiles exist
(feature 3), and goes back in then. Reset to Original Defaults leaves the
level alone, as on the desktop, because it is on another tab.

What was run, on 2026-11-23:

- `npm run check`: lint, Prettier, types, 1369 Vitest tests (7 new in
  `letterSpacing.test.ts`, 4 new in `App.test.tsx`), the build.
- The Playwright tests, 54 of them, 3 new in `e2e/letterSpacing.spec.ts`:
  by the assistant in Chromium, and by the owner on Windows in Chromium,
  Firefox and WebKit.
- Measured in Chromium: the focus letter is off the centre of the row by
  0.00 px at every level, for one word and for a chunk. The room in front
  of the after text grows by 0.10, 0.18 and 0.30 em. Between the words of
  a chunk, with Quicksand's space at about 0.275 em, the room grows by
  nothing at Small (0.20 em is under the space), and by 0.085 and 0.325 em
  at Medium and Large, which is twice the gap less the space, as on the
  desktop.
- The browser tests were checked by breaking the page on purpose, one
  thing at a time, in Chromium: no `word-spacing`, no gap in front of the
  after text, the focus letter spaced too, and every gap 10 percent too
  big. Each one failed a test. Then the page was put back.
- The fixtures were made again from a scratch copy of the desktop: the new
  file came out byte for byte the same, and the desktop clone was left as
  it was.

WebKit and letter boxes. The first version of the browser tests measured
each letter, and failed in WebKit by 0.4 to 0.6 px. A throwaway probe, run
by the owner in Chromium and WebKit, printed every letter's box at every
level. WebKit gives a letter's box in whole pixels from the start of its
element: a letter 12.8 px in is reported at 12 px, even with no spacing at
all. The ends of each piece of text are not rounded, and there Chromium
and WebKit agreed to 0.02 px at every level, the focus letter to the
thousandth of a pixel. So the page is drawn the same in both, and only the
way the test read it was wrong. The tests now measure the ends of the text
before and after the focus letter, and the focus letter's left edge.

Not tested in a browser: the extra gap when the text before the focus
letter ends with a space (`gapEnd`). The texts in the tests do not have
one. The unit tests do not draw, so they cannot see it either.

Not done: the eye check against the desktop app, which the assistant cannot
run. The owner holds the levels up against the desktop (step 4).

The font of the word. While checking this, it turned out the desktop draws
the flashing word, the surrounding-words line and the speaker name in the
heading font, Fredoka SemiBold (`gui/components/reader_display.py`, lines
240, 265, 331 and 348 at `eccfc89`). The web app drew them in the body
font, Quicksand, since phase 2. The owner chose to fix it, in a commit of
its own, before the eye check. The reading area now uses Fredoka SemiBold
for the word, the surrounding words and the ruler that measures them, and
a browser test checks the word and the surrounding words. The speaker
name, built with speaker cues (feature 5), goes in the same area and gets
the same font. The rest of the page keeps Quicksand.

With Fredoka, the space is about 0.241 em (measured in Chromium). Between
the words of a chunk the room grows by nothing at Small, and by 0.119 and
0.359 em at Medium and Large. The measurements above were taken in
Quicksand, before the change; the rule is the same, and the browser tests
pass in both.

### 2. The OpenDyslexic font

Built on 2026-11-23, for 1.3.0, which it shares with bold word starts below.

What was added. The two font files and their licence text, copied from the
desktop's `assets/fonts/` byte for byte (the md5 sums match, and nothing was
converted or cut down, so they are the font as released), into
`src/ui/fonts/`. A switch "Use the OpenDyslexic font" on the Appearance tab,
under Letter spacing. When it is on, every font on the page changes, not only
the reader's, as on the desktop.

How it differs from the desktop, on purpose:

- It applies when Apply is pressed. The desktop needs a restart, because Tk
  fixes its fonts at start. The brief said the web can apply at once.
- The Regular and Bold files are one family, `OpenDyslexic`, with two
  weights. On the desktop they register as two families whose names differ
  by one space. Body text (weight 500) lands on the Regular file and
  headings and the flashing word (weight 600) on the Bold file, the same
  split as the desktop.
- The files are always there, so nothing like the desktop's fallback and its
  notes (files missing, font not loadable on macOS and Linux) is needed. The
  strict reading of the switch is kept: only a real `true` turns it on
  (`src/core/fontChoice.ts`, checked against `fixtures/core/font_choice.json`,
  13 values, generated at desktop `eccfc89`).
- A browser fetches a font file only when text on the page uses it, so the
  480 kB of OpenDyslexic is never downloaded for a person who does not turn
  the switch on. A browser test checks that, and that both files come from
  the site itself.
- The desktop's note under the switch also says it is not saved in reading
  profiles. That goes back in with profiles (feature 4). Profiles must leave
  it out, as the desktop does.
- Drop-down lists use the system's font by default, so with the switch on
  they are told to follow it.

The reader measures its word in the font it is drawn in, to fit it to the
row. OpenDyslexic is wider, so after the switch the word is measured again:
when the page's font set changes, when the new font has been asked for by
name and has arrived, and when the browser says a font finished loading.

A bug found by the browser test, in WebKit only. The first time the switch
was turned on, the word stayed fitted to the fallback font (21 px, where
Chromium settles at 19 px). A probe test run in WebKit showed why: the font
loaded, but WebKit sent no `loadingdone` event for it, and the measuring
again waited for that event. The second time the switch was turned on it was
right, because the font was already loaded. The fix asks the browser for the
new font by name when the font set changes (`document.fonts.load`) and
measures again when that finishes. It does not depend on the event.

What was run, on 2026-11-23: `npm run check` (1376 Vitest tests, 7 new), and
`npm run e2e` in Chromium, Firefox and WebKit (4 new tests in
`e2e/dyslexicFont.spec.ts`). The owner ran all three browsers. Before the fix
above, one of the new tests failed in WebKit and passed in the other two.
After it, all three pass. The new test was checked by breaking the page on
purpose in Chromium: without the measuring again, and without watching the
font set (back and forth between the two sets), it fails. With the browser's
`loadingdone` event removed, the tests still pass in Chromium, because the
change of the font set measures again too. The explicit request for the font
was not removed on purpose to see what happens, so only the WebKit run shows
that it works. Both are kept, since a font can finish loading after the
first measure.

Not done: the eye check. The desktop notes say OpenDyslexic is about 40
percent taller than Fredoka and its space is 0.85 em, and that on the
desktop the focus letter stays at the same height while the guide marks sit
farther out. On the web the guide marks are placed from the middle of the
focus letter (0.6 em), whatever the font, so they may sit differently. They
were not looked at while reading. For the owner to look at, with letter
spacing on as well: at 0.85 em, the space is already wider than twice any
letter gap, so spacing adds nothing between the words of a chunk.

Left for phase 7: the font files must be cached for offline use, and the
licence texts (`OFL-*.txt`) are in the repository next to the fonts but are
not part of the built site. The owner put the licences link off to later
(phase 5 question 5), and this joins it.

### 3. Bold word starts

Built on 2026-11-24, for 1.3.0, in seven commits: the port of the rules
(`ff22fd7`), the cutting of a text into pieces (`ef903ab`), two helpers the
browser tests needed (`a53ee0b`, `48b14e9`), the view and its button
(`66b3e40`), the port of the clipboard HTML (`2bac167`) and copying out of the
view (`3de3b60`).

What was ported. All of `core/bold_starts.py` into `src/core/boldStarts.ts`:
which letters of each word are bold, with the length curve, the nudge to a
vowel and consonant boundary, the plain digits and the plain web and email
addresses. `fixtures/core/bold_starts.json` holds 2,439 cases generated from
the desktop at `eccfc89`, and the tests also sweep every Unicode character
against Python's own answer. The desktop counts characters as code points and
the browser counts UTF-16 units, so positions are kept in code points
(`characters()` in `pythonText.ts`) and `boldSegments()` turns them into
pieces only at the edge. Then `core/rich_copy.py` into `src/core/richCopy.ts`,
checked against `fixtures/core/rich_copy.json`, 1,094 cases. Each answer is the
fragment cut out of the desktop's real `cf_html()` at the places its own header
names, so the real code is what is compared. The header of Windows'
clipboard format is not ported, because a browser writes its own.

The two choices the notes left open, made by the owner:

- A text box cannot show bold, so while the look is on a read-only view takes
  the text box's place (`BoldText.tsx`). It has the textarea's class, so font,
  size, padding and lines are the same. The text is typed and pasted in the
  box with the look off, as the placeholder says. The view is a `div` with
  `role="textbox"` and `aria-readonly`, and its bold pieces are built straight
  into the page and not by React, which would compare a hundred thousand of
  them at every draw of a long text.
- A normal copy carries the bold. There is no separate "Copy with bold"
  button or menu item, which the desktop has because Tk has no other way to
  offer it.

How it differs from the desktop, on purpose:

- The 4,000-character line limit is not ported. It exists because Tk's cost
  for a line grows with the square of its words. In a browser the total size
  of the text is what counts. Measured in Chromium by the assistant: 100,000
  characters switch on in 0.16 s, 500,000 in 0.8 to 1.7 s and 2 million in
  about 3 s. The owner's probe, run in all three browsers at once on one
  machine, gave 0.7, 0.8 and 1.8 s at 100,000 characters (Chromium, WebKit,
  Firefox), 2.6, 2.4 and 4.2 s at 500,000, and 16.6 s in Firefox at 2 million
  (Chromium and WebKit did not get that far, see below). Switching off took
  0.2 to 1.0 s up to 500,000. So no limit was added.
- The view is read only, so there is no Cut, and nothing to undo in it.
- Not in profiles, as on the desktop. Saved on its own as
  `bold_starts_enabled`, at once, not at Apply.
- The button sits next to Normalize, with an icon that shows on or off.
  The app never says "Bionic Reading".

How copying works. The `copy` event is caught on the whole page, because where
the browser sends it differs. `copyWithBold()` acts only when the selection is
inside the view. It reads the pieces off the page as they are shown, plain or
bold in reading order, writes the plain text and the HTML, and calls
`preventDefault()`. As on the desktop, if the pieces do not add up to exactly
the selected text, or the selection reaches outside the view, it does nothing
and the browser's own copy happens. Without this handler the browser's copy
also carried the page's text colour, font and grey box background into Word,
which was seen while building it. Ctrl+A (Cmd+A on a Mac) in the view selects
its text only, because in a part of the page that is not a text box the
browser would select the whole page.

What was run, on 2026-11-24 and 2026-11-25:

- `npm run check`: 1,529 Vitest tests at the last commit, in the logic,
  importers and ui projects.
- The Playwright tests in Chromium by the assistant (65 of them, 4 in
  `e2e/boldStarts.spec.ts` for the view and 2 more for copying), and by the
  owner in Chromium, Firefox and WebKit. A real Ctrl+C read back from the
  clipboard runs in Chromium only, since the other two do not let a test read
  the clipboard. The copy event itself is tested in all three.
- Eight deliberate breaks of the copy code, each caught by a test, in
  Chromium.
- The fixtures were generated in a scratch copy of the desktop. The desktop
  clone was checked to be as it was before.

Two races in the browser tests were found on the way, both in the tests and
not in the page. Reading advances on the page's own timers, so a test that
clicks Start reading and then Pause could be too slow, most in WebKit when
three browsers ran at once. `installClock()` and `startReadingPaused()` in
`e2e/helpers.ts` hold the page's clock for the two clicks (`a53ee0b`). The
text box also did not follow the OpenDyslexic switch, because its font was set
to the system font in the stylesheet. `--font-text` fixes that (`48b14e9`).

A speed finding that is not about bold. The probe could not put 2 million
characters into the text box in Chromium and WebKit: the step of filling the
box took longer than the four minutes the test had. At 500,000 characters it
took 88 s in Chromium and 62 s in WebKit, and 0.7 s in Firefox. Run alone in
Chromium, a bare `<textarea>` on an empty page took 78 s and the app 84 s, so
the time is the browser's, not the app's. Both were measured with Playwright's
`fill`. A real paste was not measured, and may behave the same or not.

Not done: the eye check, next to the desktop app. The copy into Word itself was
not tried, only what is on the clipboard. Whether a large text freezes the
page when it is pasted in a real Chromium is not known. The French patent
publication the desktop note names (FR1755215) was not looked up, and the note
says the owner should know of it before a public release.

### 4. Reading profiles

Built on 2026-11-25 and 2026-11-26, for 1.4.0, in about a dozen commits: the
port of Python's printable rule (`b159d4d`), the profile rules (`de9f4a4`),
what applying does (`ddef04a`), the check of every saved profile when settings
are read (`31ce9ab`), the saved-list operations (`5e386ce`), the store
(`f0fe216`), the sentence under Letter spacing (`cfea979`), then the Profiles
tab (`66f889d`) and its Update, Rename and Delete buttons (`792e228`). The
check that selected text compares the same in every browser (`b7672b0`) came
first, from a Firefox failure on Windows in the 1.3.0 bold test (the
selection has `\r\n` there), fixed in the test only.

What was ported, from desktop `eccfc89`:

- `core/profiles.py` into `src/core/profiles.ts`: the 18 keys, the name rules,
  `valueIsValid`, `buildValues`, `profileFromDict` and `cleanProfileList`.
  `fixtures/core/profiles.json` holds the cases. Bad input throws
  `ProfileError`, a `RangeError`, where Python raises `ValueError`.
- `core/profile_apply.py` into `src/core/profileApply.ts`: `planProfile`, which
  says what a profile changes. A key a profile does not hold is left alone.
  The number ranges are the same objects `settings.ts` uses.
- The profile methods of `settings_store.py` as pure functions over the saved
  settings in `src/core/savedProfiles.ts`. The store only saves what they
  return, at once. Recorded in `fixtures/core/settings.json` by a script of 51
  steps, and in the 376 replayed store tests.
- `models.profiles`, checked on load and on a bundle import, and again in
  `settingsView()`.

Python traps met, all with a test:

- `str.isprintable()` decides which names are allowed. The browser's Unicode
  is newer than Python 3.13's, so a range table written from Python itself is
  used (`src/core/pythonPrintableTable.ts`, made by the fixture script and
  left out of Prettier).
- `casefold` against `toLowerCase`: names that differ by Straße and STRASSE,
  a ligature or the Kelvin sign are the same name.
- `str.split()` whitespace, which includes `\x1c` to `\x1f` and `\x85` but not
  the byte order mark, and code point length, so an emoji counts once.
- Keys like `constructor` and `__proto__` in a saved profile: a `Map` and
  `Object.hasOwn` are used, never a plain object lookup.
- The order of a snapshot's keys is the order of `PROFILE_KEYS`. The fixture
  comparison ignores key order, so a test runs the cases again with the input
  reversed. A deliberate break showed this was not covered at first.
- Python's `10.0` and `10` are one number to `JSON.parse`. That cannot be told
  apart in the browser, so the generator stops on a whole-number float and the
  difference is only written down. Lone surrogates were left out of the
  fixtures too, because they break Vite's JSON reader.

The page. The Profiles tab holds Save current settings as…, a list of the saved
profiles (a row is selected with a click and unselected with a second click),
and Apply, Update, Rename and Delete, off while nothing is selected. Settings'
own Apply is hidden on that tab. The choice of profile is kept in
`SettingsDialog`, because the tabs unmount when one switches (found by a page
test). `ConfirmDialog` in `Dialog.tsx` puts the focus on Cancel, so Enter never
confirms Update or Delete. The messages are the desktop's.

Decision made with the owner: applying a profile closes Settings, as on the
desktop, so no window shows old values. The guide mark colour keeps its
"follows the theme" flag through a profile: it is stored as null while it
follows the theme, and `restoreGuideMarkColor` is the one rule that can turn
that back on.

What was run: `npm run check` (1,737 tests at the last code commit, with lint,
Prettier, types and the build) and all 70 browser tests in Chromium by the
assistant. Eight deliberate breaks of the Update, Rename and Delete page, seven
caught. The eighth, Delete forgetting to clear the selection, cannot show on
any page, because a name that is no longer saved is never selected. It is kept
because the desktop does it.

Not run: Firefox and WebKit for the Update, Rename and Delete tests (the
owner's `npm run e2e`), the eye check next to the desktop app in Light and
Dark, and the desktop's `docs/usage.md` check. The desktop's window tests in
`test_gui_smoke.py` are covered by page tests, not ported one to one.

### 5. Speaker cues

Built on 2026-11-28, for 1.5.0, in seven commits and a fix: the chime
fixtures (`b365e5f`), the chime port (`6f14a30`), the player (`f7227f4`), the
name tag (`9272642`), the wiring while reading (`66cccb9`), the window
(`f6b80ae`), its speaker list (`429ad36`), and Apply closing the window
(`5a28358`). The desktop moved on to `bcc4d22` meanwhile, with packaging,
licences and a privacy policy. None of the speaker cue code or its tests
changed, so the base stayed `eccfc89`. The design notes were read in the
desktop's own `reference/desktop-design/`.

What was ported:

- `core/chime.py` into `src/core/chime.ts`, checked against
  `fixtures/core/chime.json` (280 cases). A chime has tens of thousands of
  samples, so each is recorded as its length, its peak, a SHA-256 of the
  samples, the first 64 and every 997th. JavaScript's `sin`, `exp` and `cos`
  could have differed from Python's in the last bit and moved a rounding,
  so this was measured first: all 600,642 samples of the 24 chimes the app
  plays came out the same in Node. The browser test then found the same in
  Chromium, Firefox and WebKit. `test_chime.py` is ported whole (132 tests
  as pytest collects them). The chime styles now live in `chime.ts`, as on
  the desktop, and `settings.ts` passes them on.
- `gui/chime_player.py` as `src/ui/chimePlayer.ts`. No WAV files and no
  temporary folder: the samples play from memory through Web Audio. Making
  the six chimes of a style takes up to about 55 ms, too long at the moment
  a speaker changes, so they are made ahead of time, one per task, as the
  desktop makes them on a thread. A chime that is not ready is missed, not
  waited for. A browser allows sound only after a click or a key press, so
  `unlock()` is called from one. A chime only starts while sound is running
  or being unlocked, because Web Audio would keep one started while blocked
  and play it late.
- The tag and flash rules of `reader_display.py` into
  `src/core/speakerCueDisplay.ts`, checked by hand, as the guide marks were.
  The tag is drawn by `WordDisplay`, the flash and the chime are started by
  `src/ui/useSpeakerCues.ts`, and the engine got `speakers()` for the chime
  patterns.
- The window's words and Listen plan into `src/core/speakerCuesWindow.ts`
  with the desktop's tests for them, and the window as
  `src/ui/SpeakerCuesDialog.tsx`. Its Defaults entry uses the desktop's
  words with one rewording: "and, on Windows, a soft chime" says "and a soft
  chime", since a browser plays it everywhere.

Differences from the desktop, on purpose:

- The chime plays in every browser with Web Audio, not only on Windows.
  Where there is none, the sound part of the window is greyed out with a
  note of its own, and what was saved is kept.
- No flash when the browser asks for less motion, as the brief says.
- Listen unlocks sound itself, so it is heard even with the sound saved as
  Off.
- Apply saves and closes the window, the owner's choice on 2026-11-28. The
  desktop keeps it open and says "Applied.".
- The desktop's switches are tick boxes and its rows of buttons are lists,
  as the web port does everywhere else.

What was run: `npm run check` (2,000 tests at the last code commit) and the
browser tests in Chromium by the assistant. The owner ran all three browsers
up to the wiring (step 5), and CI runs them on every push since. The last
runs before the tag are the owner's, as RELEASING.md says. 99 deliberate
breaks over the steps. The few that were not caught first got a test where
they could matter: the transcript's speaker list after reading again, a
flash started while switched off, the Windows rewording, and Listen playing
the saved sound instead of the one on screen. Two could not matter and stay
noted: `Math.round` against Python's rounding for a chime sample (no real
sample lands on a half), and the end of a flash on Stop, a line that was
then taken out. Screenshots found three layout faults in the speaker list
that no test saw, all fixed.

Found on the way, in the tests and not in the page: Playwright's WebKit for
Windows has no Web Audio, so `e2e/chime.spec.ts` checks there that the page
stays silent without an error, and `e2e/speakerCues.spec.ts` plays into a
stand-in for Web Audio in every browser. The same WebKit stopped drawing
when several of its pages ran at once, so it runs one test at a time on the
owner's machine (`2196f11`).

Not run: the ear check of the chimes next to the desktop, the eye check of
the tag, the flash and the window, and a chime in real Safari.

### 6. The HTML import fix

Done on 2026-11-28 in `0753ac4`, in a commit of its own as the owner asked.
`importHtml` now drops only the element, and the text right after a
`<script>`, `<style>`, `<noscript>` or `<template>` stays. The desktop
drops it with the element, because lxml counts it as part of it. Four of
the desktop's pages and two of its whole-file cases now differ, each listed
with the web's text, which is what a browser shows. A browser test imports
such a page in each browser. Putting the old removal back fails eight
tests.
