import { useLayoutEffect, useRef } from 'react';

import { boldSegments } from '../core/boldSegments';

interface BoldTextProps {
  readonly text: string;
  readonly className: string;
  readonly label: string;
  // Shown while there is no text, since this box cannot be typed in.
  readonly placeholder: string;
}

// The transcript's text with the start of every word in bold. A text box
// cannot show bold, so while the look is on this takes the text box's place,
// read only. The text itself is never changed.
//
// The pieces are put into the page directly and not drawn by React. A long
// transcript has a hundred thousand of them, and React would compare them
// all each time the page draws. This way they are built only when the text
// changes.
export function BoldText({ text, className, label, placeholder }: BoldTextProps) {
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const pieces = document.createDocumentFragment();
    for (const segment of boldSegments(text)) {
      if (segment.bold) {
        const bold = document.createElement('b');
        bold.textContent = segment.text;
        pieces.append(bold);
      } else {
        pieces.append(segment.text);
      }
    }
    element.replaceChildren(pieces);
  }, [text]);

  return (
    <div
      ref={box}
      className={className}
      role="textbox"
      aria-label={label}
      aria-readonly="true"
      aria-multiline="true"
      tabIndex={0}
      data-placeholder={placeholder}
    />
  );
}
