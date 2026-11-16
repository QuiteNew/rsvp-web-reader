// Which transcript to open when the app starts. Ported from core/reopen.py
// of the desktop app.
import type { Transcript } from './models';

/**
 * The transcript to open at the start, or null to start with none open.
 *
 * Null when the "reopen the last transcript" setting is off, when nothing
 * was open last time, or when that transcript no longer exists (it was
 * deleted, or an import replaced the data). The transcript is found in any
 * Space: the app keeps it open across a switch of Space, so it comes back
 * the same way.
 */
export function transcriptToReopen<T extends Pick<Transcript, 'id'>>(
  enabled: boolean,
  lastTranscriptId: number | null,
  transcripts: readonly T[],
): T | null {
  if (!enabled || lastTranscriptId === null) return null;
  return transcripts.find((transcript) => transcript.id === lastTranscriptId) ?? null;
}
