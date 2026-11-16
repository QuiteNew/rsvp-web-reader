// Export files: building one and reading one. Ported from
// core/data_bundle.py of the desktop app.
//
// A bundle is one JSON file with everything the app keeps: the library
// (transcripts and Spaces) and the settings. What an import then does with
// it is replaceAll() and mergeAll() in library.ts.
import type { Library } from './models';
import type { SavedBundle, SavedSettings } from './savedShapes';
import { parseData, toSavedData } from './storageFormat';

export const BUNDLE_FORMAT_VERSION = 1;

/** The name the desktop app suggests for an export file. */
export const BUNDLE_FILE_NAME = 'rsvp-reader-export.json';

export type ParsedBundle =
  | {
      readonly kind: 'ok';
      /** The library in the file, checked and tidied by parseData(). */
      readonly library: Library;
      /** The file's settings exactly as written. Reading them is the settings module's job. */
      readonly settings: SavedSettings;
    }
  /** message is written for the person and is shown as it is. */
  | { readonly kind: 'error'; readonly message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A quoted string the way Python shows one inside a list or a dict. */
function pyQuoted(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  return quote + text.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`) + quote;
}

/**
 * A value from a JSON file the way Python's str() shows it, for the one
 * message that names the file's format. Close, not exact: a number written
 * as 2.0 shows as 2 here, and a number too big for JavaScript loses its
 * last digits.
 */
function pyShown(value: unknown, nested = false): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return nested ? pyQuoted(value) : value;
  if (Array.isArray(value)) return `[${value.map((item) => pyShown(item, true)).join(', ')}]`;
  if (isObject(value)) {
    const entries = Object.entries(value).map(
      ([key, item]) => `${pyQuoted(key)}: ${pyShown(item, true)}`,
    );
    return `{${entries.join(', ')}}`;
  }
  return String(value);
}

/** An export bundle for this library and these settings, as an object. */
export function buildBundle(library: Library, settings: SavedSettings): SavedBundle {
  return {
    bundle_format: BUNDLE_FORMAT_VERSION,
    data: toSavedData(library),
    settings,
  };
}

/**
 * The text of an export file. Indented by two, like the desktop's. The
 * desktop also writes every character outside ASCII as a \u escape, and
 * this does not. Both read back the same on either side.
 */
export function bundleText(bundle: SavedBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Read the text of a file someone wants to import. Gives the library and
 * the raw settings, or the message to show when the file is not a bundle
 * this app can read. The five messages are the desktop's, word for word.
 */
export function parseBundle(jsonText: string): ParsedBundle {
  const error = (message: string): ParsedBundle => ({ kind: 'error', message });

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return error("That file isn't valid JSON, so it can't be an RSVP Reader export.");
  }

  if (!isObject(raw) || !Object.hasOwn(raw, 'bundle_format')) {
    return error("That file doesn't look like an RSVP Reader export bundle.");
  }

  const version = raw.bundle_format;
  // In Python True equals 1, so the desktop lets "bundle_format": true in.
  if (version !== BUNDLE_FORMAT_VERSION && version !== true) {
    return error(
      `This bundle was made by a different version of RSVP Reader (format ${pyShown(version)}, ` +
        `this app reads format ${BUNDLE_FORMAT_VERSION}) and can't be imported here.`,
    );
  }

  if (!isObject(raw.data) || !isObject(raw.settings)) {
    return error('That file is missing data this app expects in an export bundle.');
  }

  const library = parseData(raw.data);
  if (library === null) {
    return error("The transcript data in that file is malformed and can't be imported.");
  }

  return { kind: 'ok', library, settings: raw.settings };
}
