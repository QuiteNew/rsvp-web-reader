// The ways the sidebar can sort a Space's transcripts. Ported from
// core/transcript_sort.py of the desktop app.
//
// Each order has a short id, which is what gets saved in the settings, and
// a label, which is what the sort menu shows. Keeping the two apart means a
// label can be reworded later without the saved choice of everyone who
// picked it quietly going back to the default.
import type { Transcript } from './models';
import { pyCompareText, pyLower } from './pythonText';

/** What sorting looks at. A whole Transcript fits. */
export type Sortable = Pick<Transcript, 'id' | 'title' | 'timesRead' | 'totalTimeSpentSeconds'>;

export interface SortOrder {
  /** What the sort menu shows. */
  readonly label: string;
  /** Turns a transcript into the value it is sorted by. */
  readonly key: (transcript: Sortable) => string | number;
  readonly reverse: boolean;
}

const byTitle = (transcript: Sortable): string => pyLower(transcript.title);

// In the order the sort menu shows them.
//
// "Date added" goes by the transcript's id, since a transcript has no date
// of its own. Ids are handed out in increasing order and are never reused,
// so id order is the order the transcripts were added in.
//
// "Most read" and "Most time spent reading" only come most first: there is
// no everyday reason to want the least read ones at the top.
export const SORT_ORDERS = {
  title_az: { label: 'Title (A–Z)', key: byTitle, reverse: false },
  title_za: { label: 'Title (Z–A)', key: byTitle, reverse: true },
  newest: { label: 'Date added (newest first)', key: (t) => t.id, reverse: true },
  oldest: { label: 'Date added (oldest first)', key: (t) => t.id, reverse: false },
  most_read: { label: 'Most read', key: (t) => t.timesRead, reverse: true },
  most_time: {
    label: 'Most time spent reading',
    key: (t) => t.totalTimeSpentSeconds,
    reverse: true,
  },
} as const satisfies Record<string, SortOrder>;

export type SortId = keyof typeof SORT_ORDERS;

/**
 * The order the list had before it could be sorted at all, and still the
 * one a new install starts with.
 */
export const DEFAULT_SORT: SortId = 'oldest';

/**
 * sortId if it is one of SORT_ORDERS, otherwise DEFAULT_SORT. Something odd
 * in the saved settings, or an order a newer version added, reads as the
 * default instead of breaking the list.
 */
export function knownSort(sortId: unknown): SortId {
  if (typeof sortId === 'string' && Object.hasOwn(SORT_ORDERS, sortId)) {
    return sortId as SortId;
  }
  return DEFAULT_SORT;
}

function compareKeys(a: string | number, b: string | number): number {
  if (typeof a === 'string' && typeof b === 'string') return pyCompareText(a, b);
  return (a as number) - (b as number);
}

/**
 * The transcripts in the order sortId names, as a new list. Transcripts
 * that tie, say two with the same title, stay in the order they came in,
 * in a reversed order as well. That is what Python's sorted() does, and it
 * is why a reversed order is not the forward one turned around.
 */
export function sortTranscripts<T extends Sortable>(
  transcripts: readonly T[],
  sortId: unknown,
): T[] {
  const order: SortOrder = SORT_ORDERS[knownSort(sortId)];
  const direction = order.reverse ? -1 : 1;
  // Array.prototype.sort is stable, so ties keep their order either way.
  return [...transcripts].sort((a, b) => direction * compareKeys(order.key(a), order.key(b)));
}
