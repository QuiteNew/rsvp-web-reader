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
import { themeGuideMarkColor, themeReadingColors } from '../core/theme';
import { CHUNK_SIZE_RANGE, FONT_SIZE_RANGE, WPM_RANGE } from '../core/settings';
import { formatDuration } from '../core/timing';
import { WPM_KEY_STEP } from '../core/wpmStep';
import type { ChunkingChoice, StorageHealth } from '../store/contract';
import type { SavedLibraryStore } from '../store/libraryStore';
import type { SavedSettingsStore } from '../store/settingsStore';
import styles from './App.module.css';
import { Dialog, NameDialog } from './Dialog';
import dialogStyles from './Dialog.module.css';
import { BookmarksDialog } from './BookmarksDialog';
import { ChunkingDialog } from './ChunkingDialog';
import {
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
import { SpacesDialog } from './SpacesDialog';
import { useReaderEngine, type ReaderEngineParts } from './useReaderEngine';
import { useShortcuts } from './useShortcuts';
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
  | { readonly kind: 'addTranscript' }
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
// the first word. Length pacing and the warm-up are settings for every
// transcript, so they come from the settings, as on the desktop.
function sessionFor(transcript: Transcript, preferences: Settings): ReaderSession | null {
  const session = new ReaderSession(transcript.rawText, {
    wpm: transcript.wpm,
    lengthPacingEnabled: preferences.lengthPacingEnabled,
    warmUpEnabled: preferences.warmUpEnabled,
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
}

// The whole page: the transcripts on the left, and on the right the open
// transcript, either as text to edit or as words being read.
//
// The library is saved in the browser by the store. Until the store has
// read what was saved, the page shows nothing that could be changed.
export function App({ store, settings, health, ...parts }: AppProps) {
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
  const [problem, setProblem] = useState('');

  const space = currentSpace(library);
  const inSpace = library.transcripts.filter((transcript) => transcript.space === space);
  const selected = inSpace.find((transcript) => transcript.id === selectedId) ?? null;

  const [engine, snapshot] = useReaderEngine(parts);
  const skipWords = preferences.skipWordCount;

  // Light, Dark or System, put on the page. The colours that follow the theme
  // (a transcript's reading colours that were not picked by hand, and the
  // guide marks) are given the theme's colours once the saved library is
  // there, and again whenever the theme or the Defaults change. The desktop
  // does this only when it starts. The page changes at once, so its reading
  // colours do too.
  const isDark = useTheme(preferences.appearanceMode);

  // The surrounding-words line is built by the engine only when it is on.
  const showContext = preferences.peripheralContextEnabled;
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

  // Everything that leaves the open transcript goes through here, so a
  // session never keeps running behind another transcript.
  //
  // A transcript that was left in the reader comes back in the reader,
  // paused on the word it was left on, as on the desktop. One that was left
  // as text comes back as text.
  function open(id: number | null) {
    engine.unload();
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

  // The reading shortcuts: only while the reader is on screen and no dialog
  // is open over it (Escape then closes the dialog, as it should).
  useShortcuts(ready && isReading && dialog.kind === 'none', (action) => {
    if (action === 'togglePause') togglePause();
    else if (action === 'skipBack') skip(-skipWords);
    else if (action === 'skipForward') skip(skipWords);
    else if (action === 'restart') engine.restart();
    else if (action === 'stop') stopReading();
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
          setDialog({ kind: 'addTranscript' });
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

        {selected === null ? (
          <div className={styles.work}>
            <p className={styles.welcome}>
              Add a transcript with the + on the left, paste a text into it, and read it one word at
              a time.
            </p>
          </div>
        ) : isReading ? (
          <div className={styles.work}>
            <div className={styles.toolbar}>
              <button
                type="button"
                className={styles.pill}
                aria-label="Stop reading"
                title="Stop reading (Esc)"
                onClick={stopReading}
              >
                <PowerIcon />
              </button>
              <Scrubber
                total={snapshot.totalWords}
                index={snapshot.index}
                bookmarks={selected?.bookmarks.map((bookmark) => bookmark.index) ?? []}
                onMove={(index) => {
                  engine.scrubMove(index);
                }}
                onEnd={() => {
                  if (!engine.getSnapshot().isScrubbing) return;
                  engine.scrubEnd();
                  // The state it ends in (paused or going on) is saved once,
                  // like a pause made by hand.
                  if (selected !== null) {
                    store.setPaused(selected.id, engine.getSnapshot().status !== 'playing');
                  }
                }}
              />
              <button
                type="button"
                className={styles.pill}
                aria-label="Bookmarks"
                title="Bookmarks (B adds or removes one here)"
                onClick={() => {
                  setDialog({ kind: 'bookmarks' });
                }}
              >
                <BookmarkIcon />
              </button>
              <span className={styles.spring} />
              <span className={styles.readout}>{timeLeft(snapshot.remainingMs)} left</span>
              <span className={styles.readout}>{snapshot.percent}%</span>
              <button
                type="button"
                className={styles.pill}
                aria-label={snapshot.status === 'playing' ? 'Pause' : 'Play'}
                title={snapshot.status === 'playing' ? 'Pause (Space)' : 'Play (Space)'}
                disabled={snapshot.status === 'finished'}
                onClick={togglePause}
              >
                {snapshot.status === 'playing' ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                type="button"
                className={styles.pill}
                aria-label="Restart"
                title="Restart (R)"
                onClick={() => {
                  engine.restart();
                }}
              >
                <RestartIcon />
              </button>
            </div>
            <div
              className={styles.stage}
              style={
                selected === null
                  ? undefined
                  : ({
                      '--reading-font': selected.fontColor,
                      '--reading-highlight': selected.highlightColor,
                      '--reading-background': selected.backgroundColor,
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
            <textarea
              className={styles.text}
              aria-label="Transcript text"
              placeholder="Paste a transcript or any text here."
              value={selected.rawText}
              onChange={(event) => {
                changeText(selected, event.target.value);
              }}
            />
            {problem !== '' && (
              <p role="alert" className={styles.problem}>
                {problem}
              </p>
            )}
            <div className={styles.startRow}>
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

        {selected !== null && (
          <div className={styles.band}>
            <output className={styles.wpm} htmlFor="speed">
              {selected.wpm} WPM
            </output>
            <div className={styles.speedRow}>
              <button
                type="button"
                className={styles.square}
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
                className={styles.square}
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
            <div className={styles.chunkRow}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.chunkingEnabled}
                  onChange={(event) => {
                    changeChunking(selected, {
                      ...chunkingOf(selected),
                      enabled: event.target.checked,
                    });
                  }}
                />{' '}
                Group
              </label>
              <button
                type="button"
                className={styles.square}
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
              <output aria-label="Words per group">{selected.chunkSize}</output>
              <button
                type="button"
                className={styles.square}
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
            <div className={styles.chunkRow}>
              <span>Word size</span>
              <button
                type="button"
                className={styles.square}
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
              <output aria-label="Word size">{selected.fontSize}px</output>
              <button
                type="button"
                className={styles.square}
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
          </div>
        )}
      </main>

      {dialog.kind === 'addTranscript' && (
        <NameDialog
          title="Add Transcript"
          label="Transcript title"
          confirm="Create"
          onClose={closeDialog}
          onSubmit={(name) => {
            const title = name.trim();
            if (title === '') return 'Give the transcript a title.';
            // A new transcript starts as text to edit, not in the reader.
            // It gets what Settings holds for a new transcript.
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
            store.setStopped(added.id, true);
            open(added.id);
            // Now there is something to lose, so ask the browser to keep it.
            void health?.requestPersistence();
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
          onConfigureChunking={() => {
            setChunkingOpen(true);
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
    </div>
  );
}
