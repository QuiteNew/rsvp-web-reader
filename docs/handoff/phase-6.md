# Phase 6: comfort and the rest

Reading profiles, letter spacing, the dyslexia font, bold word starts and
copying with bold, and speaker cues with chimes.

## Ask the owner first

For the design notes on reading profiles, speaker cues, bold starts and
the dyslexia font.

## Reading profiles

Port `core/profiles.py` (224 lines) and `core/profile_apply.py` (94 lines)
with fixtures. A profile is a name and a set of app-wide settings, listed
in `PROFILE_KEYS`. It never holds colours of a transcript, chunking or the
font switch, and a missing key means "leave that setting alone". The guide
mark colour is stored as nothing while it still follows the theme. Settle
the `profiles` field of `Settings` in `core/models.ts`, which is `unknown`
until now. Tests: `test_profiles.py`, `test_profile_apply.py`,
`test_settings_store_profiles.py`.

## Letter spacing

The levels are Off, Small, Medium and Large: 0, 0.10, 0.18 and 0.30 em
between letters, and the gap between words grows by twice that
(`core/letter_spacing.py`). The desktop builds the gaps from thin space
characters because its toolkit has no letter spacing. CSS has
`letter-spacing` and `word-spacing`, so the plan is to port only the level
table and `clamp_level`, and drop the rest. Before dropping it, check by
eye: CSS adds the gap after the last letter too, which can move the focus
letter off its spot. Show the owner both levels side by side with the
desktop app.

## The dyslexia font

Bundle the same fonts as the desktop app (`assets/fonts/` in the desktop
repository: Fredoka, Quicksand, OpenDyslexic), as web fonts, with their SIL
OFL licence texts shipped next to them. Read the licence files there before
converting or subsetting anything. The switch can apply at once on the
web. Fonts are served from the site itself, never from a font service.

## Bold word starts, and copying with bold

Port `core/bold_starts.py` (218 lines, 48 tests) with fixtures:
`fixation_length` and `bold_ranges`. The ranges count characters the Python
way.

Two things need a decision from the owner before building:

- Where the bold shows. On the desktop it is the edit box. A plain
  `<textarea>` cannot show bold, so the choices are a read-only view beside
  the editor, or an editable rich area. Lay out both with their costs.
- Copying. `bold_spans` and `rich_copy` are not ported in that form. In the
  browser, the `copy` event with `setData('text/html', ...)` next to
  `text/plain` is the likely route, and `ClipboardItem` the other. Check
  current support in Chromium, Firefox and WebKit. `core/rich_copy.py` and
  `test_rich_copy.py` say what the desktop puts on the clipboard.

Keep the desktop README's note that "Bionic Reading" is someone else's
trademark, and do not use that name in the app.

## Speaker cues

The core is done: `speakers.ts`, and the session's turns and pause. Left:

- The name tag (above the word, or top right), at half the word size.
- The flash at a new speaker: about 330 ms, the background moved 18
  percent towards the highlight colour. Not shown when the person asked
  for reduced motion.
- The speakers window, built on `speakerRows`, `speakerRowName` and
  `speakersToSave`. See `speaker_cues_window.py` and its tests.
- The chimes. Port the pure part of `core/chime.py` with fixtures:
  `speaker_patterns`, `chime_notes`, `chime_length_ms` and `ChimeGap` (no
  two chimes closer than 400 ms). For the sound itself, the choice is to
  port the sample maths of `chime_wav` into an `AudioBuffer`, which keeps
  the desktop sound, or to rebuild each style from Web Audio oscillators.
  Recommend the first, and compare by ear with the desktop app.
- Browsers allow sound only after a click or a key press. Create or resume
  the `AudioContext` from the first press of Play.
- The engine's `onNewSpeaker` event is where the chime and the flash start.

Tests: `test_chime.py` (49), `test_chime_player.py`,
`test_reader_display_speaker_cues.py`, `test_speaker_cues_wiring.py`,
`test_speaker_cues_settings_in_app.py`, `test_settings_store_speaker_cues.py`.

## Done when

Each feature is switched on and tried by the owner next to the desktop
app, and the owner confirmed the phase.
