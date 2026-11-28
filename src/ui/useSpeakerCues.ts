import { useEffect, useRef, useState, type RefObject } from 'react';

import { ChimeGap, chimeLengthMs, chimeNotes, speakerPatterns } from '../core/chime';
import type { Settings, SpeakerCustom } from '../core/models';
import { SPEAKER_FLASH_MS } from '../core/speakerCueDisplay';
import type { Clock, ReaderEngine, TimerHandle } from '../engine/contract';
import type { ChimePlayer } from './chimePlayer';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

// Whether the browser asks for less movement on screen. The flash is a
// sudden change of the whole reading area, so it is left out then, as the
// brief asks. The tag and the chime still say who is speaking.
function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches;
}

interface SpeakerCueParts {
  readonly engine: ReaderEngine;
  // The engine's clock, so the flash and the wait between chimes can be
  // moved by hand in a test.
  readonly clock: Clock;
  // null where there is no sound at all.
  readonly player: ChimePlayer | null;
  readonly preferences: Settings;
  // The open transcript's own speaker list, as saved. null is Automatic.
  readonly custom: SpeakerCustom;
  // The engine calls this when reading moves on into a new speaker's turn.
  // The engine is made before this hook can run, so it is handed a ref.
  readonly newSpeakerRef: RefObject<((speaker: string) => void) | null>;
}

export interface SpeakerCues {
  // Whether a new speaker's flash is showing now.
  readonly flashing: boolean;
  // Ends a flash under way, for a new session.
  readonly endFlash: () => void;
}

// Speaker cues on the page: what the desktop's reader display does with
// set_speaker_cues(), _cue_new_speaker(), the flash and _play_chime().
//
// The settings and the transcript's speaker list reach the session being
// read. When reading moves on into a new turn, the reading area flashes and
// the chime plays, each when it is switched on. The chime goes through
// ChimeGap first, as on the desktop, and one that is not made yet is missed,
// never waited for.
//
// A browser plays sound only after a click or a key press on the page, so
// while a chime sound is chosen the next click or key press unlocks it.
// With the sound off, no sound device is asked for at all.
export function useSpeakerCues({
  engine,
  clock,
  player,
  preferences,
  custom,
  newSpeakerRef,
}: SpeakerCueParts): SpeakerCues {
  const enabled = preferences.speakerCuesEnabled;
  const sound = preferences.speakerCueSound;
  const style = preferences.speakerCueStyle;
  const flashEnabled = preferences.speakerCueFlashEnabled;
  const withSound = enabled && sound !== 'off' && player !== null;

  // A change to Speaker cues, or to the open transcript's speaker list,
  // reaches the session being read. A session made later is made with them
  // (sessionFor in App.tsx), so a call right after a load changes nothing.
  const customKey = JSON.stringify(custom);
  useEffect(() => {
    const list = JSON.parse(customKey) as SpeakerCustom;
    engine.setSpeakerCues(enabled, list === null ? null : new Map(Object.entries(list)));
  }, [engine, enabled, customKey]);

  // Make the chimes of the chosen style ahead of time.
  useEffect(() => {
    if (withSound) player.prepare(style);
  }, [player, withSound, style]);

  // Unlock sound with the next click or key press. Capture, so it happens
  // before the page acts on it: the click on Play then already has sound.
  useEffect(() => {
    if (!withSound) return undefined;
    const unlock = () => {
      player.unlock();
    };
    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, [player, withSound]);

  const [flashing, setFlashing] = useState(false);
  const flashTimer = useRef<TimerHandle | null>(null);
  const [gap] = useState(() => new ChimeGap());

  function endFlash() {
    if (flashTimer.current !== null) clock.clearTimer(flashTimer.current);
    flashTimer.current = null;
    setFlashing(false);
  }

  function startFlash() {
    if (!flashEnabled || reducedMotion()) return;
    if (flashTimer.current !== null) clock.clearTimer(flashTimer.current);
    setFlashing(true);
    flashTimer.current = clock.setTimer(() => {
      flashTimer.current = null;
      setFlashing(false);
    }, SPEAKER_FLASH_MS);
  }

  function playChime(speaker: string) {
    if (player === null || !player.available) return;
    const notes = chimeNotes(sound, speaker, speakerPatterns(engine.speakers()));
    if (notes === null) return;
    if (!gap.allow(clock.now(), chimeLengthMs(notes, style))) return;
    player.play(notes, style);
  }

  // The newest settings for the next speaker, every time the page is drawn.
  useEffect(() => {
    newSpeakerRef.current = (speaker: string) => {
      startFlash();
      playChime(speaker);
    };
  });

  // A flash still waiting to end when the page goes away.
  useEffect(
    () => () => {
      if (flashTimer.current !== null) clock.clearTimer(flashTimer.current);
    },
    [clock],
  );

  // Switching the flash or Speaker cues off ends a flash under way at once.
  return { flashing: flashing && enabled && flashEnabled, endFlash };
}
