import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { BoldText } from './BoldText';
import { copyWithBold, selectedPieces } from './boldCopy';

const P = '<p style="margin:0">';

afterEach(() => {
  document.getSelection()?.removeAllRanges();
});

function showText(text: string): HTMLElement {
  render(
    <>
      <p>Outside the view</p>
      <BoldText className="" label="Transcript text" placeholder="" text={text} />
    </>,
  );
  return screen.getByRole('textbox', { name: 'Transcript text' });
}

// Selects from one place to another, each given as the text node it is in
// and an offset into it.
function select(start: [Node, number], end: [Node, number]): Range {
  const range = document.createRange();
  range.setStart(...start);
  range.setEnd(...end);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

// The text nodes of the view, in order.
function textNodes(view: Element): Text[] {
  const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    nodes.push(node as Text);
  }
  return nodes;
}

// A copy event as the browser sends it, with a clipboard to look into.
function copyEvent(): { event: ClipboardEvent; data: Map<string, string>; stopped: () => boolean } {
  const data = new Map<string, string>();
  let stopped = false;
  const event = {
    clipboardData: {
      setData: (kind: string, value: string) => {
        data.set(kind, value);
      },
    },
    preventDefault: () => {
      stopped = true;
    },
  } as unknown as ClipboardEvent;
  return { event, data, stopped: () => stopped };
}

describe('the pieces of a selection', () => {
  test('a whole text, plain and bold', () => {
    const view = showText('The well-known reader');
    const nodes = textNodes(view);
    const last = nodes[nodes.length - 1]!;
    const range = select([nodes[0]!, 0], [last, last.length]);
    expect(selectedPieces(range, view)).toEqual([
      { text: 'Th', bold: true },
      { text: 'e ', bold: false },
      { text: 'we', bold: true },
      { text: 'll-', bold: false },
      { text: 'kno', bold: true },
      { text: 'wn ', bold: false },
      { text: 'rea', bold: true },
      { text: 'der', bold: false },
    ]);
  });

  test('a selection that starts in the middle of a bold piece keeps it bold', () => {
    const view = showText('reading slowly');
    const [readStart, , slowStart] = textNodes(view);
    // From the "e" of "read" to the "l" of "slow".
    const range = select([readStart!, 1], [slowStart!, 2]);
    expect(selectedPieces(range, view)).toEqual([
      { text: 'ead', bold: true },
      { text: 'ing ', bold: false },
      { text: 'sl', bold: true },
    ]);
  });

  test('a selection inside one bold piece is bold', () => {
    const view = showText('reading');
    const [readStart] = textNodes(view);
    const range = select([readStart!, 1], [readStart!, 3]);
    expect(selectedPieces(range, view)).toEqual([{ text: 'ea', bold: true }]);
  });
});

describe('copying', () => {
  test('puts the plain text and the HTML with bold on the clipboard', () => {
    const view = showText('hello world\n\nnext line');
    const nodes = textNodes(view);
    const last = nodes[nodes.length - 1]!;
    select([nodes[0]!, 0], [last, last.length]);
    const { event, data, stopped } = copyEvent();
    expect(copyWithBold(event, view)).toBe(true);
    expect(data.get('text/plain')).toBe('hello world\n\nnext line');
    expect(data.get('text/html')).toBe(
      `${P}<b>hel</b>lo <b>wor</b>ld</p>${P}&nbsp;</p>${P}<b>ne</b>xt <b>li</b>ne</p>`,
    );
    // The browser's own copy would put the text there a second time.
    expect(stopped()).toBe(true);
  });

  test('an emoji does not move the bold', () => {
    const view = showText('hi \u{1F600} world');
    const nodes = textNodes(view);
    const last = nodes[nodes.length - 1]!;
    select([nodes[0]!, 0], [last, last.length]);
    const { event, data } = copyEvent();
    copyWithBold(event, view);
    expect(data.get('text/html')).toBe(`${P}<b>h</b>i \u{1F600} <b>wor</b>ld</p>`);
  });

  test('a selection that reaches outside the view is left to the browser', () => {
    const view = showText('hello world');
    const outside = screen.getByText('Outside the view').firstChild!;
    const [first] = textNodes(view);
    select([outside, 0], [first!, 2]);
    const { event, data, stopped } = copyEvent();
    expect(copyWithBold(event, view)).toBe(false);
    expect(data.size).toBe(0);
    expect(stopped()).toBe(false);
  });

  test('nothing selected is left to the browser', () => {
    const view = showText('hello world');
    const { event, data, stopped } = copyEvent();
    expect(copyWithBold(event, view)).toBe(false);
    expect(data.size).toBe(0);
    expect(stopped()).toBe(false);
  });

  test('without a clipboard nothing is done', () => {
    const view = showText('hello world');
    const [first] = textNodes(view);
    select([first!, 0], [first!, 2]);
    const event = { clipboardData: null, preventDefault: () => {} } as unknown as ClipboardEvent;
    expect(copyWithBold(event, view)).toBe(false);
  });
});

describe('select all', () => {
  test('Ctrl+A in the view selects its text only', () => {
    const view = showText('hello world');
    fireEvent.keyDown(view, { key: 'a', ctrlKey: true });
    expect(document.getSelection()?.toString()).toBe('hello world');
  });

  test('Cmd+A on a Mac does the same', () => {
    const view = showText('hello world');
    fireEvent.keyDown(view, { key: 'a', metaKey: true });
    expect(document.getSelection()?.toString()).toBe('hello world');
  });

  test('a plain A does nothing', () => {
    const view = showText('hello world');
    fireEvent.keyDown(view, { key: 'a' });
    expect(document.getSelection()?.toString()).toBe('');
  });
});
