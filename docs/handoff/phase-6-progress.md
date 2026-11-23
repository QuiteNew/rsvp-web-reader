# Phase 6 progress: comfort and the rest

Where phase 6 stands, so the work can carry on after a break. The plan is
[phase-6.md](phase-6.md). Phase 5 was called done by the owner on
2026-11-22 and released as `v1.1.0`. Phase 6 started on 2026-11-23.

| Step                                   | State                                     |
| -------------------------------------- | ----------------------------------------- |
| 1. What the desktop app does, and plan | Done, below                               |
| 2. Design notes from the owner         | Done on 2026-11-23, below                 |
| 3. Build, one feature at a time        | 1 of 6 built (letter spacing), below      |
| 4. The owner tries each feature        | Letter spacing is waiting for the owner   |
| 5. The HTML import fix from phase 5    | Not started. Last, in a commit of its own |

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
profiles after the settings they hold have a screen:

1. **Letter spacing.** The level table, the CSS spacing, the eye check of
   the focus letter next to the desktop, the Appearance tab control.
2. **The OpenDyslexic font.** The two files and the license, the switch on
   the Appearance tab, applied at once.
3. **Reading profiles.** The port with fixtures and the three desktop test
   files, the `profiles` field settled, then the Profiles tab.
4. **Bold word starts.** The port of `bold_starts.py` with fixtures. Then
   the display and copying choices for the owner, with their costs, before
   any screen work.
5. **Speaker cues.** The chime maths with fixtures, the sound (the
   recommendation is to port the desktop's sample maths into an
   `AudioBuffer`, to keep the same sound, and compare by ear), the name tag,
   the flash, the speakers window.
6. **The phase 5 HTML fix**, in a commit of its own, as the owner asked:
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
