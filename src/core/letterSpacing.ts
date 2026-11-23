// Port of the level table of core/letter_spacing.py: how much room goes
// between the letters of the flashing word, and between the words of a
// chunk.
//
// Most of the desktop module is not ported. Tk has no letter spacing, so the
// desktop measures thin space characters in the font on screen and builds
// each gap out of the mix that comes closest (choose_gap, build_plan,
// space_text). CSS has letter-spacing and word-spacing, which give the exact
// gap, so only the levels, the word gap rule and clamp_level() are needed.
// WordDisplay.tsx applies them.

/** The levels, in order, as the Appearance tab names them. */
export const LEVEL_NAMES = ['Off', 'Small', 'Medium', 'Large'] as const;

// The room between two neighbouring letters at each level, as a part of the
// word size (em). The desktop's comment: Medium is close to the 2.5 pt on
// 14 pt text (about 0.18 em) used in one study of children with dyslexia.
// That study was about running text, not single flashed words, so the
// levels are a starting point to adjust by eye, not a proven setting.
export const LEVEL_GAP_EM = [0.0, 0.1, 0.18, 0.3] as const;

export const MAX_LEVEL = LEVEL_GAP_EM.length - 1;

// Between the words of a chunk the gap stays at least this many times the
// letter gap, so the words do not run together. In a font whose plain space
// is already that wide, nothing is added.
export const WORD_GAP_RATIO = 2.0;

/**
 * A level the rest can trust, as clamp_level() does: anything that is not a
 * whole number (true and false included) is 0, "Off", and a number past
 * either end is pulled to the nearest level.
 *
 * One thing JavaScript cannot copy: Python tells 1.0 from 1 and gives 0 for
 * 1.0, while JSON and JavaScript keep no such difference. The saved settings
 * are checked before they get here, so it cannot matter.
 */
export function clampLevel(level: unknown): number {
  if (typeof level !== 'number' || !Number.isInteger(level)) return 0;
  return Math.max(0, Math.min(MAX_LEVEL, level));
}

/** The room between letters at a level, in em. */
export function letterGapEm(level: unknown): number {
  return LEVEL_GAP_EM[clampLevel(level)] ?? 0;
}

/**
 * The CSS word-spacing, in em, that gives the desktop's gap between two words
 * of a chunk.
 *
 * The desktop's gap is the plain space with whatever it takes, on top, to
 * reach WORD_GAP_RATIO times the letter gap: the larger of the two. CSS
 * letter-spacing puts its gap after every character, so the last letter of a
 * word and the space after it both get one, and the gap comes out as the
 * space plus two letter gaps. word-spacing takes the difference back off,
 * which is why the answer is never above zero. With no letter gap it is 0,
 * and nothing changes.
 *
 * `spaceEm` is the width of the font's own space, in em, measured on the page.
 */
export function wordSpacingEm(letterGap: number, spaceEm: number): number {
  if (letterGap <= 0) return 0;
  const wanted = Math.max(spaceEm, WORD_GAP_RATIO * letterGap);
  return wanted - spaceEm - 2 * letterGap;
}
