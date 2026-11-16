import { describe, expect, test } from 'vitest';
import { guideMarkHorizontalLength, guideMarkLength, peripheralContextSize } from './guideMarks';

// The expected numbers were worked out by hand from the desktop's
// _guide_mark_length() and _guide_mark_horizontal_length().
describe('guideMarkLength', () => {
  test.each([
    [40, 35, 14],
    [40, 15, 8],
    [40, 60, 24],
    [96, 60, 58],
    [16, 15, 8],
    [32, 35, 11],
  ])('font %i at %i percent is %i px', (size, percent, expected) => {
    expect(guideMarkLength(size, percent)).toBe(expected);
  });

  test('a half goes to the even number, as in Python', () => {
    expect(guideMarkLength(50, 25)).toBe(12); // 12.5
    expect(guideMarkLength(70, 25)).toBe(18); // 17.5
  });
});

describe('guideMarkHorizontalLength', () => {
  test('is the row width less 34 px on each side', () => {
    expect(guideMarkHorizontalLength(800)).toBe(732);
  });

  test('is never under 20 px', () => {
    expect(guideMarkHorizontalLength(80)).toBe(20);
    expect(guideMarkHorizontalLength(0)).toBe(20);
  });
});

describe('peripheralContextSize', () => {
  test('is half the font size, rounded as Python does, and at least 8', () => {
    expect(peripheralContextSize(40)).toBe(20);
    expect(peripheralContextSize(33)).toBe(16); // 16.5
    expect(peripheralContextSize(35)).toBe(18); // 17.5
    expect(peripheralContextSize(16)).toBe(8);
    expect(peripheralContextSize(10)).toBe(8);
  });
});
