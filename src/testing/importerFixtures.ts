// Helpers for the tests in src/importers: reading importers.json, which the
// fixture script wrote from the desktop's core/importers.py. Used by tests
// only.

import { loadFixture } from './fixtures';

export const fixture = loadFixture('importers');

/** The fixture keeps bytes as a string with one character per byte. */
export function bytesOf(byteString: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(byteString, (character) => character.charCodeAt(0));
}

/** True when the bytes are valid UTF-8, so the desktop did not fall back. */
export function isUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

// Windows-1252 for bytes 0x80 to 0x9F, where it differs from Latin-1. Taken
// from Python's cp1252 codec; the five bytes it leaves unassigned (0x81,
// 0x8D, 0x8F, 0x90, 0x9D) stay what Latin-1 makes of them, as the browser
// does. Written out here, not asked of TextDecoder, so the test does not
// check the browser against itself.
const WINDOWS_1252_HIGH: Readonly<Record<number, number>> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

/**
 * What the web app gives where the desktop read a file as Latin-1: the
 * same text, with the characters 0x80 to 0x9F swapped for Windows-1252's.
 * The one written difference between the two (see decodeText.ts).
 */
export function asWindows1252(latin1Text: string): string {
  return Array.from(latin1Text, (character) => {
    const swapped = WINDOWS_1252_HIGH[character.charCodeAt(0)];
    return swapped === undefined ? character : String.fromCodePoint(swapped);
  }).join('');
}
