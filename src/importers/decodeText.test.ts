import { describe, expect, test } from 'vitest';
import { decodeText } from './decodeText';
import { asWindows1252, bytesOf, fixture, isUtf8 } from '../testing/importerFixtures';

type Case = [[byteString: string], { text: string }];

describe('against the desktop, through import_txt', () => {
  const cases = fixture.functions['read_text_with_fallback'] as unknown as Case[];

  test('there are cases of both kinds', () => {
    const fallbacks = cases.filter(([[bytes]]) => !isUtf8(bytesOf(bytes)));
    expect(fallbacks.length).toBeGreaterThan(5);
    expect(cases.length - fallbacks.length).toBeGreaterThan(5);
  });

  test('valid UTF-8 reads exactly as on the desktop', () => {
    for (const [[bytes], answer] of cases) {
      if (isUtf8(bytesOf(bytes))) expect(decodeText(bytesOf(bytes))).toBe(answer.text);
    }
  });

  test('anything else reads as on the desktop, but with Windows-1252 for 0x80 to 0x9F', () => {
    for (const [[bytes], answer] of cases) {
      if (!isUtf8(bytesOf(bytes))) {
        expect(decodeText(bytesOf(bytes))).toBe(asWindows1252(answer.text));
      }
    }
  });
});

describe('in short', () => {
  test('a byte order mark at the start is dropped, a second one is kept', () => {
    expect(decodeText(bytesOf('\xef\xbb\xbfHi'))).toBe('Hi');
    expect(decodeText(bytesOf('\xef\xbb\xbf\xef\xbb\xbfHi'))).toBe('\ufeffHi');
  });

  test("an old Windows file's quotes and dash come out as quotes and a dash", () => {
    expect(decodeText(bytesOf('\x93Hi\x94 \x96 caf\xe9'))).toBe('\u201cHi\u201d \u2013 caf\u00e9');
  });

  test('one bad byte in otherwise good UTF-8 makes the whole file Windows-1252', () => {
    expect(decodeText(bytesOf('caf\xc3\xa9 \xe9'))).toBe('caf\u00c3\u00a9 \u00e9');
  });
});
