import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import type { ChunkText, PeripheralContext } from '../core/reader';
import { FIT_SIDE_MARGIN_PX, fitRenderSize, requiredWidth } from '../core/fit';
import { guideMarkLength, peripheralContextSize } from '../core/guideMarks';
import { wordSpacingEm } from '../core/letterSpacing';
import { clampPan, panFromFraction, scrollbarFractions } from '../core/scroll';
import { HorizontalScrollbar } from './HorizontalScrollbar';
import styles from './WordDisplay.module.css';

export interface GuideMarks {
  // Shown only while words are going by, as on the desktop.
  readonly visible: boolean;
  readonly horizontal: boolean;
  readonly thicknessPx: number;
  readonly lengthPercent: number;
  readonly color: string;
}

interface WordDisplayProps {
  // The text to show, split around its focus letter. null shows nothing.
  readonly chunk: ChunkText | null;
  // The Word size chosen for the transcript. The word is drawn smaller when
  // the widest chunk would not fit the row, never larger.
  readonly fontSize: number;
  // The longest chunks of the transcript, measured here to find the widest.
  // Pass the same list while the chunks are the same: it is measured again
  // whenever the list is a new one.
  readonly fitTexts: readonly ChunkText[];
  // The focus letter only, moved up (positive) or down (negative), in px.
  readonly offsetPx: number;
  readonly marks: GuideMarks;
  // The surrounding-words line and its dimmed colour. null shows none.
  readonly context: PeripheralContext | null;
  readonly contextColor: string;
  // How far the flash is slid sideways, in px, when even the smallest size
  // still leaves it wider than the row. Kept by the page, so the C key and a
  // new session can set it back to 0.
  readonly pan: number;
  readonly onPanChange: (pan: number) => void;
  // The room between letters, as a part of the word size (em), from the
  // letter spacing level. 0 is Off. The surrounding words are not spaced.
  readonly letterGap?: number;
}

// How far one step of the scrollbar slides the flash (an arrow key or a
// wheel notch), as on the desktop. A click on the track moves a whole row.
const SCROLL_UNIT_PX = 24;

// The widest chunk's reach to the left and to the right of the focus
// letter's middle, for each px of font size.
interface Reaches {
  readonly left: number;
  readonly right: number;
}

// The flashing word. The focus letter sits in the middle column of a grid
// whose two outer columns are always the same width, so the letter stays
// on one spot however long the word is. The eye never has to move.
//
// The guide marks are two short bars above and below that letter, and
// optionally two long ticks across the outer ends of the bars. They keep a
// fixed gap from the letter's edge, and follow it when it is moved up or
// down. They are drawn here and not on the desktop's canvas, so they are
// plain elements that the style sheet places.
//
// Letter spacing goes on the text before and after the focus letter, never
// on the focus letter itself, which keeps the focus column exactly as wide as
// the letter, so the letter stays on its spot. Where the desktop adds a gap
// next to the focus letter, the page adds it as padding (see the gapStart
// and gapEnd classes), and word-spacing keeps the gap between the words of a
// chunk at the desktop's width (wordSpacingEm in core/letterSpacing.ts).
//
// This is not a live region on purpose. A screen reader must not be made
// to read words out one by one at reading speed.
export function WordDisplay({
  chunk,
  fontSize: chosenSize,
  fitTexts,
  offsetPx,
  marks,
  context,
  contextColor,
  pan,
  onPanChange,
  letterGap = 0,
}: WordDisplayProps) {
  const display = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLSpanElement>(null);
  // How far the widest chunk reaches each side, for each px of font size,
  // and the width of the row. Both are measured on the page, so they start
  // unknown.
  const [reaches, setReaches] = useState<Reaches | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  // Counts up when the page's fonts have loaded, to measure again: the first
  // measure may have been taken in the stand-in font.
  const [fontsLoaded, setFontsLoaded] = useState(0);
  // The width of the word font's own space, in em. Needed for the gap
  // between the words of a chunk once letters are spaced.
  const [spaceEm, setSpaceEm] = useState(0);
  const wordGap = wordSpacingEm(letterGap, spaceEm);

  // Find the widest of the candidate chunks, in real pixels, at the chosen
  // size. The ruler is an unseen span with the word's own font. It measures
  // the text spaced as it is drawn, so the fit is right for what is seen.
  useLayoutEffect(() => {
    const span = ruler.current;
    if (span === null) return;
    const width = (text: string): number => {
      span.textContent = text;
      return span.getBoundingClientRect().width;
    };
    // The plain space first, with no spacing.
    span.style.letterSpacing = '0';
    span.style.wordSpacing = '0';
    const space = chosenSize > 0 ? width(' ') / chosenSize : 0;
    setSpaceEm(space);
    const gapPx = letterGap * chosenSize;
    span.style.letterSpacing = `${gapPx}px`;
    span.style.wordSpacing = `${wordSpacingEm(letterGap, space) * chosenSize}px`;
    // Spaced text as drawn: the before text ends with a letter gap of its own
    // (letter-spacing puts one after its last character), plus the padding of
    // gapEnd after a space. The after text gets a gap in front (gapStart) and
    // one after its last character, which takes no room on screen, so the two
    // cancel. The focus letter is never spaced.
    const spaced = (text: string, extra: number): number => (text === '' ? 0 : width(text) + extra);
    let widest = 0;
    let found: Reaches | null = null;
    for (const text of fitTexts) {
      const before = spaced(text.before, text.before.endsWith(' ') ? gapPx : 0);
      const after = spaced(text.after, 0);
      span.style.letterSpacing = '0';
      const focus = width(text.focus);
      span.style.letterSpacing = `${gapPx}px`;
      const required = requiredWidth(before, focus, after);
      if (required > widest) {
        widest = required;
        found = { left: before + focus / 2, right: after + focus / 2 };
      }
    }
    span.textContent = '';
    setReaches(
      found !== null && chosenSize > 0
        ? { left: found.left / chosenSize, right: found.right / chosenSize }
        : null,
    );
  }, [fitTexts, chosenSize, fontsLoaded, letterGap]);

  // Follow the width of the row, and notice when the fonts arrive.
  useEffect(() => {
    const element = display.current;
    if (element === null) return undefined;
    setRowWidth(element.clientWidth);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            setRowWidth(element.clientWidth);
          });
    observer?.observe(element);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setFontsLoaded((count) => count + 1);
    });
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, []);

  // Everything below is drawn at the fitted size: the word, and the guide
  // marks and the surrounding words, which are sized from it.
  const requiredPerSize = reaches === null ? null : 2 * Math.max(reaches.left, reaches.right);
  const fontSize = fitRenderSize(chosenSize, requiredPerSize, rowWidth);

  // What still spills past each side at that size, as the desktop's
  // _pan_overflows() works it out. Both are 0 when the widest chunk fits,
  // and then there is no scrollbar.
  const usable = rowWidth - 2 * FIT_SIDE_MARGIN_PX;
  const half = usable / 2;
  const overflowLeft =
    usable > 1 && reaches !== null ? Math.max(0, reaches.left * fontSize - half) : 0;
  const overflowRight =
    usable > 1 && reaches !== null ? Math.max(0, reaches.right * fontSize - half) : 0;
  const scrolls = overflowLeft + overflowRight > 0;
  const shownPan = scrolls ? clampPan(pan, overflowLeft, overflowRight) : 0;
  // When nothing spills any more, the pan goes back to the centre, so it does
  // not come back by itself later.
  useEffect(() => {
    if (!scrolls && pan !== 0) onPanChange(0);
  }, [scrolls, pan, onPanChange]);
  const [first, last] = scrollbarFractions(usable, overflowLeft, overflowRight, shownPan);

  const hasFocus = (chunk?.focus ?? '') !== '';
  const style = {
    '--size': `${fontSize}px`,
    '--offset': `${offsetPx}px`,
    '--half': hasFocus ? '0.6em' : '0px',
    '--mark-thickness': `${marks.thicknessPx}px`,
    '--mark-length': `${guideMarkLength(fontSize, marks.lengthPercent)}px`,
    '--mark-color': marks.color,
    '--context-size': `${peripheralContextSize(fontSize)}px`,
    '--context-color': contextColor,
    '--pan': `${shownPan}px`,
    '--letter-gap': `${letterGap}em`,
    '--word-gap': `${wordGap}em`,
  } as CSSProperties;
  const before = chunk?.before ?? '';
  const after = chunk?.after ?? '';
  return (
    <>
      <div className={styles.display} style={style} ref={display}>
        <span
          ref={ruler}
          className={styles.ruler}
          style={{ fontSize: `${chosenSize}px` }}
          aria-hidden="true"
        />
        <div className={styles.row} data-testid="word">
          <span className={`${styles.before} ${before.endsWith(' ') ? styles.gapEnd : ''}`}>
            {before}
          </span>
          <span className={styles.focus}>{chunk?.focus ?? ''}</span>
          <span className={`${styles.after} ${after !== '' ? styles.gapStart : ''}`}>{after}</span>
        </div>
        {context?.current != null && (
          <div className={styles.context} data-testid="context" aria-hidden="true">
            <span className={styles.contextBefore}>{context.before.join(' ')}</span>
            <span>{context.current}</span>
            <span className={styles.contextAfter}>{context.after.join(' ')}</span>
          </div>
        )}
        {/* The marks show the fixed centre point, so they are hidden while the
          flash is slid away from it, as on the desktop. */}
        {marks.visible && shownPan === 0 && (
          <div className={styles.marks} data-testid="guide-marks" aria-hidden="true">
            <span className={`${styles.mark} ${styles.above}`} />
            <span className={`${styles.mark} ${styles.below}`} />
            {marks.horizontal && (
              <>
                <span className={`${styles.tick} ${styles.tickAbove}`} />
                <span className={`${styles.tick} ${styles.tickBelow}`} />
              </>
            )}
          </div>
        )}
      </div>
      {scrolls && (
        <div className={styles.scrollArea}>
          <button
            type="button"
            className={styles.centre}
            aria-label="Centre the flash"
            title="Centre the flash (C)"
            onClick={() => {
              onPanChange(0);
            }}
          >
            <CrosshairIcon />
          </button>
          <HorizontalScrollbar
            label="Slide the flash sideways"
            first={first}
            last={last}
            onMoveTo={(fraction) => {
              onPanChange(panFromFraction(fraction, usable, overflowLeft, overflowRight));
            }}
            onScroll={(amount, what) => {
              const step = what === 'pages' ? usable : SCROLL_UNIT_PX;
              onPanChange(clampPan(shownPan - amount * step, overflowLeft, overflowRight));
            }}
          />
        </div>
      )}
    </>
  );
}

// The centre button's crosshair: a ring with a dot and four short arms.
function CrosshairIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <path d="M6 0v2.5M6 9.5V12M0 6h2.5M9.5 6H12" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
