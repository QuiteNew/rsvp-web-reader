// Adding a transcript from a file, the screen's side: which files the
// picker offers, reading the picked file, and the heads-up for a very long
// one. The port of _handle_add_from_file_requested() in the desktop's
// gui/app.py.

import { SUPPORTED_EXTENSIONS, type ImportResult } from '../core/importers';
import { tokenize } from '../core/tokenizer';

/** What the file picker offers: every type the desktop imports. */
export const IMPORT_ACCEPT = [...SUPPORTED_EXTENSIONS].sort().join(',');

// Above this many words the desktop warns before the transcript is added.
// Its comment says this is a starting guess, not a measured limit: someone
// reported a crash after importing a whole book, which was never
// reproduced.
export const LARGE_IMPORT_WORDS = 30_000;

/**
 * The heads-up for a file over LARGE_IMPORT_WORDS words, or undefined. The
 * words are counted the way the reader splits them, and the wording is the
 * desktop's, word for word, app name included (the owner's choice on
 * 2026-11-23).
 */
export function largeImportWarning(text: string): string | undefined {
  const words = tokenize(text).length;
  if (words <= LARGE_IMPORT_WORDS) return undefined;
  return (
    `Heads up: this file is about ${words.toLocaleString('en-US')} words long. ` +
    'Very large transcripts have been known to crash RSVP Reader. If that ' +
    'happens, try splitting the file into smaller parts and importing those ' +
    'instead.'
  );
}

/**
 * Reads the picked file. The importers, and pdf.js behind them, are loaded
 * here and not before, so the page itself stays small. An error nobody
 * planned for (a bug, or the importers failing to load) still ends in a
 * message, not in silence.
 */
export async function readPickedFile(file: File): Promise<ImportResult> {
  try {
    const { importFile } = await import('../importers/importFile');
    return await importFile(file);
  } catch {
    return { kind: 'error', message: `Something went wrong while reading ${file.name}.` };
  }
}
