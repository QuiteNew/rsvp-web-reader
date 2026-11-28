import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';

import { APP_NAME } from '../core/appInfo';
import { currentSpace, findTranscript } from '../core/library';
import type { Library, Settings, Transcript } from '../core/models';
import { pyRound } from '../core/pythonText';
import { ReaderSession } from '../core/reader';
import { canRevert, toggleNormalization } from '../core/normalizer';
import { pyStrip } from '../core/pythonText';
import { transcriptToReopen } from '../core/reopen';
import { blendColors } from '../core/colors';
import { fitCandidates } from '../core/fit';
import { PERIPHERAL_CONTEXT_DIM } from '../core/guideMarks';
import { letterGapEm } from '../core/letterSpacing';
import { flashBackground, speakerTagColor, speakerTagName } from '../core/speakerCueDisplay';
import { themeGuideMarkColor, themeReadingColors } from '../core/theme';
import { CHUNK_SIZE_RANGE, FONT_SIZE_RANGE, WPM_RANGE } from '../core/settings';
import { formatDuration } from '../core/timing';
import { WPM_KEY_STEP } from '../core/wpmStep';
import { browserClock } from '../engine/browserClock';
import type { ReaderEvents } from '../engine/contract';
import type { ChunkingChoice, StorageHealth } from '../store/contract';
import type { SavedLibraryStore } from '../store/libraryStore';
import type { SavedSettingsStore } from '../store/settingsStore';
import styles from './App.module.css';
import { Dialog, MessageDialog, NameDialog } from './Dialog';
import dialogStyles from './Dialog.module.css';
import { BoldText } from './BoldText';
import { BookmarksDialog } from './BookmarksDialog';
import { ChimePlayer } from './chimePlayer';
import { ChunkingDialog } from './ChunkingDialog';
import { IMPORT_ACCEPT, largeImportWarning, readPickedFile } from './fileImport';
import {
  BoldStartsIcon,
  BookmarkIcon,
  NormalizeIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  RestartIcon,
  RevertIcon,
} from './Icons';
import { Scrubber } from './Scrubber';
import { SettingsDialog } from './SettingsDialog';
import { Sidebar } from './Sidebar';
import { SpeakerCuesDialog } from './SpeakerCuesDialog';
import { SpacesDialog } from './SpacesDialog';
import { useReaderEngine, type ReaderEngineParts } from './useReaderEngine';
import { usePointerLetsGoOfFocus } from './usePointerLetsGoOfFocus';
import { useShortcuts } from './useShortcuts';
import { useSpeakerCues } from './useSpeakerCues';
import { useFontSet } from './useFontSet';
import { useTheme } from './useTheme';
import { WordDisplay } from './WordDisplay';

// The chunking a transcript has now, in the shape the store takes.
function chunkingOf(transcript: Transcript): ChunkingChoice {
  return {
    enabled: transcript.chunkingEnabled,
    size: transcript.chunkSize,
    mode: transcript.chunkMode,
    charTarget: transcript.chunkCharTarget,
  };
}

// A colour of the open transcript in the footer: its name, then a small
// rounded square in that colour that opens the browser's colour picker.
function ColorSwatch({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (color: string) => void;
}) {
  return (
    <label className={styles.swatchRow}>
      <span>{label}</span>
      <input
        type="color"
        className={styles.swatch}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  );
}

// How long a short message beside Start reading stays, as on the desktop.
const FEEDBACK_MS = 2000;

// The colour of the surrounding-words line: the font colour dimmed toward
// the background. A transcript with a colour that cannot be blended (the
// saved file was edited by hand) gets its plain font colour.
function dimmed(transcript: Transcript | null): string {
  if (transcript === null) return 'inherit';
  try {
    return blendColors(transcript.fontColor, transcript.backgroundColor, PERIPHERAL_CONTEXT_DIM);
  } catch {
    return transcript.fontColor;
  }
}

// The speed slider's ends and its step, the desktop app's.
const [WPM_MIN, WPM_MAX] = WPM_RANGE;
const WPM_STEP = WPM_KEY_STEP;

type OpenDialog =
  | { readonly kind: 'none' }
  | { readonly kind: 'addChoice' }
  | { readonly kind: 'addTranscript' }
  | { readonly kind: 'importing'; readonly name: string }
  | { readonly kind: 'importFailed'; readonly message: string }
  | {
      readonly kind: 'addImported';
      readonly title: string;
      readonly text: string;
      readonly warning: string | undefined;
    }
  | { readonly kind: 'newSpace' }
  | { readonly kind: 'spaces' }
  | { readonly kind: 'settings' }
  | { readonly kind: 'bookmarks' }
  | { readonly kind: 'deleteTranscript'; readonly transcript: Transcript };

const NO_DIALOG: OpenDialog = { kind: 'none' };

// Time left, the way the desktop toolbar shows it.
function timeLeft(remainingMs: number): string {
  return formatDuration(Math.max(0, pyRound(remainingMs / 1000)));
}

// A session for this transcript, at the word it was left on, or null when
// its text has no words. One that was read to the end starts again from
// the first word. Length pacing, the warm-up and Speaker cues are settings
// for every transcript, so they come from the settings, as on the desktop.
// The speaker list is the transcript's own.
function sessionFor(transcript: Transcript, preferences: Settings): ReaderSession | null {
  const session = new ReaderSession(transcript.rawText, {
    wpm: transcript.wpm,
    lengthPacingEnabled: preferences.lengthPacingEnabled,
    warmUpEnabled: preferences.warmUpEnabled,
    speakerCuesEnabled: preferences.speakerCuesEnabled,
    speakerCustom: transcript.speakerCustom,
    chunkEnabled: transcript.chunkingEnabled,
    chunkSize: transcript.chunkSize,
    chunkMode: transcript.chunkMode,
    chunkCharTarget: transcript.chunkCharTarget,
  });
  if (session.totalWords === 0) return null;
  if (transcript.position > 0 && transcript.position < session.totalWords) {
    session.seekTo(transcript.position);
  }
  return session;
}

// The transcript that was open when the page was last used, if it is to be
// opened again and still exists.
function transcriptOpenLast(library: Library, settings: Settings): Transcript | null {
  return transcriptToReopen(
    settings.reopenLastTranscript,
    settings.lastTranscriptId,
    library.transcripts,
  );
}

export interface AppProps extends ReaderEngineParts {
  // The saved library. main.tsx passes the one kept in the browser.
  readonly store: SavedLibraryStore;
  // The saved settings. main.tsx passes the ones kept in the browser.
  readonly settings: SavedSettingsStore;
  // Asked to keep the data once there is something worth keeping.
  readonly health?: StorageHealth;
  // Plays the speaker cue chimes. Tests hand in one with a stand-in for
  // Web Audio. Left out, the page makes its own. null is no sound at all.
  readonly chimePlayer?: ChimePlayer | null;
}

// The whole page: the transcripts on the left, and on the right the open
// transcript, either as text to edit or as words being read.
//
// The library is saved in the browser by the store. Until the store has
// read what was saved, the page shows nothing that could be changed.
export function App({ store, settings, health, chimePlayer, ...parts }: AppProps) {
  const ready = useSyncExternalStore(store.subscribe, store.isReady);
  const damagedNotice = useSyncExternalStore(store.subscribe, store.damagedNotice);
  const saveProblem = useSyncExternalStore(store.subscribe, store.saveProblem);
  const library = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const preferences = useSyncExternalStore(settings.subscribe, settings.getSnapshot);
  const damagedSettings = useSyncExternalStore(settings.subscribe, settings.damagedNotice);
  const settingsProblem = useSyncExternalStore(settings.subscribe, settings.saveProblem);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(NO_DIALOG);
  // A short message beside Start reading, such as "Nothing to change".
  const [feedback, setFeedback] = useState('');
  const feedbackTimer = useRef<number | null>(null);
  function showFeedback(message: string) {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    setFeedback(message);
    feedbackTimer.current = window.setTimeout(() => {
      feedbackTimer.current = null;
      setFeedback('');
    }, FEEDBACK_MS);
  }
  useEffect(
    () => () => {
      if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    },
    [],
  );
  // The Chunking window opens over Settings, which stays open under it.
  const [chunkingOpen, setChunkingOpen] = useState(false);
  // So does the Speaker cues window.
  const [speakerCuesOpen, setSpeakerCuesOpen] = useState(false);
  const [problem, setProblem] = useState('');

  const space = currentSpace(library);
  const inSpace = library.transcripts.filter((transcript) => transcript.space === space);
  const selected = inSpace.find((transcript) => transcript.id === selectedId) ?? null;

  // Reading moving on into a new speaker's turn is passed to Speaker cues
  // (useSpeakerCues below), which needs the engine, so the engine is given a
  // way through to it.
  const newSpeakerRef = useRef<((speaker: string) => void) | null>(null);
  const [engineEvents] = useState<ReaderEvents>(() => ({
    onNewSpeaker: (speaker) => newSpeakerRef.current?.(speaker),
  }));
  const [engine, snapshot] = useReaderEngine(parts, engineEvents);
  const [player] = useState(() => (chimePlayer === undefined ? new ChimePlayer() : chimePlayer));
  const clock = parts.clock ?? browserClock;
  const cues = useSpeakerCues({
    engine,
    clock,
    player,
    preferences,
    custom: selected?.speakerCustom ?? null,
    newSpeakerRef,
  });
  const skipWords = preferences.skipWordCount;

  // Light, Dark or System, put on the page. The colours that follow the theme
  // (a transcript's reading colours that were not picked by hand, and the
  // guide marks) are given the theme's colours once the saved library is
  // there, and again whenever the theme or the Defaults change. The desktop
  // does this only when it starts. The page changes at once, so its reading
  // colours do too.
  const isDark = useTheme(preferences.appearanceMode);
  useFontSet(preferences.dyslexiaFontEnabled);

  // The surrounding-words line is built by the engine only when it is on.
  const showContext = preferences.peripheralContextEnabled;
  const boldStarts = preferences.boldStartsEnabled;
  useEffect(() => {
    engine.setPeripheralContext(showContext);
  }, [engine, showContext]);
  const scrubPause = preferences.scrubPauseEnabled;
  const rewindWords = preferences.resumeRewindEnabled ? preferences.resumeRewindWords : 0;
  useEffect(() => {
    engine.setBehaviour({ scrubPauseEnabled: scrubPause, resumeRewindWords: rewindWords });
  }, [engine, scrubPause, rewindWords]);
  // Length pacing and the warm-up reach the session being read at once.
  // A session made later is made with them (sessionFor).
  const lengthPacing = preferences.lengthPacingEnabled;
  const warmUp = preferences.warmUpEnabled;
  useEffect(() => {
    engine.setLengthPacingEnabled(lengthPacing);
  }, [engine, lengthPacing]);
  useEffect(() => {
    engine.setWarmUpEnabled(warmUp);
  }, [engine, warmUp]);
  const lightDefaults = {
    font: preferences.defaultFontColor,
    highlight: preferences.defaultHighlightColor,
    background: preferences.defaultBackgroundColor,
  };
  const {
    font: themeFont,
    highlight: themeHighlight,
    background: themeBackground,
  } = themeReadingColors(isDark, lightDefaults);
  useEffect(() => {
    if (!ready) return;
    store.resyncDefaultReadingColors(themeFont, themeHighlight, themeBackground);
  }, [store, ready, themeFont, themeHighlight, themeBackground]);
  useEffect(() => {
    settings.resyncGuideMarkColorDefault(themeGuideMarkColor(isDark));
  }, [settings, isDark]);
  const isReading = snapshot.status !== 'empty';
  // The longest chunks of the transcript being read, for fitting the font.
  // They change only when the words are grouped again: another transcript,
  // another text, or a change to its chunking.
  const fitKey =
    selected === null || !isReading
      ? ''
      : [
          selected.id,
          snapshot.totalWords,
          selected.chunkingEnabled,
          selected.chunkSize,
          selected.chunkMode,
          selected.chunkCharTarget,
        ].join('|');
  const fitTexts = useMemo(
    () => (fitKey === '' ? [] : fitCandidates(engine.chunkTexts())),
    [engine, fitKey],
  );

  // How far a flash too wide for the row is slid sideways with the
  // scrollbar. It is not saved: like the desktop, every new reading session
  // starts centred.
  const [pan, setPan] = useState(0);
  const panKey = `${selected?.id ?? ''}|${isReading ? snapshot.totalWords : ''}`;
  const [panFor, setPanFor] = useState(panKey);
  if (panFor !== panKey) {
    setPanFor(panKey);
    setPan(0);
  }

  // The word a new bookmark would go on. null when there is none, as at the end.
  const bookmarkHere = isReading ? engine.bookmarkTarget() : null;
  // Whether the Normalize button offers to put the original text back.
  const offersRevert =
    selected !== null &&
    canRevert(selected.rawText, selected.preNormalizeText, selected.normalizedText);

  // Remember where the open transcript is being read, word by word, so
  // that stopping and starting again picks up at the same place. Reading is
  // always of the selected transcript, so that is whose position moves.
  const readingId = isReading ? (selected?.id ?? null) : null;
  const readingIndex = snapshot.index;
  const isPlaying = snapshot.status === 'playing';
  useEffect(() => {
    if (readingId === null) return;
    store.setPosition(readingId, readingIndex);
    // While words go by, the store saves at most once a second. When the
    // reader is not playing, the position moved because the person moved it
    // (a skip, a drag) or because they just paused. Write that at once, so a
    // reload right after cannot lose it.
    if (!isPlaying) void store.flush();
  }, [store, readingId, readingIndex, isPlaying]);

  useEffect(() => {
    void store.load();
  }, [store]);

  // A tab can be closed or put away with no warning. Write what is still
  // waiting whenever the page is hidden. "pagehide" covers the cases where
  // "visibilitychange" does not fire.
  useEffect(() => {
    const save = () => {
      if (document.visibilityState === 'hidden') void store.flush();
    };
    const leave = () => {
      void store.flush();
    };
    document.addEventListener('visibilitychange', save);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', save);
      window.removeEventListener('pagehide', leave);
    };
  }, [store]);

  function closeDialog() {
    setDialog(NO_DIALOG);
  }

  // A new transcript in the current Space, with what Settings holds for a
  // new transcript, opened as text to edit. Text from a file goes into the
  // text box as if it had been pasted, so it is read through first and
  // started when the reader chooses, as on the desktop.
  function addTranscript(title: string, text = '') {
    const added = store.addTranscript({
      title,
      space,
      wpm: preferences.defaultWpm,
      fontColor: themeFont,
      highlightColor: themeHighlight,
      backgroundColor: themeBackground,
      fontSize: preferences.defaultFontSize,
      chunkingEnabled: preferences.defaultChunkingEnabled,
      chunkSize: preferences.defaultChunkSize,
      chunkMode: preferences.defaultChunkMode,
      chunkCharTarget: preferences.defaultChunkCharTarget,
    });
    if (text !== '') store.setText(added.id, text);
    store.setStopped(added.id, true);
    open(added.id);
    // Now there is something to lose, so ask the browser to keep it.
    void health?.requestPersistence();
  }

  // The file picker. It is an <input> that is always on the page but never
  // seen, because "Add from file..." has to open it straight from its click:
  // a browser only opens a file picker as the direct answer to a click.
  const filePicker = useRef<HTMLInputElement>(null);
  // Counts the imports started. Closing the Importing notice counts as
  // one more, so the answer for the file that was dropped is not shown.
  const importRun = useRef(0);

  async function importPicked(file: File) {
    importRun.current += 1;
    const run = importRun.current;
    setDialog({ kind: 'importing', name: file.name });
    const result = await readPickedFile(file);
    if (run !== importRun.current) return;
    if (result.kind === 'error') {
      setDialog({ kind: 'importFailed', message: result.message });
    } else {
      setDialog({
        kind: 'addImported',
        title: result.title,
        text: result.text,
        warning: largeImportWarning(result.text),
      });
    }
  }

  // Everything that leaves the open transcript goes through here, so a
  // session never keeps running behind another transcript.
  //
  // A transcript that was left in the reader comes back in the reader,
  // paused on the word it was left on, as on the desktop. One that was left
  // as text comes back as text.
  function open(id: number | null) {
    engine.unload();
    cues.endFlash();
    // The position is saved at most once a second while reading. Leaving
    // is the moment to write the last one.
    void store.flush();
    setProblem('');
    setSelectedId(id);
    settings.set('lastTranscriptId', id);
    const transcript = id === null ? null : findTranscript(store.getSnapshot(), id);
    if (transcript === null || transcript.isStopped) return;
    const session = sessionFor(transcript, settings.getSnapshot());
    if (session === null) return;
    engine.load(session, true);
    store.setPaused(transcript.id, true);
  }

  // After a reload, open the transcript that was open, the same way. The
  // choice is made once, when the saved library has been read: which one
  // is selected is decided while rendering, and the reader is loaded in
  // the effect, because that reaches outside React.
  const [choseAtStart, setChoseAtStart] = useState(false);
  if (ready && !choseAtStart) {
    setChoseAtStart(true);
    setSelectedId(transcriptOpenLast(store.getSnapshot(), settings.getSnapshot())?.id ?? null);
  }
  const reopened = useRef(false);
  useEffect(() => {
    if (!ready || reopened.current) return;
    reopened.current = true;
    const library = store.getSnapshot();
    const last = transcriptOpenLast(library, settings.getSnapshot());
    if (last === null) return;
    if (last.space !== currentSpace(library)) store.switchToSpace(last.space);
    if (last.isStopped) return;
    const session = sessionFor(last, settings.getSnapshot());
    if (session === null) return;
    engine.load(session, true);
    store.setPaused(last.id, true);
  }, [ready, store, settings, engine]);

  function startReading(transcript: Transcript) {
    const session = sessionFor(transcript, settings.getSnapshot());
    if (session === null) {
      // Only spaces, or only timestamps, which are taken out before reading.
      setProblem('There are no words to read in that text.');
      return;
    }
    setProblem('');
    store.setStopped(transcript.id, false);
    store.setPaused(transcript.id, false);
    // Starting to read ends Normalize's way back, as on the desktop, where
    // Start reading saves the text and an empty draft.
    if (transcript.preNormalizeText !== '') store.setNormalization(transcript.id, '', '');
    cues.endFlash();
    engine.load(session);
  }

  function changeWpm(transcript: Transcript, wpm: number) {
    store.setWpm(transcript.id, wpm);
    engine.setWpm(wpm);
  }

  // A change to the open transcript's chunking: saved, and the words on
  // screen are grouped again at once. The reader keeps its word and snaps to
  // the start of the group that holds it.
  function changeChunking(transcript: Transcript, choice: ChunkingChoice) {
    store.setChunking(transcript.id, choice);
    engine.setChunking(choice.enabled, choice.size, choice.mode, choice.charTarget);
  }

  // Skip by words. With "Pause playback when skipping" on it also pauses,
  // and the state it ends in is saved, as the desktop's _skip does.
  function skip(delta: number) {
    engine.skip(delta, preferences.pauseOnSkip);
    if (selected !== null && preferences.pauseOnSkip) store.setPaused(selected.id, true);
  }

  function togglePause() {
    if (snapshot.status === 'finished') return;
    engine.togglePause();
    // Saved, so the transcript comes back the way it was left.
    if (selected !== null) store.setPaused(selected.id, snapshot.status === 'playing');
  }

  function stopReading() {
    engine.unload();
    if (selected !== null) store.setStopped(selected.id, true);
    void store.flush();
  }

  // Add a bookmark at the current word, or remove the one that is there.
  function toggleBookmarkHere() {
    if (selected === null || bookmarkHere === null) return;
    if (selected.bookmarks.some((bookmark) => bookmark.index === bookmarkHere.index)) {
      store.removeBookmark(selected.id, bookmarkHere.index);
    } else {
      store.addBookmark(selected.id, bookmarkHere.index, bookmarkHere.snippet);
    }
  }

  // The speaker name tag for the word on screen, or null for none.
  function speakerTagFor(transcript: Transcript) {
    const name = speakerTagName(
      snapshot.speaker,
      preferences.speakerCuesEnabled && preferences.speakerCueNameTagEnabled,
    );
    if (name === null) return null;
    return {
      name,
      position: preferences.speakerCueTagPosition,
      color: speakerTagColor(
        transcript.fontColor,
        transcript.backgroundColor,
        transcript.highlightColor,
        cues.flashing,
      ),
    };
  }

  // The reading shortcuts: only while the reader is on screen and no dialog
  // is open over it (Escape then closes the dialog, as it should).
  // A click leaves no control holding the keyboard, as on the desktop.
  usePointerLetsGoOfFocus();

  useShortcuts(ready && isReading && dialog.kind === 'none', (action) => {
    if (action === 'togglePause') togglePause();
    else if (action === 'skipBack') skip(-skipWords);
    else if (action === 'skipForward') skip(skipWords);
    else if (action === 'restart') engine.restart();
    else if (action === 'stop') stopReading();
    else if (action === 'centerPan') setPan(0);
    else toggleBookmarkHere();
  });

  // A new text for the transcript, typed or from Normalize. As in the
  // desktop's _handle_draft_changed: Normalize's way back lasts only while
  // the text is still what normalizing made (spaces at the ends aside).
  function changeText(transcript: Transcript, text: string) {
    if (text === transcript.rawText) return;
    store.setText(transcript.id, text);
    // A changed text is read from its first word again.
    store.setPosition(transcript.id, 0);
    setProblem('');
    if (
      transcript.preNormalizeText !== '' &&
      !canRevert(text, transcript.preNormalizeText, transcript.normalizedText)
    ) {
      store.setNormalization(transcript.id, '', '');
    }
  }

  // One click of Normalize: tidy the text and keep the original, or, while
  // the text is still the tidied one, put the original back. The way back
  // is saved first, so the text change right after is not taken for an
  // edit. As on the desktop, "Nothing to change" shows for two seconds when
  // the text stays as it was.
  function normalize(transcript: Transcript) {
    const before = pyStrip(transcript.rawText);
    const result = toggleNormalization(
      transcript.rawText,
      transcript.preNormalizeText,
      transcript.normalizedText,
      preferences.splitLongParagraphsEnabled,
    );
    store.setNormalization(transcript.id, result.preNormalizeText, result.normalizedText);
    const now = findTranscript(store.getSnapshot(), transcript.id) ?? transcript;
    changeText(now, result.text);
    if (result.text === before) showFeedback('Nothing to change');
  }

  if (!ready) {
    return (
      <div className={styles.app}>
        <main className={styles.main}>
          <p role="status" className={styles.notice}>
            Opening your library…
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      <Sidebar
        transcripts={inSpace}
        selectedId={selected?.id ?? null}
        space={space}
        onSelect={open}
        onAdd={() => {
          setDialog({ kind: 'addChoice' });
        }}
        onDelete={(transcript) => {
          setDialog({ kind: 'deleteTranscript', transcript });
        }}
        onPickSpace={() => {
          setDialog({ kind: 'spaces' });
        }}
        onNewSpace={() => {
          setDialog({ kind: 'newSpace' });
        }}
      />

      <main className={styles.main}>
        {damagedNotice !== null && (
          <p role="alert" className={styles.notice}>
            {damagedNotice}{' '}
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => {
                store.clearDamagedNotice();
              }}
            >
              OK
            </button>
          </p>
        )}
        {saveProblem !== null && (
          <p role="alert" className={styles.notice}>
            {saveProblem}
          </p>
        )}
        {damagedSettings !== null && (
          <p role="alert" className={styles.notice}>
            {damagedSettings}{' '}
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => {
                settings.clearDamagedNotice();
              }}
            >
              OK
            </button>
          </p>
        )}
        {settingsProblem !== null && (
          <p role="alert" className={styles.notice}>
            {settingsProblem}
          </p>
        )}
        <div className={styles.head}>
          <h1 className={styles.heading} title={selected?.title}>
            {selected?.title ?? APP_NAME}
          </h1>
          <button
            type="button"
            className={styles.settings}
            onClick={() => {
              setDialog({ kind: 'settings' });
            }}
          >
            Settings
          </button>
        </div>

        {selected !== null && (
          // The desktop's toolbar row: Stop at the left, the position slider
          // next to it while reading, and at the right the time left, the
          // percent, Pause, Restart and Bookmarks. It stays over the text box
          // too, as on the desktop, where its buttons then do nothing.
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.pill}
              aria-label="Stop reading"
              title="Stop reading (Esc)"
              aria-disabled={!isReading}
              onClick={() => {
                if (isReading) stopReading();
              }}
            >
              <PowerIcon />
            </button>
            {isReading && (
              <div className={styles.scrubSlot}>
                <Scrubber
                  total={snapshot.totalWords}
                  index={snapshot.index}
                  bookmarks={selected.bookmarks.map((bookmark) => bookmark.index)}
                  onMove={(index) => {
                    engine.scrubMove(index);
                  }}
                  onEnd={() => {
                    if (!engine.getSnapshot().isScrubbing) return;
                    engine.scrubEnd();
                    // The state it ends in (paused or going on) is saved once,
                    // like a pause made by hand.
                    store.setPaused(selected.id, engine.getSnapshot().status !== 'playing');
                  }}
                />
              </div>
            )}
            <span className={styles.spring} />
            {isReading && (
              <>
                <span className={styles.readout} title="Time left">
                  {timeLeft(snapshot.remainingMs)}
                </span>
                <span className={styles.readout}>{snapshot.percent}%</span>
              </>
            )}
            <button
              type="button"
              className={styles.pill}
              aria-label={snapshot.status === 'playing' ? 'Pause' : 'Play'}
              title={snapshot.status === 'playing' ? 'Pause (Space)' : 'Play (Space)'}
              aria-disabled={!isReading || snapshot.status === 'finished'}
              onClick={() => {
                if (isReading) togglePause();
              }}
            >
              {snapshot.status === 'playing' ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              className={styles.pill}
              aria-label="Restart"
              title="Restart (R)"
              aria-disabled={!isReading}
              onClick={() => {
                if (isReading) engine.restart();
              }}
            >
              <RestartIcon />
            </button>
            <button
              type="button"
              className={styles.pill}
              aria-label="Bookmarks"
              title="Bookmarks (B adds or removes one here)"
              aria-disabled={!isReading}
              onClick={() => {
                if (isReading) setDialog({ kind: 'bookmarks' });
              }}
            >
              <BookmarkIcon />
            </button>
          </div>
        )}

        {selected === null ? (
          <div className={styles.work}>
            <p className={styles.welcome}>
              Add a transcript with the + on the left, paste a text into it, and read it one word at
              a time.
            </p>
          </div>
        ) : isReading ? (
          <div className={styles.work}>
            <div
              className={styles.stage}
              style={
                selected === null
                  ? undefined
                  : ({
                      '--reading-font': selected.fontColor,
                      '--reading-highlight': selected.highlightColor,
                      // Warmed toward the highlight while a new speaker flashes.
                      '--reading-background': cues.flashing
                        ? flashBackground(selected.backgroundColor, selected.highlightColor)
                        : selected.backgroundColor,
                    } as CSSProperties)
              }
            >
              <WordDisplay
                chunk={snapshot.chunk}
                fontSize={selected?.fontSize ?? 40}
                fitTexts={fitTexts}
                offsetPx={preferences.highlightOffsetPx}
                context={snapshot.context}
                contextColor={dimmed(selected)}
                pan={pan}
                onPanChange={setPan}
                letterGap={letterGapEm(preferences.letterSpacingLevel)}
                speakerTag={speakerTagFor(selected)}
                marks={{
                  visible: snapshot.status === 'playing',
                  horizontal: preferences.guideMarkHorizontalEnabled,
                  thicknessPx: preferences.guideMarkThicknessPx,
                  lengthPercent: preferences.guideMarkLengthPercent,
                  color: preferences.guideMarkColor,
                }}
              />
              {snapshot.status === 'finished' && <p className={styles.end}>End of the text.</p>}
            </div>
          </div>
        ) : (
          <form
            className={styles.work}
            onSubmit={(event) => {
              event.preventDefault();
              startReading(selected);
            }}
          >
            {boldStarts ? (
              <BoldText
                className={`${styles.text} ${styles.boldView}`}
                label="Transcript text"
                placeholder="Turn off bold word starts to type or paste here."
                text={selected.rawText}
              />
            ) : (
              <textarea
                className={styles.text}
                aria-label="Transcript text"
                placeholder="Paste a transcript or any text here."
                value={selected.rawText}
                onChange={(event) => {
                  changeText(selected, event.target.value);
                }}
              />
            )}
            {problem !== '' && (
              <p role="alert" className={styles.problem}>
                {problem}
              </p>
            )}
            <div className={styles.startRow}>
              <div className={styles.editTools}>
                <button
                  type="button"
                  className={styles.normalize}
                  aria-label={offersRevert ? 'Revert to the original text' : 'Normalize the text'}
                  title={offersRevert ? 'Revert to the original text' : 'Normalize the text'}
                  onClick={() => {
                    normalize(selected);
                  }}
                >
                  {offersRevert ? <RevertIcon /> : <NormalizeIcon />}
                </button>
                {/* Bold word starts: a look for the text box only, never the
                    reader. Saved at once, as on the desktop. */}
                <button
                  type="button"
                  className={styles.normalize}
                  aria-label="Bold word starts"
                  aria-pressed={boldStarts}
                  title="Bold word starts. The text is read only while they are on."
                  onClick={() => {
                    settings.set('boldStartsEnabled', !boldStarts);
                  }}
                >
                  <BoldStartsIcon on={boldStarts} />
                </button>
              </div>
              <button
                type="submit"
                className={styles.start}
                disabled={selected.rawText.trim() === ''}
              >
                Start reading
              </button>
              <span className={styles.feedback} role="status">
                {feedback}
              </span>
            </div>
          </form>
        )}

        {/* The desktop's footer: the font and background colours on the
            left, the speed with the skip buttons and Group in the middle, the
            word size and the highlight colour on the right. It is there with
            no transcript open too, empty, so it lines up with the Space band. */}
        <div className={styles.band}>
          {selected !== null && (
            <>
              <div className={styles.bandSide}>
                <ColorSwatch
                  label="Font"
                  value={selected.fontColor}
                  onChange={(color) => {
                    store.setFontColor(selected.id, color);
                  }}
                />
                <ColorSwatch
                  label="Background"
                  value={selected.backgroundColor}
                  onChange={(color) => {
                    store.setBackgroundColor(selected.id, color);
                  }}
                />
              </div>
              <div className={styles.bandMiddle}>
                <output className={styles.wpm} htmlFor="speed">
                  {selected.wpm} WPM
                </output>
                <div className={styles.speedRow}>
                  <button
                    type="button"
                    className={styles.skipButton}
                    aria-label={`Back ${skipWords} words`}
                    title={`Back ${skipWords} words`}
                    disabled={!isReading}
                    onClick={() => {
                      skip(-skipWords);
                    }}
                  >
                    {'<<'}
                  </button>
                  <input
                    id="speed"
                    type="range"
                    className={styles.slider}
                    aria-label="Speed"
                    min={WPM_MIN}
                    max={WPM_MAX}
                    step={WPM_STEP}
                    value={selected.wpm}
                    onChange={(event) => {
                      changeWpm(selected, Number(event.target.value));
                    }}
                  />
                  <button
                    type="button"
                    className={styles.skipButton}
                    aria-label={`Forward ${skipWords} words`}
                    title={`Forward ${skipWords} words`}
                    disabled={!isReading}
                    onClick={() => {
                      skip(skipWords);
                    }}
                  >
                    {'>>'}
                  </button>
                </div>
                <div className={styles.stepRow}>
                  <label className={styles.switchLabel}>
                    <input
                      type="checkbox"
                      role="switch"
                      className={styles.switch}
                      checked={selected.chunkingEnabled}
                      onChange={(event) => {
                        changeChunking(selected, {
                          ...chunkingOf(selected),
                          enabled: event.target.checked,
                        });
                      }}
                    />
                    Group
                  </label>
                  <button
                    type="button"
                    className={styles.tiny}
                    aria-label="Fewer words per group"
                    disabled={selected.chunkSize <= CHUNK_SIZE_RANGE[0]}
                    onClick={() => {
                      changeChunking(selected, {
                        ...chunkingOf(selected),
                        size: selected.chunkSize - 1,
                      });
                    }}
                  >
                    -
                  </button>
                  <output aria-label="Words per group" className={styles.stepValue}>
                    {selected.chunkSize}
                  </output>
                  <button
                    type="button"
                    className={styles.tiny}
                    aria-label="More words per group"
                    disabled={selected.chunkSize >= CHUNK_SIZE_RANGE[1]}
                    onClick={() => {
                      changeChunking(selected, {
                        ...chunkingOf(selected),
                        size: selected.chunkSize + 1,
                      });
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className={styles.bandSide}>
                <div className={styles.stepRow}>
                  <button
                    type="button"
                    className={styles.tiny}
                    aria-label="Smaller words"
                    disabled={selected.fontSize <= FONT_SIZE_RANGE[0]}
                    onClick={() => {
                      store.setFontSize(
                        selected.id,
                        Math.max(FONT_SIZE_RANGE[0], selected.fontSize - preferences.fontSizeStep),
                      );
                    }}
                  >
                    -
                  </button>
                  <output aria-label="Word size" className={styles.sizeValue}>
                    {selected.fontSize}px
                  </output>
                  <button
                    type="button"
                    className={styles.tiny}
                    aria-label="Larger words"
                    disabled={selected.fontSize >= FONT_SIZE_RANGE[1]}
                    onClick={() => {
                      store.setFontSize(
                        selected.id,
                        Math.min(FONT_SIZE_RANGE[1], selected.fontSize + preferences.fontSizeStep),
                      );
                    }}
                  >
                    +
                  </button>
                </div>
                <ColorSwatch
                  label="Highlight"
                  value={selected.highlightColor}
                  onChange={(color) => {
                    store.setHighlightColor(selected.id, color);
                  }}
                />
              </div>
            </>
          )}
        </div>
      </main>

      <input
        ref={filePicker}
        type="file"
        accept={IMPORT_ACCEPT}
        className={dialogStyles.unseen}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Emptied, so picking the same file again is still a change.
          event.currentTarget.value = '';
          if (file !== undefined) void importPicked(file);
        }}
      />

      {dialog.kind === 'addChoice' && (
        <Dialog title="Add Transcript" onClose={closeDialog}>
          <p className={dialogStyles.note}>How would you like to add a transcript?</p>
          <div className={dialogStyles.choices}>
            <button
              type="button"
              className={dialogStyles.action}
              onClick={() => {
                setDialog({ kind: 'addTranscript' });
              }}
            >
              Blank transcript
            </button>
            <button
              type="button"
              className={dialogStyles.action}
              onClick={() => {
                closeDialog();
                filePicker.current?.click();
              }}
            >
              Add from file…
            </button>
          </div>
        </Dialog>
      )}

      {dialog.kind === 'addTranscript' && (
        <NameDialog
          title="Add Transcript"
          label="Transcript title"
          confirm="Create"
          onClose={closeDialog}
          onSubmit={(name) => {
            const title = name.trim();
            if (title === '') return 'Give the transcript a title.';
            addTranscript(title);
            return null;
          }}
        />
      )}

      {dialog.kind === 'importing' && (
        <Dialog
          title="Importing"
          onClose={() => {
            // Not a stop: the reading may go on, but its answer is dropped.
            importRun.current += 1;
            closeDialog();
          }}
        >
          <p className={dialogStyles.message} role="status">
            Importing “{dialog.name}”…{'\n\n'}This can take a moment for large files.
          </p>
        </Dialog>
      )}

      {dialog.kind === 'importFailed' && (
        <MessageDialog
          title="Couldn't add that file"
          message={dialog.message}
          onClose={closeDialog}
        />
      )}

      {dialog.kind === 'addImported' && (
        <NameDialog
          title="Add Transcript from File"
          label="Transcript title"
          confirm="Create"
          initialValue={dialog.title}
          warning={dialog.warning}
          onClose={closeDialog}
          onSubmit={(name) => {
            const title = name.trim();
            if (title === '') return 'Give the transcript a title.';
            addTranscript(title, dialog.text);
            return null;
          }}
        />
      )}

      {dialog.kind === 'newSpace' && (
        <NameDialog
          title="New Space"
          label="Space name"
          confirm="Create"
          onClose={closeDialog}
          onSubmit={(name) => {
            const cleaned = name.trim();
            if (cleaned === '') return 'Give the Space a name.';
            if (library.spaces.includes(cleaned)) return 'There is already a Space with that name.';
            open(null);
            store.addSpace(cleaned);
            return null;
          }}
        />
      )}

      {dialog.kind === 'spaces' && (
        <SpacesDialog
          library={library}
          store={store}
          onClose={closeDialog}
          onSwitch={(name) => {
            if (name !== space) open(null);
            store.switchToSpace(name);
          }}
        />
      )}

      {dialog.kind === 'deleteTranscript' && (
        <Dialog title="Delete Transcript" onClose={closeDialog}>
          <p className={dialogStyles.note}>
            Delete “{dialog.transcript.title}”? This cannot be undone.
          </p>
          <div className={dialogStyles.buttons}>
            <button type="button" className={dialogStyles.action} onClick={closeDialog}>
              Cancel
            </button>
            <button
              type="button"
              className={dialogStyles.action}
              onClick={() => {
                if (dialog.transcript.id === selected?.id) open(null);
                store.deleteTranscript(dialog.transcript.id);
                closeDialog();
              }}
            >
              Delete
            </button>
          </div>
        </Dialog>
      )}

      {dialog.kind === 'bookmarks' && selected !== null && isReading && (
        <BookmarksDialog
          bookmarks={selected.bookmarks}
          totalWords={snapshot.totalWords}
          canBookmarkHere={bookmarkHere !== null}
          isHereBookmarked={
            bookmarkHere !== null &&
            selected.bookmarks.some((bookmark) => bookmark.index === bookmarkHere.index)
          }
          onToggleHere={toggleBookmarkHere}
          onJump={(index) => {
            // Go there and land paused, saved like a pause by hand, and
            // close: you have gone where you wanted.
            engine.jumpTo(index);
            store.setPaused(selected.id, true);
            closeDialog();
          }}
          onDelete={(index) => {
            store.removeBookmark(selected.id, index);
          }}
          onRename={(index, label) => {
            store.setBookmarkLabel(selected.id, index, label);
          }}
          onClose={closeDialog}
        />
      )}
      {dialog.kind === 'settings' && (
        <SettingsDialog
          settings={settings}
          library={library}
          store={store}
          themeGuideMarkColor={themeGuideMarkColor(isDark)}
          onConfigureChunking={() => {
            setChunkingOpen(true);
          }}
          onConfigureSpeakerCues={() => {
            setSpeakerCuesOpen(true);
          }}
          onImported={() => {
            // The open transcript may be gone, or have another id.
            open(null);
            closeDialog();
          }}
          onClose={closeDialog}
        />
      )}
      {chunkingOpen && dialog.kind === 'settings' && (
        <ChunkingDialog
          current={selected === null ? null : chunkingOf(selected)}
          defaults={{
            enabled: preferences.defaultChunkingEnabled,
            size: preferences.defaultChunkSize,
            mode: preferences.defaultChunkMode,
            charTarget: preferences.defaultChunkCharTarget,
          }}
          onApplyCurrent={(choice) => {
            if (selected !== null) changeChunking(selected, choice);
          }}
          onApplyDefaults={(choice) => {
            settings.update({
              defaultChunkingEnabled: choice.enabled,
              defaultChunkSize: choice.size,
              defaultChunkMode: choice.mode,
              defaultChunkCharTarget: choice.charTarget,
            });
          }}
          onClose={() => {
            setChunkingOpen(false);
          }}
        />
      )}
      {speakerCuesOpen && dialog.kind === 'settings' && (
        <SpeakerCuesDialog
          saved={{
            speakerCuesEnabled: preferences.speakerCuesEnabled,
            speakerCueNameTagEnabled: preferences.speakerCueNameTagEnabled,
            speakerCueTagPosition: preferences.speakerCueTagPosition,
            speakerCueFlashEnabled: preferences.speakerCueFlashEnabled,
            speakerCueSound: preferences.speakerCueSound,
            speakerCueStyle: preferences.speakerCueStyle,
          }}
          transcript={
            selected === null
              ? null
              : {
                  id: selected.id,
                  title: selected.title,
                  rawText: selected.rawText,
                  speakerCustom: selected.speakerCustom,
                }
          }
          player={player}
          clock={clock}
          // Saved at once, and the reader on screen follows (useSpeakerCues).
          onApply={(choice) => {
            settings.update(choice);
          }}
          onApplySpeakers={(id, custom) => {
            store.setSpeakers(id, custom);
          }}
          onClose={() => {
            setSpeakerCuesOpen(false);
          }}
        />
      )}
    </div>
  );
}
