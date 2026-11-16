import { pyRound } from '../core/pythonText';
import { formatDuration } from '../core/timing';
import type { ReaderEngine, ReaderSnapshot } from '../engine/contract';
import styles from './Reader.module.css';
import { WordDisplay } from './WordDisplay';

// The desktop app's limits and steps. They move into the settings in
// phase 3 (WPM_RANGE and skip_word_count in core/settings_store.py, and
// WPM_KEY_STEP in core/wpm_step.py).
export const WPM_MIN = 100;
export const WPM_MAX = 1000;
export const WPM_STEP = 10;
export const SKIP_WORDS = 10;

interface ReaderProps {
  readonly engine: ReaderEngine;
  readonly snapshot: ReaderSnapshot;
  // Called with every new speed, so the page can use it for the next text.
  readonly onWpmChange: (wpm: number) => void;
  // Back to the text box.
  readonly onEditText: () => void;
}

// Time left, the way the desktop toolbar shows it.
function timeLeft(remainingMs: number): string {
  return formatDuration(Math.max(0, pyRound(remainingMs / 1000)));
}

export function Reader({ engine, snapshot, onWpmChange, onEditText }: ReaderProps) {
  const isFinished = snapshot.status === 'finished';
  const isPlaying = snapshot.status === 'playing';

  return (
    <section aria-label="Reader">
      <div className={styles.stage}>
        <WordDisplay chunk={snapshot.chunk} />
        {isFinished && <p className={styles.end}>End of the text.</p>}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          onClick={() => {
            engine.skip(-SKIP_WORDS);
          }}
        >
          Back {SKIP_WORDS}
        </button>
        <button
          type="button"
          className={styles.main}
          disabled={isFinished}
          onClick={() => {
            engine.togglePause();
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          onClick={() => {
            engine.skip(SKIP_WORDS);
          }}
        >
          Forward {SKIP_WORDS}
        </button>
        <button
          type="button"
          onClick={() => {
            engine.restart();
          }}
        >
          Restart
        </button>
      </div>

      <div className={styles.speed}>
        <label htmlFor="speed">Speed</label>
        <input
          id="speed"
          type="range"
          min={WPM_MIN}
          max={WPM_MAX}
          step={WPM_STEP}
          value={snapshot.wpm}
          onChange={(event) => {
            const wpm = Number(event.target.value);
            engine.setWpm(wpm);
            onWpmChange(wpm);
          }}
        />
        <output htmlFor="speed">{snapshot.wpm} words a minute</output>
      </div>

      <p className={styles.progress}>
        <span>{timeLeft(snapshot.remainingMs)} left</span>
        <span>{snapshot.percent}%</span>
        <span>
          Word {Math.min(snapshot.index + 1, snapshot.totalWords)} of {snapshot.totalWords}
        </span>
      </p>

      <button type="button" onClick={onEditText}>
        Change the text
      </button>
    </section>
  );
}
