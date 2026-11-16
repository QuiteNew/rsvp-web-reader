import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, test } from 'vitest';

import { APP_VERSION } from '../core/appInfo';
import { FakeClock, FakeVisibility } from '../testing/fakeClock';
import { App } from './App';

// At 300 words a minute a plain word shows for 200 ms.
const WORD_MS = 200;

interface Page {
  readonly clock: FakeClock;
  readonly visibility: FakeVisibility;
}

function renderPage(): Page {
  const clock = new FakeClock();
  const visibility = new FakeVisibility();
  render(<App clock={clock} visibility={visibility} />);
  return { clock, visibility };
}

function paste(text: string): void {
  fireEvent.change(screen.getByLabelText('Text to read'), { target: { value: text } });
}

function press(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

// Moves the clock inside act(), so React has drawn the result before the
// test looks at the page.
function wait(page: Page, ms: number): void {
  act(() => {
    page.clock.advance(ms);
  });
}

function word(): string {
  return screen.getByTestId('word').textContent;
}

function startReading(text = 'one two three four five'): Page {
  const page = renderPage();
  paste(text);
  press('Start reading');
  return page;
}

describe('the page', () => {
  test('the page shows the app name as its heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('RSVP Web Reader');
  });

  test('the page shows the version', () => {
    renderPage();
    expect(
      screen.getByText(new RegExp(`Version ${APP_VERSION.replaceAll('.', '\\.')}`)),
    ).toBeVisible();
  });

  test('the page links to the source', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/QuiteNew/rsvp-web-reader',
    );
  });
});

describe('the text box', () => {
  test('Start is off until there is some text', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Start reading' })).toBeDisabled();
    paste('   ');
    expect(screen.getByRole('button', { name: 'Start reading' })).toBeDisabled();
    paste('hello');
    expect(screen.getByRole('button', { name: 'Start reading' })).toBeEnabled();
  });

  test('a text with only timestamps says there is nothing to read', () => {
    renderPage();
    paste('[00:01] [00:02]');
    press('Start reading');
    expect(screen.getByRole('alert')).toHaveTextContent('There are no words to read');
    expect(screen.queryByTestId('word')).toBeNull();
  });

  test('the message goes away when the text changes', () => {
    renderPage();
    paste('[00:01]');
    press('Start reading');
    paste('[00:01] hello');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('reading', () => {
  test('Start shows the first word and plays', () => {
    startReading();
    expect(word()).toBe('one');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
  });

  test('the next word shows when the first one has had its time', () => {
    const page = startReading();
    wait(page, WORD_MS - 1);
    expect(word()).toBe('one');
    wait(page, 1);
    expect(word()).toBe('two');
  });

  test('the word is drawn in three parts around its focus letter', () => {
    startReading('reading');
    const parts = Array.from(screen.getByTestId('word').children, (part) => part.textContent);
    expect(parts).toEqual(['re', 'a', 'ding']);
  });

  test('timestamps are not read', () => {
    const page = startReading('[00:01] hello [00:02] world');
    expect(word()).toBe('hello');
    wait(page, WORD_MS);
    expect(word()).toBe('world');
  });

  test('Pause holds the word, and Play goes on', () => {
    const page = startReading();
    press('Pause');
    wait(page, 5000);
    expect(word()).toBe('one');
    press('Play');
    wait(page, WORD_MS);
    expect(word()).toBe('two');
  });

  test('Forward and Back skip, and stop at the ends', () => {
    startReading('a b c d e f g h i j k l m n o');
    press('Forward 10');
    expect(word()).toBe('k');
    press('Back 10');
    expect(word()).toBe('a');
    press('Back 10');
    expect(word()).toBe('a');
  });

  test('Restart goes back to the first word', () => {
    const page = startReading();
    wait(page, WORD_MS * 3);
    press('Restart');
    expect(word()).toBe('one');
  });

  test('the end says so, turns Play off, and Restart reads again', () => {
    const page = startReading();
    wait(page, WORD_MS * 5);
    expect(screen.getByText('End of the text.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByText('100%')).toBeVisible();
    press('Restart');
    expect(word()).toBe('one');
    expect(screen.queryByText('End of the text.')).toBeNull();
  });

  test('time left, percent and the word count follow along', () => {
    const page = startReading();
    expect(screen.getByText('1s left')).toBeVisible();
    expect(screen.getByText('0%')).toBeVisible();
    expect(screen.getByText('Word 1 of 5')).toBeVisible();
    wait(page, WORD_MS * 2);
    expect(screen.getByText('40%')).toBeVisible();
    expect(screen.getByText('Word 3 of 5')).toBeVisible();
  });

  test('a new speed applies from the next word', () => {
    const page = startReading();
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '600' } });
    expect(screen.getByText('600 words a minute')).toBeVisible();
    // The word on screen keeps its 200 ms. The one after gets 100.
    wait(page, WORD_MS);
    expect(word()).toBe('two');
    wait(page, 100);
    expect(word()).toBe('three');
  });

  test('reading holds while the tab is hidden', () => {
    const page = startReading();
    act(() => {
      page.visibility.setHidden(true);
    });
    wait(page, 60_000);
    expect(word()).toBe('one');
    act(() => {
      page.visibility.setHidden(false);
    });
    wait(page, WORD_MS);
    expect(word()).toBe('two');
  });
});

describe('going back to the text', () => {
  test('Change the text brings the box back with the text still in it', () => {
    startReading('keep this text');
    press('Change the text');
    expect(screen.getByLabelText('Text to read')).toHaveValue('keep this text');
    expect(screen.queryByTestId('word')).toBeNull();
  });

  test('the speed chosen while reading is kept for the next text', () => {
    startReading();
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '500' } });
    press('Change the text');
    press('Start reading');
    expect(screen.getByText('500 words a minute')).toBeVisible();
  });

  test('nothing keeps ticking after going back', () => {
    const page = startReading();
    press('Change the text');
    expect(page.clock.pending).toBe(0);
  });
});

describe('under React strict mode', () => {
  // In development React mounts everything, takes it down and mounts it
  // again. The reading loop has to come through that still working.
  test('reading still works', () => {
    const clock = new FakeClock();
    const visibility = new FakeVisibility();
    render(
      <StrictMode>
        <App clock={clock} visibility={visibility} />
      </StrictMode>,
    );
    paste('one two three');
    press('Start reading');
    expect(word()).toBe('one');
    act(() => {
      clock.advance(WORD_MS);
    });
    expect(word()).toBe('two');
  });
});
