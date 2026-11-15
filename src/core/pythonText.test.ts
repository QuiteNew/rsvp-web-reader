import { describe, expect, test } from 'vitest';
import { loadFixture } from '../testing/fixtures';
import {
  PY_DIGIT,
  characters,
  isPyAlnum,
  isPySpace,
  pyLength,
  pyRound,
  pySplit,
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
