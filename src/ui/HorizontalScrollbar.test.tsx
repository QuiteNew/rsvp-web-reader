import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HorizontalScrollbar } from './HorizontalScrollbar';

// jsdom does no layout, so the track is given a width of 200 by hand.
function renderScrollbar() {
  const onMoveTo = vi.fn();
  render(
    <HorizontalScrollbar
      first={0}
      last={0.5}
      label="Slide"
      onMoveTo={onMoveTo}
      onScroll={() => {}}
    />,
  );
  const track = screen.getByRole('scrollbar', { name: 'Slide' });
  track.getBoundingClientRect = () => ({ width: 200 }) as DOMRect;
  return { onMoveTo, thumb: screen.getByTestId('scroll-thumb') };
}

describe('dragging the thumb', () => {
  it('moves the thumb by the distance dragged, as a fraction of the track', () => {
    const { onMoveTo, thumb } = renderScrollbar();
    fireEvent.pointerDown(thumb, { button: 0, buttons: 1, clientX: 100 });
    fireEvent.pointerMove(window, { buttons: 1, clientX: 150 });
    expect(onMoveTo).toHaveBeenLastCalledWith(0.25);
    fireEvent.pointerUp(window, { button: 0, buttons: 0, clientX: 150 });
    fireEvent.pointerMove(window, { buttons: 1, clientX: 190 });
    expect(onMoveTo).toHaveBeenCalledTimes(1);
  });

  it('ends the drag on a move with no button held, without moving', () => {
    // What Firefox sent in the e2e run when the mouse left the window.
    const { onMoveTo, thumb } = renderScrollbar();
    fireEvent.pointerDown(thumb, { button: 0, buttons: 1, clientX: 100 });
    fireEvent.pointerMove(window, { buttons: 1, clientX: 150 });
    fireEvent.pointerMove(window, { buttons: 0, clientX: 0 });
    fireEvent.pointerMove(window, { buttons: 1, clientX: 190 });
    expect(onMoveTo).toHaveBeenCalledTimes(1);
    expect(onMoveTo).toHaveBeenLastCalledWith(0.25);
  });
});
