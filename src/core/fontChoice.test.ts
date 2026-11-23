import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { chooseFontSet } from './fontChoice';

const fixture = loadFixture('font_choice');

describe('chooseFontSet', () => {
  test('gives the same answer as the desktop for every value tried', () => {
    // The desktop's answer is whether the OpenDyslexic set was chosen.
    expectToMatchFixture(
      fixture,
      'dyslexia_friendly',
      ([value]) => chooseFontSet(value) === 'dyslexic',
    );
  });

  test('only a real true turns it on', () => {
    expect(chooseFontSet(true)).toBe('dyslexic');
    for (const value of [false, null, undefined, 1, 'true', [], {}]) {
      expect(chooseFontSet(value)).toBe('standard');
    }
  });
});
