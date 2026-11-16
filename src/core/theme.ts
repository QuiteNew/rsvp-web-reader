// The two colour palettes and the rules that tie colours to the theme,
// ported from gui/theme.py and from gui/app.py (_current_theme_reading_colors,
// _theme_guide_mark_color). Only the colours are here. Putting them on the
// page is the job of the ui layer.
//
// The names are the desktop's, so the fixture can be compared as it is.

export type Palette = Readonly<Record<string, string>>;

export const LIGHT_PALETTE: Palette = {
  hearth_paper: '#F6EFE3',
  cocoa_ink: '#3B2E27',
  cocoa_ink_light: '#4A3C33',
  warm_taupe: '#ECE0CF',
  warm_mocha: '#B7A38A',
  dusk_blue: '#6E8496',
  dusk_blue_hover: '#5C7284',
  ember_glow: '#D98A3D',
  ember_glow_hover: '#C17A2F',
  warm_line: '#D6C4AC',
  text_on_light: '#3B2E27',
  text_on_dark: '#F6EFE3',
};

export const DARK_PALETTE: Palette = {
  hearth_paper: '#1D1712',
  cocoa_ink: '#F2E8DC',
  cocoa_ink_light: '#D9CBB8',
  warm_taupe: '#2E2419',
  warm_mocha: '#4A3826',
  dusk_blue: '#7C93A3',
  dusk_blue_hover: '#6B7F8C',
  ember_glow: '#A8672E',
  ember_glow_hover: '#BF7A3B',
  warm_line: '#7A6248',
  text_on_light: '#F2E8DC',
  text_on_dark: '#1D1712',
};

// What a new transcript reads in when the theme is dark, and what the guide
// marks get. In the light theme the colours come from the Defaults in
// Settings instead, so there is no light constant for reading colours.
export const DARK_READING_FONT_COLOR = DARK_PALETTE.cocoa_ink as string;
export const DARK_READING_HIGHLIGHT_COLOR = DARK_PALETTE.ember_glow as string;
export const DARK_READING_BACKGROUND_COLOR = '#241D17';
export const LIGHT_READING_GUIDE_MARK_COLOR = LIGHT_PALETTE.cocoa_ink as string;
export const DARK_READING_GUIDE_MARK_COLOR = DARK_PALETTE.cocoa_ink as string;

export type AppearanceMode = 'light' | 'dark' | 'system';

/**
 * Whether the dark theme is on. "System" follows what the browser says about
 * the person's own setting. Anything that is not "dark" or "system" is light,
 * the way the desktop reads it.
 */
export function isDarkTheme(mode: string, systemPrefersDark: boolean): boolean {
  if (mode === 'dark') return true;
  if (mode === 'system') return systemPrefersDark;
  return false;
}

export function paletteFor(isDark: boolean): Palette {
  return isDark ? DARK_PALETTE : LIGHT_PALETTE;
}

export interface ReadingColors {
  readonly font: string;
  readonly highlight: string;
  readonly background: string;
}

/**
 * The font, highlight and background colours that match the theme: the
 * dedicated dark ones in the dark theme, the Defaults from Settings in the
 * light one. Used for a new transcript and for the resync at the start.
 */
export function themeReadingColors(isDark: boolean, lightDefaults: ReadingColors): ReadingColors {
  if (isDark) {
    return {
      font: DARK_READING_FONT_COLOR,
      highlight: DARK_READING_HIGHLIGHT_COLOR,
      background: DARK_READING_BACKGROUND_COLOR,
    };
  }
  return lightDefaults;
}

export function themeGuideMarkColor(isDark: boolean): string {
  return isDark ? DARK_READING_GUIDE_MARK_COLOR : LIGHT_READING_GUIDE_MARK_COLOR;
}
