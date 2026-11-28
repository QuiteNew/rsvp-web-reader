import { describe, expect, test } from 'vitest';
import { bytesOf, fixture } from '../testing/importerFixtures';
import { decodeHtml, importHtml } from './importHtml';

// The desktop's answer: the text, or the name of an error it does not catch.
type Case = [[byteString: string], { text?: string; crash?: string }];

// Where the web app gives something other than the desktop, on purpose or
// because the browser parses HTML a little differently from lxml: the page,
// as the fixture keeps it, and what the web app gives. Every other page has
// to come out exactly as on the desktop.
const DIFFERENCES = new Map<string, string>([
  // The parser: a <noscript> before the body with plain text in it. The browser's HTML parser moves the text out of it into the body, so it is not dropped with it, where lxml keeps it inside. Saved pages put <style> or <link> in such a <noscript>, and those stay inside.
  [
    '<noscript>No script</noscript><template><p>Template</p></template><p>Kept</p>',
    'No script\nKept',
  ],
  // No encoding named, UTF-8 bytes: read as UTF-8, where the desktop reads Latin-1.
  [
    '<html><body><p>Caf\u00c3\u00a9 \u00e2\u0080\u009cq\u00e2\u0080\u009d with no charset</p></body></html>',
    'Caf\u00e9 \u201cq\u201d with no charset',
  ],
  // No encoding named, not UTF-8: read as Windows-1252, where the desktop reads Latin-1.
  [
    '<html><body><p>Caf\u00e9 \u0093q\u0094 with no charset</p></body></html>',
    'Caf\u00e9 \u201cq\u201d with no charset',
  ],
  // An encoding named only in an XML declaration is not looked at, as in a browser, so the bytes are read as Windows-1252.
  [
    '<?xml version="1.0" encoding="iso-8859-1"?><html><body><p>Caf\u00e9</p></body></html>',
    'Caf\u00e9',
  ],
  // An encoding the browser does not know counts as none named, so the UTF-8 bytes are read as UTF-8.
  ['<meta charset="no-such-encoding"><p>Caf\u00c3\u00a9</p>', 'Caf\u00e9'],
  // The text right after a dropped element is kept, the owner's choice. lxml counts it as part of the element, so the desktop drops it too.
  ['<p>a<script>x</script>b</p>', 'ab'],
  // The same, after a <noscript> and a <style>. The desktop even loses " d " in the middle of the second line.
  ['<div>a<noscript>n</noscript>tail</div><p>c<style>s</style> d <b>e</b></p>', 'atail\nc d e'],
  // The same, after a <template>.
  ['<p>a<template>t</template>after</p>', 'aafter'],
  // A page whose body starts with a <script> and then loose text: the desktop loses that text entirely.
  [
    '<body><script>x</script>Loose text after a script<p>p</p></body>',
    'Loose text after a script\np',
  ],
  // The desktop crashes on a control character inside a block (lxml refuses it in the line marks the desktop adds) and shows no message. Python counts these as spaces.
  ['<p>a\u001cb\u001fc</p>', 'a b c'],
  // The same crash, for a form feed.
  ['<p>page one\fpage two</p>', 'page one page two'],
  // The same crash, for a vertical tab.
  ['<div>outside a block\u000b<span>ok</span></div>', 'outside a block ok'],
]);

describe('against import_html() on the desktop', () => {
  const cases = fixture.functions['import_html'] as unknown as Case[];

  test('the same text for every page but the listed ones', () => {
    const different = cases.filter(
      ([[bytes], answer]) => importHtml(bytesOf(bytes)) !== answer.text,
    );
    expect(different.map(([[bytes]]) => bytes).sort()).toEqual([...DIFFERENCES.keys()].sort());
  });

  test.each([...DIFFERENCES])('the listed difference for %j', (bytes, web) => {
    const desktop = cases.find(([[page]]) => page === bytes)?.[1];
    expect(desktop).toBeDefined();
    expect(desktop?.text).not.toBe(web);
    expect(importHtml(bytesOf(bytes))).toBe(web);
  });
});

// The desktop's own tests, as recorded by the fixture script: every call a
// test made to import_html(), with the page it wrote.
type RecordedCall = [name: string, fileName: string, bytes: string, answer: { text?: string }];

const recorded = (fixture.functions['desktop_tests'] ?? []) as unknown as [
  [testName: string],
  RecordedCall[],
][];

const desktopTests = recorded
  .map(
    ([[testName], calls]) => [testName, calls.filter(([name]) => name === 'import_html')] as const,
  )
  .filter(([, calls]) => calls.length > 0);

describe('the desktop tests', () => {
  test('were recorded', () => {
    expect(desktopTests.length).toBeGreaterThanOrEqual(10);
  });

  test.each(desktopTests)('%s', (_testName, calls) => {
    for (const [, , bytes, answer] of calls) {
      expect({ text: importHtml(bytesOf(bytes)) }).toEqual(answer);
    }
  });
});

describe('decodeHtml', () => {
  test('a byte order mark wins over everything', () => {
    expect(decodeHtml(bytesOf('\xef\xbb\xbf<meta charset="windows-1252">\xc3\xa9'))).toBe(
      '<meta charset="windows-1252">é',
    );
    expect(decodeHtml(bytesOf('\xff\xfeh\x00i\x00'))).toBe('hi');
    expect(decodeHtml(bytesOf('\xfe\xff\x00h\x00i'))).toBe('hi');
  });

  test('the encoding named in a <meta> tag is used', () => {
    expect(decodeHtml(bytesOf('<meta charset=windows-1252>\x93q\x94'))).toBe(
      '<meta charset=windows-1252>“q”',
    );
    expect(decodeHtml(bytesOf("<META content='text/html; charset=UTF-8'>\xc3\xa9"))).toBe(
      "<META content='text/html; charset=UTF-8'>é",
    );
  });

  test('a UTF-16 label in a <meta> tag means UTF-8, as in a browser', () => {
    expect(decodeHtml(bytesOf('<meta charset="utf-16">\xc3\xa9'))).toBe('<meta charset="utf-16">é');
  });

  test('with no encoding named, UTF-8 if the bytes are UTF-8, else Windows-1252', () => {
    expect(decodeHtml(bytesOf('<p>\xc3\xa9</p>'))).toBe('<p>é</p>');
    expect(decodeHtml(bytesOf('<p>\x93\xe9\x94</p>'))).toBe('<p>“é”</p>');
  });
});

describe('importHtml, in short', () => {
  test('blocks and <br> start new lines, inline elements do not', () => {
    expect(importHtml(bytesOf('<p>One <b>two</b><br>three</p><ul><li>four</li></ul>'))).toBe(
      'One two\nthree\nfour',
    );
  });

  test('scripts, styles and the head are dropped, and the text right after them is kept', () => {
    expect(importHtml(bytesOf('<head><title>T</title></head><p>a<script>x</script>b</p>'))).toBe(
      'ab',
    );
  });
});
