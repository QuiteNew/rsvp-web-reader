import { useState } from 'react';

import type { Transcript } from '../core/models';
import styles from './App.module.css';

interface SidebarProps {
  // The transcripts of the current Space, in the order they were added.
  readonly transcripts: readonly Transcript[];
  readonly selectedId: number | null;
  readonly space: string;
  readonly onSelect: (id: number) => void;
  readonly onAdd: () => void;
  readonly onDelete: (transcript: Transcript) => void;
  readonly onPickSpace: () => void;
  readonly onNewSpace: () => void;
}

// The left side: the transcripts of the current Space, a search box over
// them, and the band at the bottom that shows and changes the Space.
export function Sidebar(props: SidebarProps) {
  const [search, setSearch] = useState('');
  const wanted = search.trim().toLowerCase();
  const shown = props.transcripts.filter((transcript) =>
    transcript.title.toLowerCase().includes(wanted),
  );

  return (
    <aside className={styles.sidebar} aria-label="Transcripts">
      <div className={styles.head}>
        <h2 className={styles.heading}>List of Transcripts</h2>
        <button
          type="button"
          className={styles.square}
          aria-label="Add transcript"
          onClick={props.onAdd}
        >
          +
        </button>
      </div>

      <div className={styles.listArea}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search..."
          aria-label="Search transcripts"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        <hr className={styles.rule} />
        {props.transcripts.length === 0 ? (
          <p className={styles.hint}>No transcripts in this Space yet. Add one with the + above.</p>
        ) : shown.length === 0 ? (
          <p className={styles.hint}>No title matches the search.</p>
        ) : (
          <ul className={styles.list}>
            {shown.map((transcript) => (
              <li key={transcript.id} className={styles.row}>
                <button
                  type="button"
                  className={styles.card}
                  aria-current={transcript.id === props.selectedId}
                  title={transcript.title}
                  onClick={() => {
                    props.onSelect(transcript.id);
                  }}
                >
                  {transcript.title}
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Delete ${transcript.title}`}
                  onClick={() => {
                    props.onDelete(transcript);
                  }}
                >
                  X
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.spaceBand}>
        <button
          type="button"
          className={styles.square}
          aria-label="Select Space"
          onClick={props.onPickSpace}
        >
          v
        </button>
        <span className={styles.spaceName} title={props.space}>
          {props.space}
        </span>
        <button
          type="button"
          className={styles.square}
          aria-label="New Space"
          onClick={props.onNewSpace}
        >
          +
        </button>
      </div>
    </aside>
  );
}
