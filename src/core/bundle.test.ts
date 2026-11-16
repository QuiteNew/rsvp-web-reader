// Export files and the two ways of importing one, against the desktop's
// data_bundle.py and the replace_all() and merge_all() of its store.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import {
  BUNDLE_FILE_NAME,
  BUNDLE_FORMAT_VERSION,
  buildBundle,
  bundleText,
  parseBundle,
} from './bundle';
import { mergeAll, replaceAll } from './library';
import { DEFAULT_SPACE, EMPTY_LIBRARY, TRANSCRIPT_DEFAULTS, type Library } from './models';
import { parseData, toSavedData } from './storageFormat';

const fixture = loadFixture('bundle');

function constant(name: string): unknown {
  return (fixture.functions.constants ?? []).find(([args]) => args[0] === name)?.[1];
}

function library(saved: unknown): Library {
  const parsed = parseData(saved);
  if (parsed === null) throw new Error('The fixture holds a library that cannot be read');
  return parsed;
}

describe('against the Python fixtures', () => {
  test('parse_bundle', () => {
    expectToMatchFixture(fixture, 'parse_bundle', ([text]) => {
      const parsed = parseBundle(text as string);
      return parsed.kind === 'ok'
        ? ['ok', toSavedData(parsed.library), parsed.settings]
        : ['error', parsed.message];
    });
  });

  test('replace_all', () => {
    expectToMatchFixture(fixture, 'replace_all', ([incoming]) =>
      toSavedData(replaceAll(library(incoming))),
    );
  });

  test('merge_all', () => {
    expectToMatchFixture(fixture, 'merge_all', ([current, incoming]) =>
      // The fixture's store was filled by replace_all first.
      toSavedData(mergeAll(replaceAll(library(current)), library(incoming))),
    );
  });

  test('the constants', () => {
    expect(BUNDLE_FORMAT_VERSION).toBe(constant('BUNDLE_FORMAT_VERSION'));
    expect(DEFAULT_SPACE).toBe(constant('DEFAULT_SPACE'));
  });
});

const ONE: Library = {
  nextId: 3,
  currentSpaceIndex: 1,
  spaces: ['General', 'Work'],
  transcripts: [
    { ...TRANSCRIPT_DEFAULTS, id: 1, title: 'Café \u{1F600}', space: 'Work', position: 4 },
    { ...TRANSCRIPT_DEFAULTS, id: 2, title: 'Two', space: 'General' },
  ],
};

describe('an export file', () => {
  test('has the three parts the desktop expects', () => {
    const bundle = buildBundle(ONE, { default_wpm: 450 });
    expect(Object.keys(bundle)).toEqual(['bundle_format', 'data', 'settings']);
    expect(bundle.bundle_format).toBe(1);
    expect(bundle.settings).toEqual({ default_wpm: 450 });
    expect(bundle.data.transcripts).toHaveLength(2);
  });

  test('is read back as the same library and settings', () => {
    const parsed = parseBundle(bundleText(buildBundle(ONE, { default_wpm: 450 })));
    expect(parsed).toEqual({ kind: 'ok', library: ONE, settings: { default_wpm: 450 } });
  });

  test('is indented by two and keeps characters as they are', () => {
    const text = bundleText(buildBundle(EMPTY_LIBRARY, {}));
    expect(text.startsWith('{\n  "bundle_format": 1,\n  "data": {\n    "next_id": 1,')).toBe(true);
    expect(bundleText(buildBundle(ONE, {}))).toContain('Café \u{1F600}');
  });

  test('is suggested the same name as on the desktop', () => {
    expect(BUNDLE_FILE_NAME).toBe('rsvp-reader-export.json');
  });
});

describe('importing', () => {
  test('neither way changes the libraries it is given', () => {
    const before = JSON.stringify([ONE, EMPTY_LIBRARY]);
    replaceAll(ONE);
    mergeAll(ONE, ONE);
    mergeAll(EMPTY_LIBRARY, ONE);
    expect(JSON.stringify([ONE, EMPTY_LIBRARY])).toBe(before);
  });

  test('Expand gives every incoming transcript a new id and keeps the rest', () => {
    const merged = mergeAll(ONE, ONE);
    expect(merged.transcripts.map((transcript) => transcript.id)).toEqual([1, 2, 3, 4]);
    expect(merged.transcripts[2]).toEqual({ ...ONE.transcripts[0], id: 3 });
    expect(merged.nextId).toBe(5);
    expect(merged.spaces).toEqual(['General', 'Work']);
    expect(merged.currentSpaceIndex).toBe(1);
  });
});
