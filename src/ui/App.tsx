import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';

import { APP_NAME, APP_VERSION, REPO_URL } from '../core/appInfo';
import { currentSpace, findTranscript } from '../core/library';
import type { Library, Settings, Transcript } from '../core/models';
import { pyRound } from '../core/pythonText';
import { ReaderSession } from '../core/reader';
import { transcriptToReopen } from '../core/reopen';
import { blendColors } from '../core/colors';
import { PERIPHERAL_CONTEXT_DIM } from '../core/guideMarks';
import { themeGuideMarkColor, themeReadingColors } from '../core/theme';
import {
  GUIDE_MARK_LENGTH_PERCENT_RANGE,
  GUIDE_MARK_THICKNESS_RANGE,
  HIGHLIGHT_OFFSET_RANGE,
  WPM_RANGE,
} from '../core/settings';
import { formatDuration } from '../core/timing';
import { WPM_KEY_STEP } from '../core/wpmStep';
import type { StorageHealth } from '../store/contract';
import type { SavedLibraryStore } from '../store/libraryStore';
import type { SavedSettingsStore } from '../store/settingsStore';
import styles from './App.module.css';
import { DataSettings } from './DataSettings';
import { Dialog, NameDialog } from './Dialog';
import dialogStyles from './Dialog.module.css';
import { PauseIcon, PlayIcon, PowerIcon, RestartIcon } from './Icons';
import { RangeSetting } from './RangeSetting';
import { Scrubber } from './Scrubber';
import { Sidebar } from './Sidebar';
import { SpacesDialog } from './SpacesDialog';
import { useReaderEngine, type ReaderEngineParts } from './useReaderEngine';
import { useTheme } from './useTheme';
import { WordDisplay } from './WordDisplay';

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
  | { readonly kind: 'deleteTranscript'; readonly transcript: Transcript };

const NO_DIALOG: OpenDialog = { kind: 'none' };

// Time left, the way the desktop toolbar shows it.
function timeLeft(remainingMs: number): string {
  return formatDuration(Math.max(0, pyRound(remainingMs / 1000)));
}

// A session for this transcript, at the word it was left on, or null when
// its text has no words. One that was read to the end starts again from
// the first word.
function sessionFor(transcript: Transcript): ReaderSession | null {
  const session = new ReaderSession(transcript.rawText, { wpm: transcript.wpm });
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
  useEffect(() => {
    engine.setBehaviour({ scrubPauseEnabled: scrubPause });
  }, [engine, scrubPause]);
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
    const session = sessionFor(transcript);
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
    const session = sessionFor(last);
    if (session === null) return;
    engine.load(session, true);
    store.setPaused(last.id, true);
  }, [ready, store, settings, engine]);

  function startReading(transcript: Transcript) {
    const session = sessionFor(transcript);
    if (session === null) {
      // Only spaces, or only timestamps, which are taken out before reading.
      setProblem('There are no words to read in that text.');
      return;
    }
    setProblem('');
    store.setStopped(transcript.id, false);
    store.setPaused(transcript.id, false);
    engine.load(session);
  }

  function changeWpm(transcript: Transcript, wpm: number) {
    store.setWpm(transcript.id, wpm);
    engine.setWpm(wpm);
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
                title="Stop reading"
                onClick={() => {
                  engine.unload();
                  if (selected !== null) store.setStopped(selected.id, true);
                  void store.flush();
                }}
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
              <span className={styles.spring} />
              <span className={styles.readout}>{timeLeft(snapshot.remainingMs)} left</span>
              <span className={styles.readout}>{snapshot.percent}%</span>
              <button
                type="button"
                className={styles.pill}
                aria-label={snapshot.status === 'playing' ? 'Pause' : 'Play'}
                title={snapshot.status === 'playing' ? 'Pause' : 'Play'}
                disabled={snapshot.status === 'finished'}
                onClick={() => {
                  engine.togglePause();
                  // Saved, so the transcript comes back the way it was left.
                  if (selected !== null) {
                    store.setPaused(selected.id, snapshot.status === 'playing');
                  }
                }}
              >
                {snapshot.status === 'playing' ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                type="button"
                className={styles.pill}
                aria-label="Restart"
                title="Restart"
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
                store.setText(selected.id, event.target.value);
                // A changed text is read from its first word again.
                store.setPosition(selected.id, 0);
                setProblem('');
              }}
            />
            {problem !== '' && (
              <p role="alert" className={styles.problem}>
                {problem}
              </p>
            )}
            <div className={styles.startRow}>
              <button
                type="submit"
                className={styles.start}
                disabled={selected.rawText.trim() === ''}
              >
                Start reading
              </button>
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
                  engine.skip(-skipWords);
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
                  engine.skip(skipWords);
                }}
              >
                {'>>'}
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

      {dialog.kind === 'settings' && (
        <Dialog title="Settings" onClose={closeDialog}>
          <label className={dialogStyles.note}>
            <input
              type="checkbox"
              checked={preferences.reopenLastTranscript}
              onChange={(event) => {
                settings.set('reopenLastTranscript', event.target.checked);
              }}
            />{' '}
            Reopen the last transcript when the page opens
          </label>
          <p className={`${dialogStyles.note} ${dialogStyles.quiet}`}>
            It comes back at the same word and paused, so nothing starts playing on its own. Turn
            this off to start with no transcript open.
          </p>
          <label className={dialogStyles.note}>
            Appearance{' '}
            <select
              value={preferences.appearanceMode}
              onChange={(event) => {
                settings.set('appearanceMode', event.target.value as Settings['appearanceMode']);
              }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
          <p className={`${dialogStyles.note} ${dialogStyles.quiet}`}>
            System follows your browser's own light or dark choice. Reading colours you picked by
            hand stay as they are.
          </p>
          <label className={dialogStyles.note}>
            <input
              type="checkbox"
              checked={preferences.scrubPauseEnabled}
              onChange={(event) => {
                settings.set('scrubPauseEnabled', event.target.checked);
              }}
            />{' '}
            Stay paused after moving the position slider
          </label>
          <label className={dialogStyles.note}>
            <input
              type="checkbox"
              checked={preferences.peripheralContextEnabled}
              onChange={(event) => {
                settings.set('peripheralContextEnabled', event.target.checked);
              }}
            />{' '}
            Show the surrounding words
          </label>
          <p className={`${dialogStyles.note} ${dialogStyles.quiet}`}>
            A dim line under the word with the word before it and the two after it, so the corner of
            your eye keeps the thread.
          </p>
          <fieldset className={dialogStyles.group}>
            <legend>Guide marks</legend>
            <label className={dialogStyles.note}>
              <input
                type="checkbox"
                checked={preferences.guideMarkHorizontalEnabled}
                onChange={(event) => {
                  settings.set('guideMarkHorizontalEnabled', event.target.checked);
                }}
              />{' '}
              Show the horizontal lines too
            </label>
            <RangeSetting
              label="Mark thickness"
              range={GUIDE_MARK_THICKNESS_RANGE}
              value={preferences.guideMarkThicknessPx}
              onChange={(value) => {
                settings.set('guideMarkThicknessPx', value);
              }}
            />
            <RangeSetting
              label="Mark length"
              range={GUIDE_MARK_LENGTH_PERCENT_RANGE}
              value={preferences.guideMarkLengthPercent}
              unit="%"
              onChange={(value) => {
                settings.set('guideMarkLengthPercent', value);
              }}
            />
            <RangeSetting
              label="Focus letter height"
              range={HIGHLIGHT_OFFSET_RANGE}
              value={preferences.highlightOffsetPx}
              onChange={(value) => {
                settings.set('highlightOffsetPx', value);
              }}
            />
            <label className={dialogStyles.note}>
              Mark colour{' '}
              <input
                type="color"
                value={preferences.guideMarkColor}
                onChange={(event) => {
                  settings.setGuideMarkColor(event.target.value.toUpperCase());
                }}
              />
            </label>
            <p className={`${dialogStyles.note} ${dialogStyles.quiet}`}>
              The marks show only while words go by. A colour you pick stays in both themes.
            </p>
          </fieldset>
          <DataSettings
            library={library}
            store={store}
            settings={settings}
            onImported={() => {
              // The open transcript may be gone, or have another id.
              open(null);
              closeDialog();
            }}
          />
          <p className={`${dialogStyles.note} ${dialogStyles.quiet}`}>
            {APP_NAME}, version {APP_VERSION}. An early build.{' '}
            <a href={REPO_URL}>Source on GitHub</a>
          </p>
        </Dialog>
      )}
    </div>
  );
}
