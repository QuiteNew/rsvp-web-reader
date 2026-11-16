import { useState } from 'react';

import { APP_NAME, APP_VERSION, REPO_URL } from '../core/appInfo';
import { ReaderSession } from '../core/reader';
import styles from './App.module.css';
import { Reader } from './Reader';
import { useReaderEngine, type ReaderEngineParts } from './useReaderEngine';

const DEFAULT_WPM = 300;

// The whole page, for now: a box to paste text into, and the reader. There
// is no saving yet, so the text is gone when the page is closed. Saving is
// phase 3.
export function App(parts: ReaderEngineParts) {
  const [engine, snapshot] = useReaderEngine(parts);
  const [text, setText] = useState('');
  const [wpm, setWpm] = useState(DEFAULT_WPM);
  const [problem, setProblem] = useState('');

  const isReading = snapshot.status !== 'empty';

  function start() {
    const session = new ReaderSession(text, { wpm });
    if (session.totalWords === 0) {
      // Only spaces, or only timestamps, which are taken out before reading.
      setProblem('There are no words to read in that text.');
      return;
    }
    setProblem('');
    engine.load(session);
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{APP_NAME}</h1>

      {isReading ? (
        <Reader
          engine={engine}
          snapshot={snapshot}
          onWpmChange={setWpm}
          onEditText={() => {
            engine.unload();
          }}
        />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          <label htmlFor="text" className={styles.label}>
            Text to read
          </label>
          <textarea
            id="text"
            className={styles.text}
            rows={10}
            value={text}
            placeholder="Paste a transcript or any text here."
            onChange={(event) => {
              setText(event.target.value);
              setProblem('');
            }}
          />
          {problem !== '' && (
            <p role="alert" className={styles.problem}>
              {problem}
            </p>
          )}
          <button type="submit" className={styles.start} disabled={text.trim() === ''}>
            Start reading
          </button>
          <p className={styles.small}>
            The text stays in this browser tab. Nothing is sent anywhere, and nothing is saved yet.
          </p>
        </form>
      )}

      <p className={styles.small}>
        Version {APP_VERSION}. An early build. <a href={REPO_URL}>Source on GitHub</a>
      </p>
    </main>
  );
}
