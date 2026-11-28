// The speaker name tag in WordDisplay. jsdom cannot lay a page out, so these
// check what the page is told: the text, its size and colour, and the rules
// CSS gets for where it goes. Where it really lands is checked in a browser,
// in e2e/speakerCues.spec.ts, once Speaker cues reach the page.
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { ChunkText } from '../core/reader';
import { WordDisplay, type SpeakerTag } from './WordDisplay';

const CHUNK: ChunkText = { before: 'w', focus: 'o', after: 'rd' };
const NO_TEXTS: readonly ChunkText[] = [];

function showWith(speakerTag?: SpeakerTag | null, extra: { offsetPx?: number; pan?: number } = {}) {
  return render(
    <WordDisplay
      chunk={CHUNK}
      fontSize={40}
      fitTexts={NO_TEXTS}
      offsetPx={extra.offsetPx ?? 0}
      marks={{ visible: true, horizontal: false, thicknessPx: 2, lengthPercent: 35, color: '#000' }}
      context={null}
      contextColor="#888"
      pan={extra.pan ?? 0}
      onPanChange={() => undefined}
      speakerTag={speakerTag}
    />,
  );
}

describe('the speaker name tag', () => {
  test('is not there when there is none to show', () => {
    showWith(null);
    expect(screen.queryByTestId('speaker-tag')).toBeNull();
    showWith();
    expect(screen.queryByTestId('speaker-tag')).toBeNull();
  });

  test('shows the name at half the word size, in its colour, and is not read out', () => {
    showWith({ name: 'Dr. Smith', position: 'above', color: '#9B9790' });
    const tag = screen.getByTestId('speaker-tag');
    expect(tag.textContent).toBe('Dr. Smith');
    expect(tag.style.fontSize).toBe('20px');
    expect(tag.style.color).toBe('rgb(155, 151, 144)');
    // Like the surrounding words, it changes with the reading, so a screen
    // reader is not made to follow it.
    expect(tag.getAttribute('aria-hidden')).toBe('true');
  });

  test('above the word: over the marks, but never closer than 4 px to the top', () => {
    showWith({ name: 'Ann', position: 'above', color: '#000' });
    const tag = screen.getByTestId('speaker-tag');
    expect(tag.dataset.position).toBe('above');
    // Half the letter 24, the gap 6, a 14 px mark, the margin 8, then the
    // tag's own line, 1.2 times 20 px: 76 px above the middle.
    expect(tag.style.top).toBe('max(4px, 50% - 76px)');
    expect(tag.style.textAlign).toBe('center');
  });

  // Sliding with the flash needs a real layout, so it is checked in the browser.
  test('above the word: it moves with the focus letter', () => {
    showWith({ name: 'Ann', position: 'above', color: '#000' }, { offsetPx: 10 });
    expect(screen.getByTestId('speaker-tag').style.top).toBe('max(4px, 50% - 86px)');
  });

  test('in the corner: 12 px in from the top and the right, holding still', () => {
    showWith({ name: 'Ann', position: 'top_right', color: '#000' });
    const tag = screen.getByTestId('speaker-tag');
    expect(tag.dataset.position).toBe('top_right');
    expect(tag.style.top).toBe('12px');
    expect(tag.style.right).toBe('12px');
    expect(tag.style.transform).toBe('');
  });
});
