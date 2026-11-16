// pyLower and pyCasefold against what Python does to every single
// character, and to some longer texts. The browser's own toLowerCase()
// fails the first test whenever its Unicode is newer than Python's, which
// is why the port carries its own table.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { pyCasefold, pyLower } from './pythonText';

const fixture = loadFixture('case');

/** The code points where `change` differs from the recorded Python answer. */
function wrongCharacters(pythonName: string, change: (text: string) => string): string[] {
  const [, recorded] = (fixture.functions[pythonName] ?? [])[0] ?? [];
  const changed = new Map(recorded as [number, string][]);
  expect(changed.size).toBeGreaterThan(1000);
  const wrong: string[] = [];
  for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
    const character = String.fromCodePoint(codePoint);
    if (change(character) !== (changed.get(codePoint) ?? character)) {
      wrong.push(codePoint.toString(16));
    }
  }
  return wrong;
}

describe('against the Python fixtures', () => {
  test('pyLower changes every character Python does, and no other', () => {
    expect(wrongCharacters('lower_characters', pyLower)).toEqual([]);
  });

  test('pyCasefold changes every character Python does, and no other', () => {
    expect(wrongCharacters('casefold_characters', pyCasefold)).toEqual([]);
  });

  test('lower, on whole texts', () => {
    expectToMatchFixture(fixture, 'lower', ([text]) => pyLower(text as string));
  });

  test('casefold, on whole texts', () => {
    expectToMatchFixture(fixture, 'casefold', ([text]) => pyCasefold(text as string));
  });
});

test('a capital sigma becomes the final form only at the end of a word', () => {
  expect(pyLower('ΟΔΥΣΣΕΥΣ')).toBe('οδυσσευς');
  expect(pyLower('Σ')).toBe('σ');
});
