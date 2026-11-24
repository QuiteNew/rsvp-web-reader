// Copying out of the bold view, with the bold. While the look is on, a copy
// of a selection in the view puts two things on the clipboard: the plain text,
// for everything that only knows text, and HTML with the bold word starts,
// for Word, an email and the like. Ported from the desktop's copy with bold,
// which does the same on Ctrl+C while the look is on.
//
// As on the desktop, the pieces are read off the page as they are shown, from
// where the bold starts and stops, so no position has to be worked out by
// hand. And as there, if they ever did not add up to exactly the selected
// text, the browser's own copy is left to happen instead.

import { htmlFragment, piecesText, type Piece } from '../core/richCopy';

/**
 * The selected text as pieces, plain or bold, in reading order. The range
 * must lie inside `view`, the element that holds the text and its <b>s.
 */
export function selectedPieces(range: Range, view: Element): Piece[] {
  // A selection that starts and ends in one bold piece copies as a bare text,
  // with no <b> around it, so whether it sat in one is asked first.
  const insideBold = boldAround(range.commonAncestorContainer, view);
  const walker = document.createTreeWalker(range.cloneContents(), NodeFilter.SHOW_TEXT);
  const pieces: Piece[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    if (text === '') continue;
    pieces.push({ text, bold: insideBold || node.parentNode?.nodeName === 'B' });
  }
  return pieces;
}

function boldAround(node: Node, view: Element): boolean {
  for (let at: Node | null = node; at !== null && at !== view; at = at.parentNode) {
    if (at.nodeName === 'B') return true;
  }
  return false;
}

/**
 * Handles a copy for the bold view. Returns whether it put the text on the
 * clipboard. When it does not (nothing selected in the view, a selection that
 * reaches outside it, no clipboard), the browser's own copy goes ahead.
 */
export function copyWithBold(event: ClipboardEvent, view: Element): boolean {
  const selection = view.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount !== 1 || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  // A selection that also takes in text outside the view is copied the
  // ordinary way, so that the rest of it is not lost.
  if (!view.contains(range.startContainer) || !view.contains(range.endContainer)) return false;
  const clipboard = event.clipboardData;
  if (clipboard === null) return false;
  const pieces = selectedPieces(range, view);
  const plain = range.toString();
  if (piecesText(pieces) !== plain) return false;
  clipboard.setData('text/plain', plain);
  clipboard.setData('text/html', htmlFragment(pieces));
  event.preventDefault();
  return true;
}
