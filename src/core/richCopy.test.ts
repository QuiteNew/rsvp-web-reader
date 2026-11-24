import { describe, expect, test } from 'vitest';
import { loadFixture } from '../testing/fixtures';
import { htmlFragment, piecesText, type Piece } from './richCopy';

const fixture = loadFixture('rich_copy');

type Case = [[[string, boolean][]], string];

function piecesOf(raw: readonly [string, boolean][]): Piece[] {
  return raw.map(([text, bold]) => ({ text, bold }));
}

function fragment(...raw: [string, boolean][]): string {
  return htmlFragment(piecesOf(raw));
}

describe('against the desktop', () => {
  test('htmlFragment writes what cf_html puts between its fragment markers', () => {
    const cases = fixture.functions['html_fragment'] as unknown as Case[];
    expect(cases.length).toBeGreaterThan(600);
    const wrong = cases.filter(([[raw], html]) => htmlFragment(piecesOf(raw)) !== html);
    expect(wrong.slice(0, 3)).toEqual([]);
  });

  test('piecesText joins the pieces as segments_text does', () => {
    const cases = fixture.functions['segments_text'] as unknown as Case[];
    expect(cases.length).toBeGreaterThan(400);
    const wrong = cases.filter(([[raw], text]) => piecesText(piecesOf(raw)) !== text);
    expect(wrong.slice(0, 3)).toEqual([]);
  });
});

// The cases of the desktop's tests/test_rich_copy.py, kept here so each rule
// reads as a plain example. The fixture above already proves them.

describe('what is written', () => {
  test('a bold stretch is wrapped and the rest is not', () => {
    expect(fragment(['ab', true], ['cd', false])).toBe('<p style="margin:0"><b>ab</b>cd</p>');
  });

  test('neighbouring pieces with the same boldness join into one stretch', () => {
    expect(fragment(['ab', true], ['cd', true], ['ef', false], ['gh', false])).toBe(
      '<p style="margin:0"><b>abcd</b>efgh</p>',
    );
  });

  test('markup characters are escaped and quotes stay', () => {
    expect(fragment(['<b>&amp;</b>', false])).toBe(
      '<p style="margin:0">&lt;b&gt;&amp;amp;&lt;/b&gt;</p>',
    );
    expect(fragment(['say "hi" it\'s', false])).toBe('<p style="margin:0">say "hi" it\'s</p>');
  });

  test('each line is a paragraph, and bold is closed and opened again across one', () => {
    expect(fragment(['one\ntwo', false])).toBe(
      '<p style="margin:0">one</p><p style="margin:0">two</p>',
    );
    expect(fragment(['ab\ncd', true])).toBe(
      '<p style="margin:0"><b>ab</b></p><p style="margin:0"><b>cd</b></p>',
    );
  });

  test('an empty line keeps a row, and no text is one empty paragraph', () => {
    expect(fragment(['one\n\ntwo', false])).toBe(
      '<p style="margin:0">one</p><p style="margin:0">&nbsp;</p><p style="margin:0">two</p>',
    );
    expect(fragment()).toBe('<p style="margin:0">&nbsp;</p>');
  });

  test('a lone space stays, and spaces HTML would drop become non-breaking', () => {
    expect(fragment(['a b c', false])).toBe('<p style="margin:0">a b c</p>');
    expect(fragment(['a  b', false])).toBe('<p style="margin:0">a&nbsp;&nbsp;b</p>');
    expect(fragment(['   a', false])).toBe('<p style="margin:0">&nbsp;&nbsp;&nbsp;a</p>');
    expect(fragment([' ', false])).toBe('<p style="margin:0">&nbsp;</p>');
  });

  test('a space is judged by the line, whatever its boldness', () => {
    expect(fragment(['a ', false], ['b', true])).toBe('<p style="margin:0">a <b>b</b></p>');
    expect(fragment(['a ', false], [' b', true])).toBe(
      '<p style="margin:0">a&nbsp;<b>&nbsp;b</b></p>',
    );
  });

  test('a tab is four non-breaking spaces', () => {
    expect(fragment(['a\tb', false])).toBe('<p style="margin:0">a&nbsp;&nbsp;&nbsp;&nbsp;b</p>');
  });

  test('control characters and carriage returns are left out of the HTML only', () => {
    const pieces = piecesOf([['a\r\nb\x00c\x1bd\x7fe\x85f', false]]);
    expect(htmlFragment(pieces)).toBe('<p style="margin:0">a</p><p style="margin:0">bcdef</p>');
    expect(piecesText(pieces)).toBe('a\r\nb\x00c\x1bd\x7fe\x85f');
  });

  test('only a line feed ends a line', () => {
    const html = fragment(['a\u2028b\u2029c', false]);
    expect(html.match(/<p/g)).toHaveLength(1);
  });

  test('an emoji is written as it is', () => {
    expect(fragment(['\u041f\u0440\u0438\u0432\u0435\u0442 \u{1F600}', true])).toBe(
      '<p style="margin:0"><b>\u041f\u0440\u0438\u0432\u0435\u0442 \u{1F600}</b></p>',
    );
  });
});
