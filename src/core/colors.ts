// Small, pure colour helpers. Ported from core/colors.py of the desktop app.
import { pyRound } from './pythonText';

// One digit is enough for the last pair: the desktop reads "#12345" as
// 12, 34 and 5.
const HEX_PAIR = /^[0-9a-fA-F]{1,2}$/u;

/**
 * A hex colour as its red, green and blue, each 0 to 255. Takes "#RGB" or
 * "#RRGGBB", with or without the leading #. Throws a RangeError for
 * anything that is not a colour, where Python raises ValueError.
 *
 * Like the desktop, it reads the first six digits and ignores any after
 * them. Unlike the desktop, it takes nothing but hex digits: Python's
 * int() would also read "+f" or " f" as 15, which no colour picker writes.
 */
export function channels(value: string): [red: number, green: number, blue: number] {
  let digits = Array.from(value.replace(/^#+/u, ''));
  if (digits.length === 3) digits = digits.flatMap((digit) => [digit, digit]);
  const pair = (at: number): number => {
    const text = digits.slice(at, at + 2).join('');
    if (!HEX_PAIR.test(text)) throw new RangeError(`"${value}" is not a hex colour`);
    return Number.parseInt(text, 16);
  };
  return [pair(0), pair(2), pair(4)];
}

/**
 * A colour between two hex colours, as "#RRGGBB". ratio is how far to move
 * from colorA toward colorB: 0 is colorA, 1 is colorB, and anything outside
 * that is pulled back to the nearest end. Used for the surrounding-words
 * line, which dims the reading colour toward the background so those words
 * recede.
 */
export function blendColors(colorA: string, colorB: string, ratio: number): string {
  // Python's max(0.0, min(1.0, ratio)), spelled out so that a ratio that is
  // not a number ends up as 1 here too. Math.min would give NaN.
  const capped = ratio < 1 ? ratio : 1;
  const share = capped > 0 ? capped : 0;
  const a = channels(colorA);
  const b = channels(colorB);
  // pyRound, because Python sends a half to the even number: 2.5 becomes 2.
  const hex = a.map((channel, i) =>
    pyRound(channel + ((b[i] ?? 0) - channel) * share)
      .toString(16)
      .toUpperCase()
      .padStart(2, '0'),
  );
  return `#${hex.join('')}`;
}
