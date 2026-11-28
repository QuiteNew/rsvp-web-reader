import { describe, expect, test } from 'vitest';
import {
  SPEAKER_FLASH_MS,
  SPEAKER_FLASH_WARMTH,
  SPEAKER_TAG_BOTTOM_MARGIN_PX,
  SPEAKER_TAG_CORNER_MARGIN_PX,
  SPEAKER_TAG_MIN_TOP_PX,
  SPEAKER_TAG_SIZE_RATIO,
  flashBackground,
  speakerTagColor,
  speakerTagName,
  speakerTagRise,
  speakerTagSize,
} from './speakerCueDisplay';

// The expected numbers and colours were worked out from the desktop's
// reader_display.py by hand, and the colours by its own core/colors.py
// blend_colors(), run with Python 3.13.

describe('the numbers', () => {
  test('are the desktop ones', () => {
    expect(SPEAKER_TAG_SIZE_RATIO).toBe(0.5);
    expect(SPEAKER_TAG_BOTTOM_MARGIN_PX).toBe(8);
    expect(SPEAKER_TAG_MIN_TOP_PX).toBe(4);
    expect(SPEAKER_TAG_CORNER_MARGIN_PX).toBe(12);
    expect(SPEAKER_FLASH_MS).toBe(330);
    expect(SPEAKER_FLASH_WARMTH).toBe(0.18);
  });
});

describe('speakerTagSize', () => {
  test.each([
    [40, 20],
    [96, 48],
    [21, 10], // 10.5 goes to the even number, as in Python
    [23, 12], // 11.5
    [17, 8],
    [10, 8], // never under 8
  ])('a word at %i px has a tag at %i px', (size, expected) => {
    expect(speakerTagSize(size)).toBe(expected);
  });
});

describe('speakerTagName', () => {
  test('is the speaker while the tag is on', () => {
    expect(speakerTagName('Ann', true)).toBe('Ann');
  });

  test('is nothing when the tag is off', () => {
    expect(speakerTagName('Ann', false)).toBeNull();
  });

  test('is nothing before the first speaker and after the end', () => {
    expect(speakerTagName(null, true)).toBeNull();
  });

  test('is nothing for a ">>" change, which has no name', () => {
    expect(speakerTagName('>>', true)).toBeNull();
  });
});

describe('speakerTagRise', () => {
  test('is the half letter, the gap, the mark and the margin', () => {
    // A 40 px word: half the letter is 24 px, the gap 6, a mark 14, the margin 8.
    expect(speakerTagRise(24, 0, 14)).toBe(52);
  });

  test('follows the focus letter when it is moved', () => {
    expect(speakerTagRise(24, 10, 14)).toBe(62);
    expect(speakerTagRise(24, -10, 14)).toBe(42);
  });
});

describe('speakerTagColor', () => {
  test('is the font colour dimmed toward the background, as the surrounding words', () => {
    expect(speakerTagColor('#000000', '#FFFFFF', '#D98A3D', false)).toBe('#8C8C8C');
    expect(speakerTagColor('#2B2B2B', '#F6EFE3', '#D98A3D', false)).toBe('#9B9790');
  });

  test('is the highlight colour during a flash', () => {
    expect(speakerTagColor('#2B2B2B', '#F6EFE3', '#D98A3D', true)).toBe('#D98A3D');
  });

  test('is the plain font colour when the colours cannot be blended', () => {
    expect(speakerTagColor('red', '#FFFFFF', '#D98A3D', false)).toBe('red');
  });
});

describe('flashBackground', () => {
  test('moves the background a little toward the highlight', () => {
    expect(flashBackground('#F6EFE3', '#D98A3D')).toBe('#F1DDC5');
    expect(flashBackground('#1E1E1E', '#E8A04F')).toBe('#423527');
  });

  test('leaves the background as it is when the colours cannot be blended', () => {
    expect(flashBackground('#F6EFE3', 'orange')).toBe('#F6EFE3');
  });
});
