// Tests for the theme colours. The palettes and constants are compared with
// the ones read out of the desktop's gui/theme.py. The rules that tie colours
// to the theme are the desktop's tests/test_reading_colours_follow_theme.py,
// played here under the same names. Those cannot be replayed from a
// recording, because they build the desktop window's class, which needs
// tkinter, so they are written again against the web library.
import { describe, expect, test } from 'vitest';
import { loadFixture } from '../testing/fixtures';
import {
  DARK_PALETTE,
  DARK_READING_BACKGROUND_COLOR,
  DARK_READING_FONT_COLOR,
  DARK_READING_GUIDE_MARK_COLOR,
  DARK_READING_HIGHLIGHT_COLOR,
  LIGHT_PALETTE,
  LIGHT_READING_GUIDE_MARK_COLOR,
  isDarkTheme,
  paletteFor,
  themeGuideMarkColor,
  themeReadingColors,
  type ReadingColors,
} from './theme';
import { addTranscript, resyncDefaultReadingColors, setFontColor } from './library';
import { EMPTY_LIBRARY, type Library } from './models';
import { DEFAULT_SAVED_SETTINGS, resyncGuideMarkColorDefault, setGuideMarkColor } from './settings';

const fixture = loadFixture('theme');

describe('against the desktop', () => {
  test('the palettes', () => {
    const cases = fixture.functions.palette ?? [];
    expect(cases.length).toBe(2);
    for (const [[name], expected] of cases) {
      expect(name === 'light' ? LIGHT_PALETTE : DARK_PALETTE).toEqual(expected);
    }
  });

  test('the constants', () => {
    const found: Record<string, string> = {
      DARK_READING_BACKGROUND_COLOR,
      DARK_READING_FONT_COLOR,
      DARK_READING_GUIDE_MARK_COLOR,
      DARK_READING_HIGHLIGHT_COLOR,
      LIGHT_READING_GUIDE_MARK_COLOR,
    };
    const cases = fixture.functions.constant ?? [];
    expect(cases.length).toBe(Object.keys(found).length);
    for (const [[name], expected] of cases) {
      expect(found[name as string]).toBe(expected);
    }
  });
});

describe('which theme is on', () => {
  test('light and dark are themselves, system follows the browser', () => {
    expect(isDarkTheme('light', true)).toBe(false);
    expect(isDarkTheme('dark', false)).toBe(true);
    expect(isDarkTheme('system', true)).toBe(true);
    expect(isDarkTheme('system', false)).toBe(false);
  });

  test('anything else is light', () => {
    expect(isDarkTheme('', true)).toBe(false);
    expect(isDarkTheme('Dark', true)).toBe(false);
  });

  test('the palette follows', () => {
    expect(paletteFor(true)).toBe(DARK_PALETTE);
    expect(paletteFor(false)).toBe(LIGHT_PALETTE);
  });
});

// ---- test_reading_colours_follow_theme.py ----

const DARK: ReadingColors = {
  font: DARK_READING_FONT_COLOR,
  highlight: DARK_READING_HIGHLIGHT_COLOR,
  background: DARK_READING_BACKGROUND_COLOR,
};
const LIGHT_DEFAULTS: ReadingColors = {
  font: '#111111',
  highlight: '#222222',
  background: '#333333',
};
const NEW_LIGHT_DEFAULTS: ReadingColors = {
  font: '#444444',
  highlight: '#555555',
  background: '#666666',
};
const PICKED = '#ABCDEF';

// A launch: the colours that follow the theme are brought in line with it.
function launch(library: Library, isDark: boolean, defaults: ReadingColors): Library {
  const colors = themeReadingColors(isDark, defaults);
  return resyncDefaultReadingColors(library, colors.font, colors.highlight, colors.background);
}

function newTranscript(
  library: Library,
  isDark: boolean,
  defaults: ReadingColors,
  title: string,
): Library {
  const colors = themeReadingColors(isDark, defaults);
  return addTranscript(library, title, 'General', {
    fontColor: colors.font,
    highlightColor: colors.highlight,
    backgroundColor: colors.background,
  });
}

function colorsOf(library: Library, title: string): ReadingColors {
  const found = library.transcripts.find((t) => t.title === title);
  if (!found) throw new Error(`no transcript ${title}`);
  return {
    font: found.fontColor,
    highlight: found.highlightColor,
    background: found.backgroundColor,
  };
}

describe('test_reading_colours_follow_theme.py', () => {
  test('test_in_light_a_new_transcript_gets_the_defaults_tab_colours', () => {
    const library = newTranscript(EMPTY_LIBRARY, false, LIGHT_DEFAULTS, 'new');
    expect(colorsOf(library, 'new')).toEqual(LIGHT_DEFAULTS);
  });

  test('test_in_dark_a_new_transcript_gets_the_dark_reading_colours_not_the_defaults_tab', () => {
    const library = newTranscript(EMPTY_LIBRARY, true, LIGHT_DEFAULTS, 'new');
    expect(colorsOf(library, 'new')).toEqual(DARK);
  });

  test('test_colours_not_picked_by_hand_follow_a_change_to_dark', () => {
    let library = launch(EMPTY_LIBRARY, false, LIGHT_DEFAULTS);
    library = newTranscript(library, false, LIGHT_DEFAULTS, 'follows');
    expect(colorsOf(launch(library, true, LIGHT_DEFAULTS), 'follows')).toEqual(DARK);
  });

  test('test_colours_not_picked_by_hand_come_back_to_the_defaults_tab_in_light', () => {
    let library = launch(EMPTY_LIBRARY, true, LIGHT_DEFAULTS);
    library = newTranscript(library, true, LIGHT_DEFAULTS, 'follows');
    expect(colorsOf(launch(library, false, LIGHT_DEFAULTS), 'follows')).toEqual(LIGHT_DEFAULTS);
  });

  test('test_in_light_a_change_to_the_defaults_tab_colours_reaches_them_at_the_next_launch', () => {
    const library = newTranscript(EMPTY_LIBRARY, false, LIGHT_DEFAULTS, 'follows');
    expect(colorsOf(launch(library, false, NEW_LIGHT_DEFAULTS), 'follows')).toEqual(
      NEW_LIGHT_DEFAULTS,
    );
  });

  test('test_nothing_changes_before_the_next_launch', () => {
    const library = newTranscript(EMPTY_LIBRARY, false, LIGHT_DEFAULTS, 'follows');
    expect(colorsOf(library, 'follows')).toEqual(LIGHT_DEFAULTS);
  });

  test.each([
    ['Light', false, 'Dark', true],
    ['Dark', true, 'Light', false],
    ['Light', false, 'Light', false],
  ] as const)(
    'test_a_colour_picked_by_hand_stays_the_same_in_both_themes (%s then %s)',
    (_a, first, _b, then) => {
      let library = newTranscript(EMPTY_LIBRARY, first, LIGHT_DEFAULTS, 'picked');
      const id = library.transcripts[0]?.id ?? -1;
      library = setFontColor(library, id, PICKED);
      expect(colorsOf(launch(library, then, NEW_LIGHT_DEFAULTS), 'picked').font).toBe(PICKED);
    },
  );

  test('test_each_colour_follows_on_its_own', () => {
    let library = newTranscript(EMPTY_LIBRARY, false, LIGHT_DEFAULTS, 'picked');
    library = setFontColor(library, library.transcripts[0]?.id ?? -1, PICKED);
    expect(colorsOf(launch(library, true, LIGHT_DEFAULTS), 'picked')).toEqual({
      font: PICKED,
      highlight: DARK.highlight,
      background: DARK.background,
    });
  });
});

describe('the guide mark colour follows the theme', () => {
  test('it takes the colour of the theme while it follows', () => {
    const dark = resyncGuideMarkColorDefault(DEFAULT_SAVED_SETTINGS, themeGuideMarkColor(true));
    expect(dark.guide_mark_color).toBe(DARK_READING_GUIDE_MARK_COLOR);
    const light = resyncGuideMarkColorDefault(dark, themeGuideMarkColor(false));
    expect(light.guide_mark_color).toBe(LIGHT_READING_GUIDE_MARK_COLOR);
  });

  test('a colour picked by hand stays', () => {
    const picked = setGuideMarkColor(DEFAULT_SAVED_SETTINGS, '#112233');
    expect(resyncGuideMarkColorDefault(picked, themeGuideMarkColor(true)).guide_mark_color).toBe(
      '#112233',
    );
  });
});
