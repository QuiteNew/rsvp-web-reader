import { useState } from 'react';

import {
  BUNDLE_FILE_NAME,
  buildBundle,
  bundleText,
  parseBundle,
  type ParsedBundle,
} from '../core/bundle';
import type { Library } from '../core/models';
import type { SavedLibraryStore } from '../store/libraryStore';
import {
  browserSettingsStorage,
  readSavedSettings,
  writeSavedSettings,
} from '../store/savedSettings';
import styles from './Dialog.module.css';
import { saveTextFile } from './saveFile';

type ReadBundle = Extract<ParsedBundle, { kind: 'ok' }>;

interface DataSettingsProps {
  readonly library: Library;
  readonly store: SavedLibraryStore;
  // Called after an import has changed the library.
  readonly onImported: () => void;
  // How a file is handed to the person. Tests pass their own.
  readonly saveFile?: (name: string, text: string) => void;
}

function count(amount: number, one: string, many: string): string {
  return `${amount} ${amount === 1 ? one : many}`;
}

// The part of Settings about the saved data: where it lives, saving a copy
// of it to a file, and bringing a file back in. The file is the desktop
// app's export bundle, so each app can read the other's.
export function DataSettings({
  library,
  store,
  onImported,
  saveFile = saveTextFile,
}: DataSettingsProps) {
  const [problem, setProblem] = useState('');
  const [chosen, setChosen] = useState<ReadBundle | null>(null);

  function exportAll() {
    const storage = browserSettingsStorage();
    const settings = storage === null ? {} : readSavedSettings(storage);
    saveFile(BUNDLE_FILE_NAME, bundleText(buildBundle(library, settings)));
  }

  async function choose(file: File | undefined) {
    if (file === undefined) return;
    setChosen(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setProblem('That file could not be read.');
      return;
    }
    const parsed = parseBundle(text);
    if (parsed.kind === 'error') {
      setProblem(parsed.message);
      return;
    }
    setProblem('');
    setChosen(parsed);
  }

  function replace(bundle: ReadBundle) {
    store.replaceAll(bundle.library);
    const storage = browserSettingsStorage();
    if (storage !== null) writeSavedSettings(storage, bundle.settings);
    onImported();
  }

  function expand(bundle: ReadBundle) {
    store.mergeAll(bundle.library);
    onImported();
  }

  return (
    <section aria-label="Your data">
      <h3 className={styles.heading}>Your data</h3>
      <p className={styles.note}>
        Your transcripts are saved in this browser, on this device only. Nothing is sent anywhere.
        Clearing this site&apos;s data in the browser removes them, so save a copy to a file now and
        then.
      </p>
      <div className={styles.buttons}>
        <button type="button" className={styles.action} onClick={exportAll}>
          Export to a file
        </button>
        <label className={styles.action}>
          Import from a file
          <input
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Import from a file"
            onChange={(event) => {
              void choose(event.target.files?.[0]);
              // So that picking the same file again is noticed.
              event.target.value = '';
            }}
          />
        </label>
      </div>

      {problem !== '' && (
        <p role="alert" className={styles.note}>
          {problem}
        </p>
      )}

      {chosen !== null && (
        <div role="group" aria-label="Import">
          <p className={styles.note}>
            That file holds {count(chosen.library.transcripts.length, 'transcript', 'transcripts')}{' '}
            in {count(chosen.library.spaces.length, 'Space', 'Spaces')}. Replace throws away what is
            here now. Add keeps it and puts the file&apos;s transcripts next to it.
          </p>
          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                replace(chosen);
              }}
            >
              Replace everything
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                expand(chosen);
              }}
            >
              Add to what is here
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                setChosen(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
