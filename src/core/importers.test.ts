import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import {
  SUPPORTED_EXTENSIONS,
  fileStem,
  fileSuffix,
  finishImport,
  importMd,
  importSrt,
  importSuffix,
  importVtt,
  stripInlineMd,
  unsupportedTypeMessage,
} from './importers';

const fixture = loadFixture('importers');

// Each importer case is the text the desktop worked on and its answer,
// {"text": ...}. These importers never fail, so there is no {"error": ...}
// to expect.
describe('against the Python fixtures', () => {
  const cases: [string, (text: string) => string][] = [
    ['import_srt', importSrt],
    ['import_vtt', importVtt],
    ['import_md', importMd],
  ];

  test.each(cases)('%s', (pythonName, run) => {
    expectToMatchFixture(fixture, pythonName, ([text]) => ({ text: run(text as string) }));
  });

  test('_strip_inline_md', () => {
    expectToMatchFixture(fixture, 'strip_inline_md', ([line]) => stripInlineMd(line as string));
  });
});

// The desktop's own tests for these importers, as recorded by the fixture
// script from tests/test_importers.py: the file each test wrote, as bytes,
// and the answer. The bytes are decoded here the way the desktop decodes a
// file: UTF-8 without a byte order mark, and Latin-1 when that fails.
// (The web app reads Windows-1252 there instead, which src/importers/ tests.)

type RecordedCall = [name: string, fileName: string, bytes: string, answer: { text?: string }];

function decodeLikeTheDesktop(byteString: string): string {
  const bytes = Uint8Array.from(byteString, (character) => character.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return byteString;
  }
}

const IMPORTERS: Record<string, (text: string) => string> = {
  import_srt: importSrt,
  import_vtt: importVtt,
  import_md: importMd,
};

const recorded = (fixture.functions['desktop_tests'] ?? []) as unknown as [
  [testName: string],
  RecordedCall[],
][];

const desktopTests = recorded
  .map(([[testName], calls]) => [testName, calls.filter(([name]) => name in IMPORTERS)] as const)
  .filter(([, calls]) => calls.length > 0);

describe('the desktop tests', () => {
  test('were recorded', () => {
    expect(desktopTests.length).toBeGreaterThanOrEqual(20);
  });

  test.each(desktopTests)('%s', (_testName, calls) => {
    for (const [name, , bytes, answer] of calls) {
      const run = IMPORTERS[name];
      if (!run) throw new Error(`no port for ${name}`);
      expect({ text: run(decodeLikeTheDesktop(bytes)) }).toEqual(answer);
    }
  });
});

// A few cases spelled out, so what each importer does can be read here
// without opening the fixture file.
describe('in short', () => {
  test('.srt keeps the words and drops numbers, timings and tags', () => {
    expect(importSrt('1\n00:00:01,000 --> 00:00:04,000\n<i>Hello</i> world.\n\n2\n')).toBe(
      'Hello world.',
    );
  });

  test('.srt drops a line of digits from any script, as Python does', () => {
    expect(importSrt('\u00b2\n\u2460\n\u0663\u0664\nkept')).toBe('kept');
  });

  test('.vtt drops the header, notes, style blocks and cue names', () => {
    const vtt = 'WEBVTT\n\nNOTE x\n\nSTYLE\n::cue {}\n\nintro\n00:01.000 --> 00:02.000\nHi\n';
    expect(importVtt(vtt)).toBe('Hi');
  });

  test('Markdown keeps the text of headings, lists, links and code', () => {
    const md = '# Title\n\n- **one** [link](x)\n\n```\ncode\n```\n---\nsnake_case';
    expect(importMd(md)).toBe('Title\n\none link\n\ncode\nsnake_case');
  });

  test('a line break Python knows and JavaScript does not still ends a line', () => {
    expect(importSrt('one\u0085two')).toBe('one\ntwo');
  });
});

describe('file names, against Python', () => {
  test('SUPPORTED_EXTENSIONS', () => {
    expectToMatchFixture(fixture, 'supported_extensions', () => [...SUPPORTED_EXTENSIONS].sort());
  });

  test('Path(name).suffix', () => {
    expectToMatchFixture(fixture, 'path_suffix', ([name]) => fileSuffix(name as string));
  });

  test('Path(name).stem', () => {
    expectToMatchFixture(fixture, 'path_stem', ([name]) => fileStem(name as string));
  });

  test('Path(name).suffix.lower()', () => {
    expectToMatchFixture(fixture, 'suffix_lower', ([name]) => importSuffix(name as string));
  });
});

describe('finishImport', () => {
  test('tidies the text and offers the name without its extension as the title', () => {
    expect(finishImport('My talk.srt', '  Hello   there.  \n\n\n\nBye.')).toEqual({
      kind: 'text',
      title: 'My talk',
      text: 'Hello there.\n\nBye.',
    });
  });

  test('text that ends up empty is an error with the desktop message', () => {
    expect(finishImport('empty.txt', ' \n[00:00:01]\n')).toEqual({
      kind: 'error',
      message: "empty.txt didn't contain any readable text.",
    });
  });

  test('an unknown type names its extension, or the whole name when it has none', () => {
    expect(unsupportedTypeMessage('photo.JPG')).toBe('Unsupported file type: .jpg');
    expect(unsupportedTypeMessage('README')).toBe('Unsupported file type: README');
    expect(unsupportedTypeMessage('.txt')).toBe('Unsupported file type: .txt');
  });
});
