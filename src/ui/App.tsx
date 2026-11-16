import { useEffect, useState, useSyncExternalStore } from 'react';

import { APP_NAME, APP_VERSION, REPO_URL } from '../core/appInfo';
import type { Transcript } from '../core/models';
import { pyRound } from '../core/pythonText';
import { ReaderSession } from '../core/reader';
import { formatDuration } from '../core/timing';
import { currentSpace, MemoryLibraryStore } from '../store/memoryLibrary';
import styles from './App.module.css';
import { Dialog, NameDialog } from './Dialog';
import dialogStyles from './Dialog.module.css';
import { PauseIcon, PlayIcon, PowerIcon, RestartIcon } from './Icons';
import { Sidebar } from './Sidebar';
import { SpacesDialog } from './SpacesDialog';
import { useReaderEngine, type ReaderEngineParts } from './useReaderEngine';
import { WordDisplay } from './WordDisplay';

// The desktop app's limits and steps. They move into the settings later
// (WPM_RANGE and skip_word_count in its core/settings_store.py, and
// WPM_KEY_STEP in core/wpm_step.py).
const WPM_MIN = 100;
const WPM_MAX = 1000;
const WPM_STEP = 10;
const SKIP_WORDS = 10;

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

// The whole page: the transcripts on the left, and on the right the open
// transcript, either as text to edit or as words being read.
//
// The library lives in memory for now, so it is gone when the page reloads.
// Saving it in the browser is the next step.
export function App(parts: ReaderEngineParts) {
  const [store] = useState(() => new MemoryLibraryStore());
  const library = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(NO_DIALOG);
  const [problem, setProblem] = useState('');

  const space = currentSpace(library);
  const inSpace = library.transcripts.filter((transcript) => transcript.space === space);
  const selected = inSpace.find((transcript) => transcript.id === selectedId) ?? null;

  const [engine, snapshot] = useReaderEngine(parts);
  const isReading = snapshot.status !== 'empty';

  // Remember where the open transcript is being read, word by word, so
  // that stopping and starting again picks up at the same place. Reading is
  // always of the selected transcript, so that is whose position moves.
  const readingId = isReading ? (selected?.id ?? null) : null;
  const readingIndex = snapshot.index;
  useEffect(() => {
    if (readingId !== null) store.setPosition(readingId, readingIndex);
  }, [store, readingId, readingIndex]);

  function closeDialog() {
    setDialog(NO_DIALOG);
  }

  // Everything that leaves the open transcript goes through here, so a
  // session never keeps running behind another transcript.
  function open(id: number | null) {
    engine.unload();
    setProblem('');
    setSelectedId(id);
  }

  function startReading(transcript: Transcript) {
    const session = new ReaderSession(transcript.rawText, { wpm: transcript.wpm });
    if (session.totalWords === 0) {
      // Only spaces, or only timestamps, which are taken out before reading.
      setProblem('There are no words to read in that text.');
      return;
    }
    // Pick up where this transcript was left. One that was read to the end
    // starts again from the first word.
    if (transcript.position > 0 && transcript.position < session.totalWords) {
      session.seekTo(transcript.position);
    }
    setProblem('');
    engine.load(session);
  }

  function changeWpm(transcript: Transcript, wpm: number) {
    store.setWpm(transcript.id, wpm);
    engine.setWpm(wpm);
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
                }}
              >
                <PowerIcon />
              </button>
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
            <div className={styles.stage}>
              <WordDisplay chunk={snapshot.chunk} />
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
                aria-label={`Back ${SKIP_WORDS} words`}
                title={`Back ${SKIP_WORDS} words`}
                disabled={!isReading}
                onClick={() => {
                  engine.skip(-SKIP_WORDS);
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
                aria-label={`Forward ${SKIP_WORDS} words`}
                title={`Forward ${SKIP_WORDS} words`}
                disabled={!isReading}
                onClick={() => {
                  engine.skip(SKIP_WORDS);
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
            open(store.addTranscript({ title, space }).id);
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
          <p className={dialogStyles.note}>
            There are no settings yet. They arrive as the app is built.
          </p>
          <p className={dialogStyles.note}>
            Everything stays in this browser tab. Nothing is sent anywhere, and nothing is saved
            yet: a reload empties the list.
          </p>
          <p className={`${dialogStyles.note} ${dialogStyles.quiet}`}>
            {APP_NAME}, version {APP_VERSION}. An early build.{' '}
            <a href={REPO_URL}>Source on GitHub</a>
          </p>
        </Dialog>
      )}
    </div>
  );
}
