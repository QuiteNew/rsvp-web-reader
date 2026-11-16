import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

function press(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

// Types into the one text field of the open dialog and presses its button.
function answerDialog(value: string, button = 'Create'): void {
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value } });
  fireEvent.click(within(dialog).getByRole('button', { name: button }));
}

function addTranscript(title: string): void {
  press('Add transcript');
  answerDialog(title);
}

function addSpace(name: string): void {
  press('New Space');
  answerDialog(name);
}

function paste(text: string): void {
  fireEvent.change(screen.getByLabelText('Transcript text'), { target: { value: text } });
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

function titles(): string[] {
  const list = screen.queryByRole('list');
  if (list === null) return [];
  return within(list)
    .getAllByRole('button')
    .filter((button) => !button.getAttribute('aria-label')?.startsWith('Delete'))
    .map((button) => button.textContent);
}

function startReading(text = 'one two three four five'): Page {
  const page = renderPage();
  addTranscript('Notes');
  paste(text);
  press('Start reading');
  return page;
}

describe('the empty page', () => {
  test('shows the app name, the list heading and the General Space', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('RSVP Web Reader');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('List of Transcripts');
    expect(screen.getByText('General')).toBeVisible();
    expect(screen.getByText(/No transcripts in this Space yet/)).toBeVisible();
  });

  test('Settings shows the version and the link to the source', () => {
    renderPage();
    press('Settings');
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toHaveTextContent(`version ${APP_VERSION}`);
    expect(within(dialog).getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/QuiteNew/rsvp-web-reader',
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('transcripts', () => {
  test('adding one puts it in the list, opens it and shows its title', () => {
    renderPage();
    addTranscript('  My notes  ');
    expect(titles()).toEqual(['My notes']);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My notes');
    expect(screen.getByRole('button', { name: 'My notes' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByLabelText('Transcript text')).toHaveValue('');
  });

  test('a transcript needs a title', () => {
    renderPage();
    press('Add transcript');
    answerDialog('   ');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(titles()).toEqual([]);
  });

  test('Cancel adds nothing', () => {
    renderPage();
    press('Add transcript');
    answerDialog('Notes', 'Cancel');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(titles()).toEqual([]);
  });

  test('each transcript keeps its own text', () => {
    renderPage();
    addTranscript('First');
    paste('first text');
    addTranscript('Second');
    paste('second text');
    press('First');
    expect(screen.getByLabelText('Transcript text')).toHaveValue('first text');
    press('Second');
    expect(screen.getByLabelText('Transcript text')).toHaveValue('second text');
  });

  test('the search box narrows the list by title', () => {
    renderPage();
    addTranscript('Database notes');
    addTranscript('Exam plan');
    fireEvent.change(screen.getByLabelText('Search transcripts'), { target: { value: 'EXAM' } });
    expect(titles()).toEqual(['Exam plan']);
    fireEvent.change(screen.getByLabelText('Search transcripts'), { target: { value: 'zzz' } });
    expect(screen.getByText('No title matches the search.')).toBeVisible();
  });

  test('deleting asks first, and Cancel keeps the transcript', () => {
    renderPage();
    addTranscript('Notes');
    press('Delete Notes');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(titles()).toEqual(['Notes']);
  });

  test('deleting the open transcript closes it', () => {
    renderPage();
    addTranscript('Notes');
    press('Delete Notes');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(titles()).toEqual([]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('RSVP Web Reader');
    expect(screen.queryByLabelText('Transcript text')).toBeNull();
  });
});

describe('spaces', () => {
  test('a new Space becomes the current one, and starts empty', () => {
    renderPage();
    addTranscript('In General');
    addSpace('Work');
    expect(screen.getByText('Work')).toBeVisible();
    expect(titles()).toEqual([]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('RSVP Web Reader');
  });

  test('a Space name that is taken is refused', () => {
    renderPage();
    addSpace('General');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  test('each Space lists only its own transcripts', () => {
    renderPage();
    addTranscript('In General');
    addSpace('Work');
    addTranscript('In Work');
    expect(titles()).toEqual(['In Work']);
    press('Select Space');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'General' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(titles()).toEqual(['In General']);
  });

  test('a Space can be renamed, and its transcripts stay in it', () => {
    renderPage();
    addTranscript('Notes');
    press('Select Space');
    press('Rename General');
    const input = screen.getByLabelText('New name for General');
    fireEvent.change(input, { target: { value: 'Home' } });
    fireEvent.submit(input);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('Home')).toBeVisible();
    expect(titles()).toEqual(['Notes']);
  });

  test('only an empty Space that is not the last can be deleted', () => {
    renderPage();
    press('Select Space');
    expect(screen.getByRole('button', { name: 'Delete General' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });

    addTranscript('Notes');
    addSpace('Work');
    press('Select Space');
    expect(screen.getByRole('button', { name: 'Delete General' })).toBeDisabled();
    press('Delete Work');
    expect(screen.queryByRole('button', { name: 'Work' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('General')).toBeVisible();
    expect(titles()).toEqual(['Notes']);
  });
});

describe('the text box', () => {
  test('Start is off until there is some text', () => {
    renderPage();
    addTranscript('Notes');
    expect(screen.getByRole('button', { name: 'Start reading' })).toBeDisabled();
    paste('   ');
    expect(screen.getByRole('button', { name: 'Start reading' })).toBeDisabled();
    paste('hello');
    expect(screen.getByRole('button', { name: 'Start reading' })).toBeEnabled();
  });

  test('a text with only timestamps says there is nothing to read', () => {
    renderPage();
    addTranscript('Notes');
    paste('[00:01] [00:02]');
    press('Start reading');
    expect(screen.getByRole('alert')).toHaveTextContent('There are no words to read');
    expect(screen.queryByTestId('word')).toBeNull();
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

  test('the skip buttons move ten words, and stop at the ends', () => {
    startReading('a b c d e f g h i j k l m n o');
    press('Forward 10 words');
    expect(word()).toBe('k');
    press('Back 10 words');
    expect(word()).toBe('a');
    press('Back 10 words');
    expect(word()).toBe('a');
  });

  test('the skip buttons are off while nothing is being read', () => {
    renderPage();
    addTranscript('Notes');
    expect(screen.getByRole('button', { name: 'Forward 10 words' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back 10 words' })).toBeDisabled();
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

  test('time left and percent follow along', () => {
    const page = startReading();
    expect(screen.getByText('1s left')).toBeVisible();
    expect(screen.getByText('0%')).toBeVisible();
    wait(page, WORD_MS * 2);
    expect(screen.getByText('40%')).toBeVisible();
  });

  test('a new speed applies from the next word', () => {
    const page = startReading();
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '600' } });
    expect(screen.getByText('600 WPM')).toBeVisible();
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

describe('stopping and coming back', () => {
  test('Stop brings the text box back with the text still in it', () => {
    const page = startReading('keep this text');
    press('Stop reading');
    expect(screen.getByLabelText('Transcript text')).toHaveValue('keep this text');
    expect(screen.queryByTestId('word')).toBeNull();
    expect(page.clock.pending).toBe(0);
  });

  test('reading picks up at the word it was stopped on', () => {
    const page = startReading();
    wait(page, WORD_MS * 2);
    press('Stop reading');
    press('Start reading');
    expect(word()).toBe('three');
  });

  test('a transcript read to the end starts again from the first word', () => {
    const page = startReading();
    wait(page, WORD_MS * 5);
    press('Stop reading');
    press('Start reading');
    expect(word()).toBe('one');
  });

  test('a changed text is read from its first word', () => {
    const page = startReading();
    wait(page, WORD_MS * 2);
    press('Stop reading');
    paste('new words here now');
    press('Start reading');
    expect(word()).toBe('new');
  });

  test('each transcript keeps its own speed and its own place', () => {
    const page = startReading();
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '600' } });
    wait(page, WORD_MS);
    addTranscript('Other');
    expect(screen.getByText('300 WPM')).toBeVisible();
    press('Notes');
    expect(screen.getByText('600 WPM')).toBeVisible();
    press('Start reading');
    expect(word()).toBe('two');
  });

  test('opening another transcript stops the reading', () => {
    const page = startReading();
    addTranscript('Other');
    expect(screen.queryByTestId('word')).toBeNull();
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
    addTranscript('Notes');
    paste('one two three');
    press('Start reading');
    expect(word()).toBe('one');
    act(() => {
      clock.advance(WORD_MS);
    });
    expect(word()).toBe('two');
  });
});
