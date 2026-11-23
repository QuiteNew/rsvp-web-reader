import { useLayoutEffect } from 'react';

import { chooseFontSet } from '../core/fontChoice';

/**
 * Puts the font set for the saved switch on the page: data-font on the html
 * element is what the style sheet reads, as data-theme is for the colours.
 * Unlike the desktop, which reads the switch once at launch, the page
 * changes at once.
 *
 * A layout effect, so the new font is on the page before it is painted.
 * The reader measures its text in the font it is drawn in, and watches this
 * attribute to measure again (see WordDisplay).
 */
export function useFontSet(dyslexiaFontEnabled: boolean): void {
  const fontSet = chooseFontSet(dyslexiaFontEnabled);
  useLayoutEffect(() => {
    document.documentElement.dataset.font = fontSet;
  }, [fontSet]);
}
