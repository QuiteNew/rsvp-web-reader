// The rules for changing a library, as pure functions from one Library to
// the next. Ported from core/transcript_store.py of the desktop app, where
// they are methods of TranscriptStore. The store in src/store only keeps
// the current Library, saves it and loads it.
//
// So far this holds the two functions an import needs. The rest of
// TranscriptStore comes in step 4 of docs/handoff/phase-3-progress.md.
import { DEFAULT_SPACE, type Library } from './models';

/**
 * The library after an import in Replace mode: everything that was here is
 * thrown away and the incoming library takes its place. replace_all() on
 * the desktop.
 *
 * A library with no Spaces gets the default one. The current Space is kept
 * inside the list at its upper end only: an index below zero is left as it
 * is, as on the desktop.
 */
export function replaceAll(incoming: Library): Library {
  const spaces = incoming.spaces.length > 0 ? [...incoming.spaces] : [DEFAULT_SPACE];
  return {
    nextId: incoming.nextId,
    currentSpaceIndex: Math.min(incoming.currentSpaceIndex, spaces.length - 1),
    spaces,
    transcripts: [...incoming.transcripts],
  };
}

/**
 * The library after an import in Expand mode: the incoming Spaces and
 * transcripts are added to what is here. merge_all() on the desktop.
 *
 * Spaces are merged by name, compared exactly: one that is not here yet is
 * added at the end, in the order it has in the incoming list. The current
 * Space stays, since an import should not change what is open.
 *
 * Every incoming transcript gets a new id, counted up from this library's
 * nextId, because the two libraries numbered their transcripts on their
 * own and the ids can clash. Everything else on it stays, its Space
 * included, which is here by name once the Spaces are merged.
 */
export function mergeAll(current: Library, incoming: Library): Library {
  const spaces = [...current.spaces];
  for (const space of incoming.spaces) {
    if (!spaces.includes(space)) spaces.push(space);
  }
  let nextId = current.nextId;
  const added = incoming.transcripts.map((transcript) => {
    const renumbered = { ...transcript, id: nextId };
    nextId += 1;
    return renumbered;
  });
  return {
    nextId,
    currentSpaceIndex: current.currentSpaceIndex,
    spaces,
    transcripts: [...current.transcripts, ...added],
  };
}
