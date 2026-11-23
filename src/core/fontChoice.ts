// Port of the decision in core/font_choice.py: which set of fonts the app
// uses, from the saved "Use the OpenDyslexic font" switch.
//
// Most of the desktop module is not ported. Tk can only use a font file
// after the app registers it by hand, and the OpenDyslexic Regular and Bold
// files then show up as two separate families with names that differ by one
// space, so the desktop keeps their names, looks for the files and falls
// back to the standard set when they are missing. On the web the files are
// bundled with the site and both are one family with two weights, so only
// the choice is left.

export type FontSet = 'standard' | 'dyslexic';

/**
 * The set the saved switch selects. Only a real `true` turns OpenDyslexic
 * on, so a damaged settings file holding anything else (a string, a number,
 * nothing) leaves the standard fonts in place, as choose_fonts() does.
 */
export function chooseFontSet(dyslexiaFontEnabled: unknown): FontSet {
  return dyslexiaFontEnabled === true ? 'dyslexic' : 'standard';
}
