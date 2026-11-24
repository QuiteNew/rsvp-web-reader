import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';

import { boldSegments } from '../core/boldSegments';
import { copyWithBold } from './boldCopy';

interface BoldTextProps {
  readonly text: string;
  readonly className: string;
  readonly label: string;
  // Shown while there is no text, since this box cannot be typed in.
  readonly placeholder: string;
}

// The transcript's text with the start of every word in bold. A text box
// cannot show bold, so while the look is on this takes the text box's place,
// read only. The text itself is never changed. A copy out of it takes the
// bold along (see boldCopy.ts).
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

  // The copy is caught on the whole page: where a copy event is sent depends
  // on the browser, and copyWithBold() itself checks that the selection is in
  // this view.
  useEffect(() => {
    function copy(event: ClipboardEvent) {
      if (box.current !== null) copyWithBold(event, box.current);
    }
    document.addEventListener('copy', copy);
    return () => {
      document.removeEventListener('copy', copy);
    };
  }, []);

  // Ctrl+A (Cmd+A on a Mac) selects the text of the view, as it does in a
  // text box. In a part of the page that is not a text box the browser would
  // select the whole page.
  function selectAll(event: KeyboardEvent<HTMLDivElement>) {
    const element = box.current;
    if (element === null || event.altKey || event.shiftKey) return;
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') return;
    event.preventDefault();
    element.ownerDocument.getSelection()?.selectAllChildren(element);
  }

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
      onKeyDown={selectAll}
    />
  );
}
