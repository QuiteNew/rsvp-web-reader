import { describe, expect, test } from 'vitest';
import { boldSegments } from './boldSegments';
import { boldRanges } from './boldStarts';
import { characters } from './pythonText';

const EMOJI = '\u{1F600}';

function plain(text: string): { text: string; bold: boolean } {
  return { text, bold: false };
}
function bold(text: string): { text: string; bold: boolean } {
  return { text, bold: true };
}

describe('boldSegments', () => {
  test('a sentence alternates bold starts and the rest', () => {
    expect(boldSegments('The quick fox.')).toEqual([
      bold('Th'),
      plain('e '),
      bold('qui'),
      plain('ck '),
      bold('fo'),
      plain('x.'),
    ]);
  });

  test('empty text has no pieces', () => {
    expect(boldSegments('')).toEqual([]);
  });

  test('text with no word in it is one plain piece', () => {
    expect(boldSegments('12 ... 34')).toEqual([plain('12 ... 34')]);
    expect(boldSegments('\u4f60\u597d')).toEqual([plain('\u4f60\u597d')]);
  });

  test('a text that is one bold stretch has one piece', () => {
    expect(boldSegments('a')).toEqual([bold('a')]);
  });

  test('line breaks stay in the plain pieces, so every line starts bold', () => {
    expect(boldSegments('ab\ncd')).toEqual([bold('a'), plain('b\n'), bold('c'), plain('d')]);
  });

  test('an emoji is one character, so the pieces after it are cut in the right place', () => {
    expect(boldSegments(`hello ${EMOJI} world`)).toEqual([
      bold('hel'),
      plain(`lo ${EMOJI} `),
      bold('wor'),
      plain('ld'),
    ]);
  });

  test('a combining accent stays inside its bold piece', () => {
    expect(boldSegments('cafe\u0301')).toEqual([bold('ca'), plain('fe\u0301')]);
    expect(boldSegments('ca\u0301fe')).toEqual([bold('ca\u0301'), plain('fe')]);
  });

  test('the pieces put back together give the text, with no empty piece', () => {
    const texts = [
      "Hello, world! It's a well-known fact (see https://example.com/x) that 3rd",
      `${EMOJI}${EMOJI} abc ${EMOJI} inter\u00adnational \u041f\u0440\u0438\u0432\u0435\u0442`,
      '\n\n  spaced   out \t text \n',
    ];
    for (const text of texts) {
      const pieces = boldSegments(text);
      expect(pieces.map((piece) => piece.text).join('')).toBe(text);
      for (const [index, piece] of pieces.entries()) {
        expect(piece.text).not.toBe('');
        if (index > 0) expect(piece.bold).not.toBe(pieces[index - 1]!.bold);
      }
    }
  });

  test('the bold pieces are the stretches boldRanges names', () => {
    const text = `well-known ${EMOJI} state-of-the-art audience`;
    const chars = characters(text);
    const fromRanges = boldRanges(text).map(([start, end]) => chars.slice(start, end).join(''));
    const fromPieces = boldSegments(text)
      .filter((piece) => piece.bold)
      .map((piece) => piece.text);
    expect(fromPieces).toEqual(fromRanges);
  });
});
