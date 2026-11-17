import { useEffect, useRef, type CSSProperties } from 'react';

import styles from './HorizontalScrollbar.module.css';

interface HorizontalScrollbarProps {
  // Where the thumb starts and ends, as fractions of the track (0 to 1).
  readonly first: number;
  readonly last: number;
  readonly label: string;
  // The thumb was dragged so that its left edge is at this fraction.
  readonly onMoveTo: (first: number) => void;
  // A step: a unit is a small step (an arrow key, a wheel notch), a page is
  // a whole row (a click on the track, Page Up or Page Down). Positive goes
  // right.
  readonly onScroll: (amount: number, what: 'units' | 'pages') => void;
}

// A thin scrollbar that only draws a track and a thumb, the way the
// desktop's CTkScrollbar does. It speaks in the same terms as a Tk
// scrollbar (first and last, moveto and scroll), so the page can use the
// desktop's arithmetic in src/core/scroll.ts unchanged. It can be dragged,
// clicked, turned with a mouse wheel, and worked from the keyboard.
export function HorizontalScrollbar({
  first,
  last,
  label,
  onMoveTo,
  onScroll,
}: HorizontalScrollbarProps) {
  const track = useRef<HTMLDivElement>(null);
  // The newest onMoveTo, for a drag that started a few renders ago: the
  // overflow it works with can change while the thumb is held.
  const moveTo = useRef(onMoveTo);
  useEffect(() => {
    moveTo.current = onMoveTo;
  });

  function trackWidth(): number {
    return track.current?.getBoundingClientRect().width ?? 0;
  }

  return (
    <div
      ref={track}
      className={styles.track}
      role="scrollbar"
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((first / Math.max(1e-9, 1 - (last - first))) * 100) || 0}
      tabIndex={0}
      style={{ '--first': first, '--last': last } as CSSProperties}
      onPointerDown={(event) => {
        if (event.target !== track.current) return;
        // A click on the track beside the thumb moves a whole row that way.
        const box = event.currentTarget.getBoundingClientRect();
        const at = (event.clientX - box.left) / Math.max(1, box.width);
        onScroll(at < first ? -1 : 1, 'pages');
      }}
      onWheel={(event) => {
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (delta !== 0) onScroll(delta > 0 ? 1 : -1, 'units');
      }}
      onKeyDown={(event) => {
        const keys: Record<string, () => void> = {
          ArrowLeft: () => {
            onScroll(-1, 'units');
          },
          ArrowRight: () => {
            onScroll(1, 'units');
          },
          PageUp: () => {
            onScroll(-1, 'pages');
          },
          PageDown: () => {
            onScroll(1, 'pages');
          },
          Home: () => {
            onMoveTo(0);
          },
          End: () => {
            onMoveTo(1);
          },
        };
        const run = Object.hasOwn(keys, event.key) ? keys[event.key] : undefined;
        if (run === undefined) return;
        event.preventDefault();
        run();
      }}
    >
      <div
        className={styles.thumb}
        data-testid="scroll-thumb"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          // No text selection or native drag while the thumb is held.
          event.preventDefault();
          const startX = event.clientX;
          const startFirst = first;
          // The moves are followed on the whole window, not on the thumb, so
          // the drag goes on when the pointer leaves the thumb or the track.
          // This does not depend on pointer capture, which browsers handle
          // differently.
          function onMove(move: PointerEvent): void {
            // No button held any more: the drag is over even though no
            // pointerup came, for example after letting go outside the
            // window. Firefox reports that as a move with no buttons at
            // x 0, which would otherwise throw the flash back to the start.
            if (move.buttons === 0) {
              onEnd();
              return;
            }
            const width = trackWidth();
            if (width > 0) moveTo.current(startFirst + (move.clientX - startX) / width);
          }
          function onEnd(): void {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onEnd);
            window.removeEventListener('pointercancel', onEnd);
          }
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onEnd);
          window.addEventListener('pointercancel', onEnd);
        }}
      />
    </div>
  );
}
