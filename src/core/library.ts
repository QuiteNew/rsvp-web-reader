// The rules for changing a library, as pure functions from one Library to
// the next. Ported from core/transcript_store.py of the desktop app, where
// they are methods of TranscriptStore. The store in src/store only keeps
// the current Library, saves it and loads it.
//
// A function that has nothing to change gives back the very Library it was
// given, so a caller can tell "refused" from "done" by comparing the two,
// and the store knows there is nothing to save.
import {
  BOOKMARK_DEFAULTS,
  DEFAULT_SPACE,
  TRANSCRIPT_DEFAULTS,
  type Bookmark,
  type Library,
  type Transcript,
} from './models';
import { pyRound, pyStrip } from './pythonText';
import { cleanCustomSpeakers } from './speakers';

/**
 * A reading session shorter than this many seconds does not count as one
 * more time read, so opening a transcript and leaving at once is not a
 * read. Its words and seconds are still added to the totals.
 */
export const MIN_ACTIVE_SECONDS_TO_COUNT_AS_READ = 3;

/** What a new transcript may be given besides its title and Space. */
export type NewTranscriptFields = Partial<
  Pick<
    Transcript,
    | 'wpm'
    | 'fontColor'
    | 'highlightColor'
    | 'backgroundColor'
    | 'fontSize'
    | 'chunkingEnabled'
    | 'chunkSize'
    | 'chunkMode'
    | 'chunkCharTarget'
  >
>;

/** The name of the Space that is open. */
export function currentSpace(library: Library): string {
  return library.spaces[library.currentSpaceIndex] ?? DEFAULT_SPACE;
}

export function transcriptsInSpace(library: Library, name: string): Transcript[] {
  return library.transcripts.filter((transcript) => transcript.space === name);
}

export function findTranscript(library: Library, id: number): Transcript | null {
  return library.transcripts.find((transcript) => transcript.id === id) ?? null;
}

/**
 * The library with one transcript changed. `change` gives the fields to
 * set, or null to leave it. With no such transcript, or nothing to set,
 * the library comes back as it was.
 */
function withTranscript(
  library: Library,
  id: number,
  change: (transcript: Transcript) => Partial<Transcript> | null,
): Library {
  const index = library.transcripts.findIndex((transcript) => transcript.id === id);
  const found = library.transcripts[index];
  if (found === undefined) return library;
  const fields = change(found);
  if (fields === null) return library;
  const transcripts = [...library.transcripts];
  transcripts[index] = { ...found, ...fields };
  return { ...library, transcripts };
}

// ---- Spaces ----

/**
 * Add a Space and make it the open one. The name is trimmed. An empty name
 * or one that is taken changes nothing.
 */
export function addSpace(library: Library, name: string): Library {
  const cleaned = pyStrip(name);
  if (cleaned === '' || library.spaces.includes(cleaned)) return library;
  const spaces = [...library.spaces, cleaned];
  return { ...library, spaces, currentSpaceIndex: spaces.length - 1 };
}

/** Open another Space. A name that is not a Space changes nothing. */
export function switchToSpace(library: Library, name: string): Library {
  const index = library.spaces.indexOf(name);
  if (index === -1) return library;
  return { ...library, currentSpaceIndex: index };
}

/**
 * Rename a Space, and move every transcript in it to the new name in the
 * same step. A Space is known by its name alone, so a transcript left with
 * the old name would fall out of it.
 *
 * Refused when oldName is not a Space, when the new name (trimmed) is
 * empty or the same, or when another Space has it. The open Space needs no
 * care: it is renamed in place, at the same index.
 */
export function renameSpace(library: Library, oldName: string, newName: string): Library {
  const cleaned = pyStrip(newName);
  const index = library.spaces.indexOf(oldName);
  if (index === -1) return library;
  if (cleaned === '' || cleaned === oldName) return library;
  if (library.spaces.includes(cleaned)) return library;
  const spaces = [...library.spaces];
  spaces[index] = cleaned;
  const transcripts = library.transcripts.map((transcript) =>
    transcript.space === oldName ? { ...transcript, space: cleaned } : transcript,
  );
  return { ...library, spaces, transcripts };
}

/**
 * Delete a Space, but only an empty one, and never the last one. If it was
 * the open Space, the first one becomes the open Space. Otherwise the open
 * Space is found again by its name, since its index may have moved.
 */
export function deleteSpace(library: Library, name: string): Library {
  if (!library.spaces.includes(name) || library.spaces.length <= 1) return library;
  if (transcriptsInSpace(library, name).length > 0) return library;
  const open = currentSpace(library);
  const gone = library.spaces.indexOf(name);
  const spaces = library.spaces.filter((_, index) => index !== gone);
  return { ...library, spaces, currentSpaceIndex: open === name ? 0 : spaces.indexOf(open) };
}

// ---- Transcripts ----

/**
 * Add a transcript at the end of the list. It gets the library's nextId,
 * so it is the last transcript of the answer. The Space is not checked, as
 * on the desktop: the caller passes one that exists.
 */
export function addTranscript(
  library: Library,
  title: string,
  space: string,
  fields: NewTranscriptFields = {},
): Library {
  const transcript: Transcript = {
    ...TRANSCRIPT_DEFAULTS,
    ...fields,
    id: library.nextId,
    title,
    space,
  };
  return {
    ...library,
    nextId: library.nextId + 1,
    transcripts: [...library.transcripts, transcript],
  };
}

export function deleteTranscript(library: Library, id: number): Library {
  if (findTranscript(library, id) === null) return library;
  return { ...library, transcripts: library.transcripts.filter((t) => t.id !== id) };
}

export function setTitle(library: Library, id: number, title: string): Library {
  return withTranscript(library, id, () => ({ title }));
}

/** Move a transcript to another Space. A name that is not a Space changes nothing. */
export function setSpace(library: Library, id: number, space: string): Library {
  if (!library.spaces.includes(space)) return library;
  return withTranscript(library, id, () => ({ space }));
}

export function setText(library: Library, id: number, rawText: string): Library {
  return withTranscript(library, id, () => ({ rawText }));
}

export function setDraftText(library: Library, id: number, draftText: string): Library {
  return withTranscript(library, id, () => ({ draftText }));
}

/** Changes many times a second while reading. The store saves it at most once a second. */
export function setPosition(library: Library, id: number, position: number): Library {
  return withTranscript(library, id, (t) => (t.position === position ? null : { position }));
}

/** Changes many times during a drag of the slider. Saved like the position. */
export function setWpm(library: Library, id: number, wpm: number): Library {
  return withTranscript(library, id, (t) => (t.wpm === wpm ? null : { wpm }));
}

export function setPaused(library: Library, id: number, isPaused: boolean): Library {
  return withTranscript(library, id, () => ({ isPaused }));
}

export function setStopped(library: Library, id: number, isStopped: boolean): Library {
  return withTranscript(library, id, () => ({ isStopped }));
}

// The three colour setters are for a colour the person picked by hand, so
// the transcript stops following the app's default for that colour. Only
// when the colour really changed: picking the same colour again must not
// freeze it. See resyncDefaultReadingColors().

export function setFontColor(library: Library, id: number, color: string): Library {
  return withTranscript(library, id, (t) => ({
    fontColor: color,
    fontColorIsDefault: color !== t.fontColor ? false : t.fontColorIsDefault,
  }));
}

export function setHighlightColor(library: Library, id: number, color: string): Library {
  return withTranscript(library, id, (t) => ({
    highlightColor: color,
    highlightColorIsDefault: color !== t.highlightColor ? false : t.highlightColorIsDefault,
  }));
}

export function setBackgroundColor(library: Library, id: number, color: string): Library {
  return withTranscript(library, id, (t) => ({
    backgroundColor: color,
    backgroundColorIsDefault: color !== t.backgroundColor ? false : t.backgroundColorIsDefault,
  }));
}

/**
 * Give every transcript whose reading colours still follow the app's
 * default the colours passed in, and leave alone any colour the person
 * picked. Called once at the start with the colours of the theme in use.
 */
export function resyncDefaultReadingColors(
  library: Library,
  fontColor: string,
  highlightColor: string,
  backgroundColor: string,
): Library {
  let changed = false;
  const transcripts = library.transcripts.map((transcript) => {
    const fields: { -readonly [K in keyof Transcript]?: Transcript[K] } = {};
    if (transcript.fontColorIsDefault && transcript.fontColor !== fontColor) {
      fields.fontColor = fontColor;
    }
    if (transcript.highlightColorIsDefault && transcript.highlightColor !== highlightColor) {
      fields.highlightColor = highlightColor;
    }
    if (transcript.backgroundColorIsDefault && transcript.backgroundColor !== backgroundColor) {
      fields.backgroundColor = backgroundColor;
    }
    if (Object.keys(fields).length === 0) return transcript;
    changed = true;
    return { ...transcript, ...fields };
  });
  return changed ? { ...library, transcripts } : library;
}

export function setFontSize(library: Library, id: number, fontSize: number): Library {
  return withTranscript(library, id, () => ({ fontSize }));
}

/**
 * Set a transcript's chunking on or off together with its fixed size.
 * mode and charTarget keep what the transcript has when left out or null,
 * so the quick control (on or off, and a size) does not disturb them.
 */
export function setChunking(
  library: Library,
  id: number,
  enabled: boolean,
  size: number,
  mode: Transcript['chunkMode'] | null = null,
  charTarget: number | null = null,
): Library {
  return withTranscript(library, id, (t) => ({
    chunkingEnabled: enabled,
    chunkSize: size,
    chunkMode: mode ?? t.chunkMode,
    chunkCharTarget: charTarget ?? t.chunkCharTarget,
  }));
}

/**
 * Set a transcript's own speaker list: null for Auto, or label key to
 * shown name. It is cleaned on the way in, the same as when it is loaded.
 */
export function setSpeakers(library: Library, id: number, custom: unknown): Library {
  const cleaned = cleanCustomSpeakers(custom);
  return withTranscript(library, id, () => ({
    speakerCustom: cleaned === null ? null : Object.fromEntries(cleaned),
  }));
}

/** Keep what Normalize needs to undo itself. Two empty strings clear it. */
export function setNormalization(
  library: Library,
  id: number,
  preNormalizeText: string,
  normalizedText: string,
): Library {
  return withTranscript(library, id, () => ({ preNormalizeText, normalizedText }));
}

// ---- Bookmarks ----

/**
 * Add a bookmark at a word, with a short piece of the text around it. One
 * bookmark per word: a second one at the same word changes nothing, so the
 * first keeps its snippet and time. The list stays sorted by word.
 *
 * createdAt is the time now. The desktop stamps it itself, in UTC, as
 * Python's isoformat() writes it. Here the caller passes it, so this stays
 * free of the clock.
 */
export function addBookmark(
  library: Library,
  id: number,
  index: number,
  snippet: string,
  createdAt: string,
): Library {
  return withTranscript(library, id, (t) => {
    if (t.bookmarks.some((bookmark) => bookmark.index === index)) return null;
    const added: Bookmark = { ...BOOKMARK_DEFAULTS, index, snippet, createdAt };
    // A stable sort, so bookmarks that were already in order stay so.
    return { bookmarks: [...t.bookmarks, added].sort((a, b) => a.index - b.index) };
  });
}

export function removeBookmark(library: Library, id: number, index: number): Library {
  return withTranscript(library, id, (t) => {
    const remaining = t.bookmarks.filter((bookmark) => bookmark.index !== index);
    return remaining.length === t.bookmarks.length ? null : { bookmarks: remaining };
  });
}

/**
 * Set or clear the label of the bookmark at a word. An empty label clears
 * it, and the list then shows the snippet. Only the first bookmark at that
 * word is looked at.
 */
export function setBookmarkLabel(
  library: Library,
  id: number,
  index: number,
  label: string,
): Library {
  return withTranscript(library, id, (t) => {
    const at = t.bookmarks.findIndex((bookmark) => bookmark.index === index);
    const found = t.bookmarks[at];
    if (found === undefined || found.label === label) return null;
    const bookmarks = [...t.bookmarks];
    bookmarks[at] = { ...found, label };
    return { bookmarks };
  });
}

// ---- Reading totals ----

/**
 * Add one finished reading session to a transcript's totals. Called once
 * when a session ends, never for one still going.
 *
 * It counts as one more time read only when it lasted at least
 * MIN_ACTIVE_SECONDS_TO_COUNT_AS_READ. The words and the seconds, rounded
 * the way Python rounds, are added either way.
 */
export function addSessionStats(
  library: Library,
  id: number,
  wordsRead: number,
  activeSeconds: number,
): Library {
  return withTranscript(library, id, (t) => ({
    timesRead: t.timesRead + (activeSeconds >= MIN_ACTIVE_SECONDS_TO_COUNT_AS_READ ? 1 : 0),
    totalWordsRead: t.totalWordsRead + wordsRead,
    totalTimeSpentSeconds: t.totalTimeSpentSeconds + pyRound(activeSeconds),
  }));
}

// ---- Importing ----

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
