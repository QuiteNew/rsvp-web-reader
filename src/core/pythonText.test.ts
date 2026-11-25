import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import {
  PY_DIGIT,
  PY_WORD,
  PY_WORD_NOT_DIGIT,
  characters,
  isPyAlnum,
  isPyLower,
  isPyPrintable,
  isPySpace,
  pyCasefold,
  pyLength,
  pyRound,
  pySplit,
  pySplitlines,
  pyStrip,
} from './pythonText';

// charsets.json lists, for a few of Python's own rules, every character
// that passes, as [first, last] pairs of character numbers.
const charsets = loadFixture('charsets').functions as unknown as Record<
  string,
  readonly (readonly [number, number])[]
>;

const LAST_CHARACTER = 0x10ffff;

function toSet(name: string): Uint8Array {
  const ranges = charsets[name];
  if (!ranges) throw new Error(`charsets.json has no list called ${name}`);
  const set = new Uint8Array(LAST_CHARACTER + 1);
  for (const [first, last] of ranges) set.fill(1, first, last + 1);
  return set;
}

// Characters that had no meaning yet in Python's Unicode version. A newer
// browser may know them, so they are left out of the comparison.
const unassigned = toSet('unassigned');

function disagreements(pythonList: string, ours: (character: string) => boolean): string[] {
  const python = toSet(pythonList);
  const found: string[] = [];
  for (let number = 0; number <= LAST_CHARACTER; number += 1) {
    if (unassigned[number]) continue;
    if (ours(String.fromCodePoint(number)) !== (python[number] === 1)) {
      found.push(`U+${number.toString(16).toUpperCase().padStart(4, '0')}`);
    }
  }
  return found;
}

describe('against every character Python knows', () => {
  test('isPySpace agrees with str.isspace()', () => {
    expect(disagreements('str_isspace', isPySpace)).toEqual([]);
  });

  test('isPySpace agrees with \\s in a Python regular expression', () => {
    expect(disagreements('re_space', isPySpace)).toEqual([]);
  });

  test('PY_DIGIT agrees with \\d in a Python regular expression', () => {
    const digit = new RegExp(`^${PY_DIGIT}$`, 'u');
    expect(disagreements('re_digit', (character) => digit.test(character))).toEqual([]);
  });

  test('isPyAlnum agrees with str.isalnum()', () => {
    expect(disagreements('str_isalnum', isPyAlnum)).toEqual([]);
  });

  test('PY_WORD agrees with \\w in a Python regular expression', () => {
    const word = new RegExp(`^[${PY_WORD}]$`, 'u');
    expect(disagreements('re_word', (character) => word.test(character))).toEqual([]);
  });

  test('PY_WORD_NOT_DIGIT is \\w without the digits and the underscore', () => {
    const word = new RegExp(`^[${PY_WORD}]$`, 'u');
    const digit = new RegExp(`^${PY_DIGIT}$`, 'u');
    const narrow = new RegExp(`^[${PY_WORD_NOT_DIGIT}]$`, 'u');
    const wrong: string[] = [];
    for (let number = 0; number <= LAST_CHARACTER; number += 1) {
      const character = String.fromCodePoint(number);
      const expected = word.test(character) && !digit.test(character) && character !== '_';
      if (narrow.test(character) !== expected) wrong.push(number.toString(16));
    }
    expect(wrong).toEqual([]);
  });

  test('isPyLower agrees with str.islower()', () => {
    expect(disagreements('str_islower', isPyLower)).toEqual([]);
  });

  test('pyCasefold agrees with str.casefold()', () => {
    const changes = new Map(
      charsets['str_casefold'] as unknown as readonly (readonly [number, string])[],
    );
    const wrong: string[] = [];
    for (let number = 0; number <= LAST_CHARACTER; number += 1) {
      if (unassigned[number] || (number >= 0xd800 && number <= 0xdfff)) continue;
      const character = String.fromCodePoint(number);
      if (pyCasefold(character) !== (changes.get(number) ?? character)) {
        wrong.push(`U+${number.toString(16).toUpperCase().padStart(4, '0')}`);
      }
    }
    expect(changes.size).toBeGreaterThan(1000);
    expect(wrong).toEqual([]);
  });

  // Unlike the checks above, nothing is skipped here. The characters Python
  // does not know yet are the reason this is a list and not \p{...}, and
  // half of a surrogate pair can reach a name typed or pasted in the page.
  test('isPyPrintable agrees with str.isprintable() on every code point', () => {
    const python = toSet('str_isprintable');
    const wrong: string[] = [];
    for (let number = 0; number <= LAST_CHARACTER; number += 1) {
      if (isPyPrintable(String.fromCodePoint(number)) !== (python[number] === 1)) {
        wrong.push(`U+${number.toString(16).toUpperCase().padStart(4, '0')}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('pySplitlines, against str.splitlines()', () => {
  // Recorded with the importers, the only code that splits lines this way.
  const importers = loadFixture('importers');

  test('breaks a line on exactly the characters Python breaks it on', () => {
    const [[, ranges]] = importers.functions['splitlines_boundaries'] as unknown as [
      [unknown, readonly (readonly [number, number])[]],
    ];
    const python = new Uint8Array(LAST_CHARACTER + 1);
    for (const [first, last] of ranges) python.fill(1, first, last + 1);
    const wrong: string[] = [];
    for (let number = 0; number <= LAST_CHARACTER; number += 1) {
      if (number >= 0xd800 && number <= 0xdfff) continue;
      const breaks = pySplitlines(`a${String.fromCodePoint(number)}b`).length === 2;
      if (breaks !== (python[number] === 1)) wrong.push(number.toString(16));
    }
    expect(ranges.length).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });

  test('splits whole texts the same way', () => {
    expectToMatchFixture(importers, 'str_splitlines', ([text]) => pySplitlines(text as string));
  });

  test('no line for an empty text, and none after a break at the end', () => {
    expect(pySplitlines('')).toEqual([]);
    expect(pySplitlines('a\n')).toEqual(['a']);
    expect(pySplitlines('\n')).toEqual(['']);
    expect(pySplitlines('a\r\nb\rc')).toEqual(['a', 'b', 'c']);
  });
});

describe('pyCasefold', () => {
  test('a sharp s becomes two letters', () => {
    expect(pyCasefold('Straße')).toBe('strasse');
  });

  test('a sigma at the end of a word becomes an ordinary sigma', () => {
    // toLowerCase() on the whole word gives the final form, "οδος".
    expect('ΟΔΟΣ'.toLowerCase()).toBe('οδος');
    expect(pyCasefold('ΟΔΟΣ')).toBe('οδοσ');
    expect(pyCasefold('οδος')).toBe('οδοσ');
  });
});

describe('isPyPrintable', () => {
  test('an empty text is printable, as in Python', () => {
    expect(isPyPrintable('')).toBe(true);
  });

  test('the plain space is printable, other spaces and controls are not', () => {
    expect(isPyPrintable('Fast skim')).toBe(true);
    expect(isPyPrintable('Fast\tskim')).toBe(false);
    expect(isPyPrintable('Fast\u00a0skim')).toBe(false);
    expect(isPyPrintable('Fast\u0000skim')).toBe(false);
  });

  test('format characters are not, the byte order mark and the joiner included', () => {
    expect(isPyPrintable('\ufeffFast')).toBe(false);
    expect(isPyPrintable('\u{1F468}\u200d\u{1F469}')).toBe(false);
  });

  test('an emoji is, but not one given out after Python 3.13', () => {
    expect(isPyPrintable('\u{1F600}'.repeat(30))).toBe(true);
    // U+1FAE9 came in Unicode 16. Python 3.13 has 15.1.
    expect(isPyPrintable('Fast\u{1FAE9}')).toBe(false);
  });

  test('half of a surrogate pair is not', () => {
    expect(isPyPrintable('a\ud800b')).toBe(false);
    expect(isPyPrintable('\udc00')).toBe(false);
  });

  test('one bad character anywhere is enough', () => {
    expect(isPyPrintable(`${'x'.repeat(29)}\u0007`)).toBe(false);
  });
});

describe('where JavaScript and Python disagree about spaces', () => {
  test('the byte order mark is not a space', () => {
    expect(isPySpace('﻿')).toBe(false);
    expect(pySplit('a﻿b')).toEqual(['a﻿b']);
    expect(pyStrip('﻿a﻿')).toBe('﻿a﻿');
  });

  test('the separator control characters and next line are spaces', () => {
    for (const space of ['\x1c', '\x1d', '\x1e', '\x1f', '\x85']) {
      expect(isPySpace(space)).toBe(true);
      expect(pySplit(`a${space}b`)).toEqual(['a', 'b']);
      expect(pyStrip(`${space}a${space}`)).toBe('a');
    }
  });
});

describe('pySplit and pyStrip', () => {
  test('pySplit of an empty or blank string is an empty list', () => {
    expect(pySplit('')).toEqual([]);
    expect(pySplit(' \t\n ')).toEqual([]);
  });

  test('pySplit drops the space at both ends', () => {
    expect(pySplit('  a  b  ')).toEqual(['a', 'b']);
  });

  test('pyStrip only touches the ends', () => {
    expect(pyStrip('\n  a  b \t')).toBe('a  b');
    expect(pyStrip('   ')).toBe('');
  });
});

describe('counting characters', () => {
  test('an emoji is one character, though JavaScript counts two units', () => {
    expect('😀'.length).toBe(2);
    expect(pyLength('😀')).toBe(1);
    expect(characters('a😀b')).toEqual(['a', '😀', 'b']);
  });

  test('a letter and its combining accent are two characters, as in Python', () => {
    expect(pyLength('é')).toBe(2);
  });
});

describe('pyRound', () => {
  test('a half goes to the even neighbour', () => {
    expect(pyRound(0.5)).toBe(0);
    expect(pyRound(1.5)).toBe(2);
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(312.5)).toBe(312);
    expect(pyRound(313.5)).toBe(314);
    expect(pyRound(-0.5)).toBe(0);
    expect(pyRound(-1.5)).toBe(-2);
    expect(pyRound(-2.5)).toBe(-2);
  });

  test('everything else goes to the nearest whole number', () => {
    expect(pyRound(2.4)).toBe(2);
    expect(pyRound(2.6)).toBe(3);
    expect(pyRound(-2.4)).toBe(-2);
    expect(pyRound(-2.6)).toBe(-3);
    expect(pyRound(7)).toBe(7);
  });

  test('it differs from Math.round exactly on the odd halves', () => {
    expect(Math.round(312.5)).toBe(313);
    expect(pyRound(312.5)).toBe(312);
  });
});
