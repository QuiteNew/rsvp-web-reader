# Phase 6 progress: comfort and the rest

Where phase 6 stands, so the work can carry on after a break. The plan is
[phase-6.md](phase-6.md). Phase 5 was called done by the owner on
2026-11-22 and released as `v1.1.0`. Phase 6 started on 2026-11-23.

| Step                                   | State                                     |
| -------------------------------------- | ----------------------------------------- |
| 1. What the desktop app does, and plan | Done, below                               |
| 2. Design notes from the owner         | Waiting: the list is at the end           |
| 3. Build, one feature at a time        | Not started. The order is under "Plan"    |
| 4. The owner tries each feature        | Not started                               |
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

## Step 2: design notes from the owner

The desktop's design notes are not in its repository. Please copy the ones
you have on these into `reference/desktop-design/`, as for chunking and the
fit and scroll work:

- letter spacing
- the OpenDyslexic font
- reading profiles
- bold word starts, and copying with bold
- speaker cues and the chimes

Whichever exist. If there is none for a feature, the code, the tests and
`docs/usage.md` are the specification, as before. Letter spacing can start
without them, since the plan for it is already set in phase-6.md.
