// The way in for every file: importFile() takes the File someone picked and
// gives back the text and a title, or a message to show as it is. The port
// of import_file() in the desktop's core/importers.py.
//
// The importer is picked by the file's extension, before the file is read,
// as on the desktop. Each importer turns the bytes into raw text, and
// finishImport() in core tidies it and turns empty text into an error.

import {
  finishImport,
  importMd,
  importSrt,
  importSuffix,
  importVtt,
  unsupportedTypeMessage,
  type ImportResult,
} from '../core/importers';
import { decodeText } from './decodeText';

type Importer = (bytes: Uint8Array) => string;

// HTML, Word and PDF are added here in their own steps of phase 5. Until
// then those files are refused as an unsupported type. Nothing offers
// importing yet, so nobody can meet that.
const IMPORTERS: ReadonlyMap<string, Importer> = new Map<string, Importer>([
  ['.txt', decodeText],
  ['.srt', (bytes) => importSrt(decodeText(bytes))],
  ['.vtt', (bytes) => importVtt(decodeText(bytes))],
  ['.md', (bytes) => importMd(decodeText(bytes))],
  ['.markdown', (bytes) => importMd(decodeText(bytes))],
]);

export async function importFile(file: File): Promise<ImportResult> {
  const importer = IMPORTERS.get(importSuffix(file.name));
  if (importer === undefined) {
    return { kind: 'error', message: unsupportedTypeMessage(file.name) };
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    // The file went away or may not be read, between picking it and now.
    // The desktop has no message for this, so this one is the web app's.
    return { kind: 'error', message: `Couldn't read ${file.name}.` };
  }
  return finishImport(file.name, importer(bytes));
}
