import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { APP_VERSION } from '../core/appInfo';
import { FakeClock, FakeVisibility } from '../testing/fakeClock';
import { buildBundle, bundleText } from '../core/bundle';
import { blendColors } from '../core/colors';
import { EMPTY_LIBRARY, TRANSCRIPT_DEFAULTS, type Library } from '../core/models';
import { DEFAULT_SAVED_SETTINGS } from '../core/settings';
import { SavedLibraryStore } from '../store/libraryStore';
import { MemoryPersistence } from '../store/memoryPersistence';
import { SETTINGS_KEY } from '../store/schema';
import { SavedSettingsStore } from '../store/settingsStore';
import { App } from './App';
import { DataSettings } from './DataSettings';

// The page remembers the open transcript in localStorage. Each test starts
// with none.
afterEach(() => {
  window.localStorage.clear();
});

// At 300 words a minute a plain word shows for 200 ms.
const WORD_MS = 200;

interface Page {
  readonly clock: FakeClock;
  readonly visibility: FakeVisibility;
  readonly store: SavedLibraryStore;
  readonly persistence: MemoryPersistence<Library>;
}

function renderPage(library: Library = EMPTY_LIBRARY): Page {
  const clock = new FakeClock();
  const visibility = new FakeVisibility();
  const persistence = new MemoryPersistence<Library>();
  const store = SavedLibraryStore.ready(persistence, library);
  // Read from localStorage as the page opens, the way main.tsx does it.
  render(<App store={store} settings={savedSettings()} clock={clock} visibility={visibility} />);
  return { clock, visibility, store, persistence };
}

// The settings as the page finds them when it opens.
function savedSettings(): SavedSettingsStore {
  return new SavedSettingsStore(window.localStorage);
}

function press(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

// Opens Settings, on another tab than Defaults when asked.
function openSettings(tab?: 'Appearance' | 'Data'): void {
  press('Settings');
  if (tab !== undefined) fireEvent.click(screen.getByRole('tab', { name: tab }));
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
    openSettings('Data');
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
    // It was left in the reader, so it comes back there, paused.
    expect(word()).toBe('two');
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
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
        <App
          store={SavedLibraryStore.ready(new MemoryPersistence<Library>())}
          settings={savedSettings()}
          clock={clock}
          visibility={visibility}
        />
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

// The colours the page gives a transcript that follows the theme, in Light.
// A library already holding them is left as it is when the page opens.
const LIGHT_READING = {
  fontColor: '#3B2E27',
  highlightColor: '#D98A3D',
  backgroundColor: '#F6EFE3',
};

const SAVED: Library = {
  nextId: 3,
  currentSpaceIndex: 0,
  spaces: ['General', 'Work'],
  transcripts: [
    {
      ...TRANSCRIPT_DEFAULTS,
      ...LIGHT_READING,
      id: 1,
      title: 'Kept',
      space: 'General',
      rawText: 'one two three',
      isStopped: true,
    },
    {
      ...TRANSCRIPT_DEFAULTS,
      ...LIGHT_READING,
      id: 2,
      title: 'At work',
      space: 'Work',
      isStopped: true,
    },
  ],
};

describe('saving', () => {
  test('the page waits for the saved library before showing anything to change', async () => {
    const store = new SavedLibraryStore(
      new MemoryPersistence<Library>({ kind: 'ok', value: SAVED }),
    );
    render(<App store={store} settings={savedSettings()} />);
    expect(screen.getByRole('status').textContent).toContain('Opening your library');
    expect(screen.queryByRole('button', { name: 'Add transcript' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Kept' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  test('a saved library is shown as it was left', () => {
    renderPage(SAVED);
    press('Kept');
    expect((screen.getByLabelText('Transcript text') as HTMLTextAreaElement).value).toBe(
      'one two three',
    );
  });

  test('adding a transcript and typing its text are written', async () => {
    const { store, persistence } = renderPage();
    press('Add transcript');
    answerDialog('Lecture');
    fireEvent.change(screen.getByLabelText('Transcript text'), { target: { value: 'some words' } });
    await act(() => store.flush());
    expect(persistence.writes.at(-1)?.transcripts).toMatchObject([
      { id: 1, title: 'Lecture', rawText: 'some words' },
    ]);
  });

  test('stopping writes the word that was reached', async () => {
    const { store, persistence, clock } = renderPage(SAVED);
    press('Kept');
    press('Start reading');
    act(() => {
      clock.advance(WORD_MS);
    });
    press('Stop reading');
    await act(() => store.flush());
    expect(persistence.writes.at(-1)?.transcripts[0]?.position).toBe(1);
  });

  test('a step made while paused is written at once, not held back', async () => {
    const { persistence, clock } = renderPage();
    addTranscript('Notes');
    paste('a b c d e f g h i j k l m n o');
    press('Start reading');
    act(() => {
      clock.advance(WORD_MS); // the first word has had its time: written
    });
    press('Pause');
    press('Forward 10 words'); // less than a second after that write
    await act(async () => {
      await Promise.resolve();
    });
    expect(persistence.writes.at(-1)?.transcripts[0]?.position).toBe(11);
  });

  test('hiding the page writes what was waiting', async () => {
    const { store, persistence } = renderPage(SAVED);
    store.setPosition(1, 1);
    store.setPosition(1, 2); // held back, less than a second after the first
    await act(() => store.flush());
    const writes = persistence.writes.length;
    store.setPosition(1, 3);
    expect(persistence.writes).toHaveLength(writes);
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await Promise.resolve();
    });
    expect(persistence.writes.at(-1)?.transcripts[0]?.position).toBe(3);
  });

  test('a damaged save is announced once and can be dismissed', async () => {
    const store = new SavedLibraryStore(
      new MemoryPersistence<Library>({
        kind: 'damaged',
        keptAs: 'library.damaged-20261116-101500',
      }),
    );
    render(<App store={store} settings={savedSettings()} />);
    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toContain('library.damaged-20261116-101500');
    fireEvent.click(within(notice).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a browser that will not save says so and still works', async () => {
    const store = new SavedLibraryStore({
      read: () => Promise.reject(new Error('blocked')),
      write: () => Promise.reject(new Error('blocked')),
    });
    render(<App store={store} settings={savedSettings()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('not letting the app save');
    press('Add transcript');
    answerDialog('Lecture');
    expect(screen.getByRole('button', { name: 'Lecture' })).toBeTruthy();
  });

  test('the browser is asked to keep the data when the first transcript is added', () => {
    const requestPersistence = vi.fn(() => Promise.resolve('granted' as const));
    render(
      <App
        store={SavedLibraryStore.ready(new MemoryPersistence<Library>())}
        settings={savedSettings()}
        health={{ requestPersistence }}
      />,
    );
    expect(requestPersistence).not.toHaveBeenCalled();
    press('Add transcript');
    answerDialog('Lecture');
    expect(requestPersistence).toHaveBeenCalledTimes(1);
  });
});

describe('export and import', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  function chooseFile(text: string): void {
    const file = new File([text], 'export.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Import from a file'), { target: { files: [file] } });
  }

  const THEIRS: Library = {
    nextId: 2,
    currentSpaceIndex: 0,
    spaces: ['General', 'Books'],
    transcripts: [{ ...TRANSCRIPT_DEFAULTS, id: 1, title: 'Novel', space: 'Books', position: 7 }],
  };
  const THEIR_FILE = bundleText(buildBundle(THEIRS, { default_wpm: 450, data_directory: 'C:\\x' }));

  test('Settings says where the data lives', () => {
    renderPage();
    openSettings('Data');
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog.textContent).toContain('saved in this browser, on this device only');
  });

  test('export hands over a bundle the app can read back', () => {
    const created = vi.fn((blob: Blob) => {
      void blob;
      return 'blob:export';
    });
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ default_wpm: 450 }));
    renderPage(SAVED);
    openSettings('Data');
    press('Export to a file');
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledTimes(1);
  });

  test('a file that is not an export shows the desktop message and changes nothing', async () => {
    const { store } = renderPage(SAVED);
    openSettings('Data');
    chooseFile('not json');
    expect((await screen.findByRole('alert')).textContent).toBe(
      "That file isn't valid JSON, so it can't be an RSVP Reader export.",
    );
    expect(store.getSnapshot()).toBe(SAVED);
  });

  test('Replace takes the file in place of what was here, and its settings', async () => {
    const { store, persistence } = renderPage(SAVED);
    openSettings('Data');
    chooseFile(THEIR_FILE);
    const group = await screen.findByRole('group', { name: 'Import' });
    expect(group.textContent).toContain('1 transcript in 2 Spaces');
    fireEvent.click(within(group).getByRole('button', { name: 'Replace everything' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getSnapshot()).toEqual(THEIRS);
    await act(() => store.flush());
    expect(persistence.writes.at(-1)).toEqual(THEIRS);
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '')).toMatchObject({
      default_wpm: 450,
    });
  });

  test('Add keeps what was here, gives new ids and leaves the settings', async () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ default_wpm: 300 }));
    const { store } = renderPage(SAVED);
    openSettings('Data');
    chooseFile(THEIR_FILE);
    const group = await screen.findByRole('group', { name: 'Import' });
    fireEvent.click(within(group).getByRole('button', { name: 'Add to what is here' }));
    const library = store.getSnapshot();
    expect(library.spaces).toEqual(['General', 'Work', 'Books']);
    expect(library.transcripts.map((t) => [t.id, t.title])).toEqual([
      [1, 'Kept'],
      [2, 'At work'],
      [3, 'Novel'],
    ]);
    expect(library.transcripts[2]?.position).toBe(7);
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '')).toMatchObject({
      default_wpm: 300,
    });
  });

  test('Cancel leaves everything as it was', async () => {
    const { store } = renderPage(SAVED);
    openSettings('Data');
    chooseFile(THEIR_FILE);
    const group = await screen.findByRole('group', { name: 'Import' });
    fireEvent.click(within(group).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Import' })).toBeNull();
    expect(store.getSnapshot()).toBe(SAVED);
  });
});

describe('the settings the page uses', () => {
  function save(settings: object): void {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  test('a new transcript starts with what Settings holds for one', () => {
    save({ default_wpm: 450, default_font_size: 40, default_chunk_size: 3 });
    const { store } = renderPage();
    addTranscript('Notes');
    expect(store.getSnapshot().transcripts[0]).toMatchObject({
      wpm: 450,
      fontSize: 40,
      chunkSize: 3,
      fontColor: '#3B2E27',
      chunkingEnabled: false,
    });
    expect(screen.getByRole('slider', { name: 'Speed' })).toHaveValue('450');
  });

  test('the skip buttons move by the number of words in the settings', () => {
    save({ skip_word_count: 3 });
    renderPage();
    addTranscript('Notes');
    paste('a b c d e f g h');
    press('Start reading');
    press('Pause');
    press('Forward 3 words');
    expect(word()).toBe('d');
    press('Back 3 words');
    expect(word()).toBe('a');
  });

  test('a setting outside its range is used as the nearest end of it', () => {
    save({ default_wpm: 5000 });
    const { store } = renderPage();
    addTranscript('Notes');
    expect(store.getSnapshot().transcripts[0]?.wpm).toBe(1000);
  });

  test('settings that cannot be read are announced once and put aside', () => {
    window.localStorage.setItem(SETTINGS_KEY, 'not settings');
    renderPage();
    const notice = screen.getByRole('alert');
    expect(notice.textContent).toContain('The saved settings could not be read');
    expect(window.localStorage.getItem(`${SETTINGS_KEY}.damaged`)).toBe('not settings');
    fireEvent.click(within(notice).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('alert')).toBeNull();
    // The page works with the defaults.
    addTranscript('Notes');
    expect(screen.getByRole('slider', { name: 'Speed' })).toHaveValue('300');
  });

  test('an export carries every setting, in the desktop shape', () => {
    save({ default_wpm: 450, window_width: 1200 });
    const saveFile = vi.fn<(name: string, text: string) => void>();
    const store = SavedLibraryStore.ready(new MemoryPersistence<Library>());
    const settings = savedSettings();
    render(
      <DataSettings
        library={store.getSnapshot()}
        store={store}
        settings={settings}
        onImported={() => {}}
        saveFile={saveFile}
      />,
    );
    press('Export to a file');
    const bundle = JSON.parse(saveFile.mock.calls[0]?.[1] ?? '') as { settings: object };
    expect(bundle.settings).toEqual({
      ...DEFAULT_SAVED_SETTINGS,
      default_wpm: 450,
      window_width: 1200,
    });
  });
});

// A reload, as far as the page can tell: the old page goes away, and a new
// one opens on what was saved, with the same localStorage.
describe('coming back after a reload', () => {
  const TEXT = 'one two three four five';

  async function reload(page: Page, unmount: () => void): Promise<Page> {
    await act(() => page.store.flush());
    unmount();
    const saved = page.persistence.writes.at(-1);
    const persistence = new MemoryPersistence<Library>(
      saved === undefined ? { kind: 'missing' } : { kind: 'ok', value: saved },
    );
    const store = new SavedLibraryStore(persistence);
    const clock = new FakeClock();
    const visibility = new FakeVisibility();
    render(<App store={store} settings={savedSettings()} clock={clock} visibility={visibility} />);
    await screen.findByRole('heading', { level: 2 });
    return { clock, visibility, store, persistence };
  }

  function firstPage(library: Library = EMPTY_LIBRARY) {
    const clock = new FakeClock();
    const visibility = new FakeVisibility();
    const persistence = new MemoryPersistence<Library>();
    const store = SavedLibraryStore.ready(persistence, library);
    const { unmount } = render(
      <App store={store} settings={savedSettings()} clock={clock} visibility={visibility} />,
    );
    return { page: { clock, visibility, store, persistence }, unmount };
  }

  function addAndType(title: string, text: string): void {
    press('Add transcript');
    answerDialog(title);
    fireEvent.change(screen.getByLabelText('Transcript text'), { target: { value: text } });
  }

  test('a transcript left playing comes back in the reader, paused on the same word', async () => {
    const { page, unmount } = firstPage();
    addAndType('Lecture', TEXT);
    press('Start reading');
    act(() => {
      page.clock.advance(2 * WORD_MS);
    });
    expect(word()).toBe('three');

    const after = await reload(page, unmount);
    expect(word()).toBe('three');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Lecture');
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    // Paused: time passes and the word stays.
    act(() => {
      after.clock.advance(10 * WORD_MS);
    });
    expect(word()).toBe('three');
    expect(after.store.getSnapshot().transcripts[0]).toMatchObject({ isPaused: true, position: 2 });
    // And Play carries on from there.
    press('Play');
    act(() => {
      after.clock.advance(WORD_MS);
    });
    expect(word()).toBe('four');
  });

  test('a transcript left paused comes back paused on the same word', async () => {
    const { page, unmount } = firstPage();
    addAndType('Lecture', TEXT);
    press('Start reading');
    act(() => {
      page.clock.advance(WORD_MS);
    });
    press('Pause');
    await reload(page, unmount);
    expect(word()).toBe('two');
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  test('a transcript left as text comes back as text', async () => {
    const { page, unmount } = firstPage();
    addAndType('Lecture', TEXT);
    await reload(page, unmount);
    expect((screen.getByLabelText('Transcript text') as HTMLTextAreaElement).value).toBe(TEXT);
    expect(screen.queryByTestId('word')).toBeNull();
  });

  test('a transcript that was stopped comes back as text, and Start picks up its word', async () => {
    const { page, unmount } = firstPage();
    addAndType('Lecture', TEXT);
    press('Start reading');
    act(() => {
      page.clock.advance(2 * WORD_MS);
    });
    press('Stop reading');
    await reload(page, unmount);
    expect(screen.getByLabelText('Transcript text')).toBeTruthy();
    press('Start reading');
    expect(word()).toBe('three');
  });

  test('the transcript comes back in its own Space', async () => {
    const { page, unmount } = firstPage();
    press('New Space');
    answerDialog('Work');
    addAndType('At work', TEXT);
    press('Start reading');
    await reload(page, unmount);
    expect(word()).toBe('one');
    expect(screen.getByRole('button', { name: 'At work' }).getAttribute('aria-current')).toBe(
      'true',
    );
  });

  test('with nothing open, nothing is opened', async () => {
    const { page, unmount } = firstPage();
    addAndType('Lecture', TEXT);
    press('New Space'); // leaves the open transcript
    answerDialog('Work');
    await reload(page, unmount);
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe('Lecture');
    expect(screen.queryByLabelText('Transcript text')).toBeNull();
  });

  test('a deleted transcript is not opened', async () => {
    const { page, unmount } = firstPage();
    addAndType('Lecture', TEXT);
    press('Delete Lecture');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await reload(page, unmount);
    expect(screen.queryByLabelText('Transcript text')).toBeNull();
  });

  test('nothing is opened when the saved settings switch it off', async () => {
    const { page, unmount } = firstPage();
    addAndType('Lecture', TEXT);
    press('Start reading');
    const settings = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as object;
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ ...settings, reopen_last_transcript: false }),
    );
    await reload(page, unmount);
    expect(screen.queryByTestId('word')).toBeNull();
    expect(screen.queryByLabelText('Transcript text')).toBeNull();
  });

  test('the switch in Settings turns reopening off, and on again', async () => {
    const { page, unmount } = firstPage();
    addAndType('Lecture', TEXT);
    press('Start reading');
    press('Settings');
    const reopen = screen.getByRole('checkbox', { name: 'Reopen the last transcript at launch' });
    expect(reopen).toBeChecked();
    fireEvent.click(reopen);
    expect(reopen).not.toBeChecked();
    press('Apply');
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '')).toMatchObject({
      reopen_last_transcript: false,
      last_transcript_id: 1,
    });

    const second = await reload(page, unmount);
    expect(screen.queryByTestId('word')).toBeNull();
    expect(screen.queryByLabelText('Transcript text')).toBeNull();

    // Switched back on, the next reload opens what is open then.
    press('Lecture');
    press('Settings');
    fireEvent.click(screen.getByRole('checkbox', { name: /Reopen the last transcript/ }));
    press('Apply');
    cleanup();
    await reload(second, () => {});
    expect(word()).toBe('one');
  });

  test('picking a transcript that was left in the reader opens it there, paused', () => {
    const { page } = firstPage();
    addAndType('First', TEXT);
    press('Start reading');
    act(() => {
      page.clock.advance(2 * WORD_MS);
    });
    addAndType('Second', 'other words');
    press('First');
    expect(word()).toBe('three');
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    act(() => {
      page.clock.advance(5 * WORD_MS);
    });
    expect(word()).toBe('three');
  });

  test('in StrictMode the reader is loaded once and stays paused', async () => {
    const saved: Library = {
      ...EMPTY_LIBRARY,
      nextId: 2,
      transcripts: [
        {
          ...TRANSCRIPT_DEFAULTS,
          id: 1,
          title: 'Lecture',
          space: 'General',
          rawText: TEXT,
          position: 3,
        },
      ],
    };
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ last_transcript_id: 1 }));
    const clock = new FakeClock();
    render(
      <StrictMode>
        <App
          store={
            new SavedLibraryStore(new MemoryPersistence<Library>({ kind: 'ok', value: saved }))
          }
          settings={savedSettings()}
          clock={clock}
          visibility={new FakeVisibility()}
        />
      </StrictMode>,
    );
    await screen.findByTestId('word');
    expect(word()).toBe('four');
    act(() => {
      clock.advance(5 * WORD_MS);
    });
    expect(word()).toBe('four');
  });
});

describe('the theme', () => {
  const DARK = { font: '#F2E8DC', highlight: '#A8672E', background: '#241D17' };

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
  });

  function pickAppearance(value: string): void {
    openSettings('Appearance');
    fireEvent.change(screen.getByLabelText('Colour theme'), { target: { value } });
    press('Apply');
  }

  function render_(library: Library = EMPTY_LIBRARY) {
    const store = SavedLibraryStore.ready(new MemoryPersistence<Library>(), library);
    const settings = savedSettings();
    render(<App store={store} settings={settings} />);
    return { store, settings };
  }

  test('it starts light', () => {
    render_();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  test('choosing Dark puts the dark theme on the page and saves the choice', () => {
    const { settings } = render_();
    pickAppearance('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(settings.saved().appearance_mode).toBe('dark');
    expect(window.localStorage.getItem(SETTINGS_KEY)).toContain('"appearance_mode":"dark"');
  });

  test('System follows the browser, and a change of it while the page is open', () => {
    let listener: () => void = () => undefined;
    let dark = true;
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return dark;
      },
      addEventListener: (_type: string, fn: () => void) => {
        listener = fn;
      },
      removeEventListener: () => undefined,
    }));
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ appearance_mode: 'system' }));
    render_();
    expect(document.documentElement.dataset.theme).toBe('dark');
    dark = false;
    act(() => {
      listener();
    });
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  test('reading colours that follow the theme follow a change to Dark, and back', () => {
    const { store } = render_({
      ...EMPTY_LIBRARY,
      nextId: 2,
      transcripts: [{ ...TRANSCRIPT_DEFAULTS, id: 1, title: 'follows', space: 'General' }],
    });
    pickAppearance('dark');
    expect(store.getSnapshot().transcripts[0]).toMatchObject({
      fontColor: DARK.font,
      highlightColor: DARK.highlight,
      backgroundColor: DARK.background,
    });
    pickAppearance('light');
    expect(store.getSnapshot().transcripts[0]).toMatchObject({
      ...LIGHT_READING,
    });
  });

  test('a colour picked by hand stays the same in both themes', () => {
    const { store } = render_({
      ...EMPTY_LIBRARY,
      nextId: 2,
      transcripts: [
        {
          ...TRANSCRIPT_DEFAULTS,
          id: 1,
          title: 'picked',
          space: 'General',
          fontColor: '#ABCDEF',
          fontColorIsDefault: false,
        },
      ],
    });
    pickAppearance('dark');
    expect(store.getSnapshot().transcripts[0]).toMatchObject({
      fontColor: '#ABCDEF',
      highlightColor: DARK.highlight,
    });
  });

  test('a new transcript gets the dark reading colours in Dark', () => {
    const { store } = render_();
    pickAppearance('dark');
    addTranscript('Night');
    expect(store.getSnapshot().transcripts[0]).toMatchObject({
      fontColor: DARK.font,
      highlightColor: DARK.highlight,
      backgroundColor: DARK.background,
    });
  });

  test('the guide marks follow the theme until a colour is picked by hand', () => {
    const { settings } = render_();
    pickAppearance('dark');
    expect(settings.saved().guide_mark_color).toBe('#F2E8DC');
    act(() => {
      settings.setGuideMarkColor('#112233');
    });
    pickAppearance('light');
    expect(settings.saved().guide_mark_color).toBe('#112233');
  });
});

describe('the guide marks', () => {
  function startReading() {
    const page = renderPage();
    addTranscript('Notes');
    paste('a b c d e f g h');
    press('Start reading');
    return page;
  }

  function setBox(name: RegExp, value: string): void {
    press('Settings');
    fireEvent.change(screen.getByRole('textbox', { name }), { target: { value } });
    press('Apply');
  }

  function setSlider(name: RegExp, value: number): void {
    press('Settings');
    fireEvent.change(screen.getByRole('slider', { name }), { target: { value: String(value) } });
    press('Apply');
  }

  test('they show while words go by and are gone when paused', () => {
    startReading();
    expect(screen.getByTestId('guide-marks')).toBeInTheDocument();
    press('Pause');
    expect(screen.queryByTestId('guide-marks')).toBeNull();
    press('Play');
    expect(screen.getByTestId('guide-marks')).toBeInTheDocument();
  });

  test('the horizontal lines come with the setting', () => {
    startReading();
    expect(screen.getByTestId('guide-marks').children).toHaveLength(2);
    press('Settings');
    fireEvent.click(screen.getByLabelText('Show horizontal guide lines'));
    press('Apply');
    expect(screen.getByTestId('guide-marks').children).toHaveLength(4);
  });

  test('thickness, length and the focus letter height reach the page', () => {
    startReading();
    setBox(/Thickness of the vertical guide marks/, '5');
    setSlider(/Mark length/, 60);
    setBox(/Shift the highlighted letter/, '-2');
    const display = screen.getByTestId('word').parentElement;
    expect(display?.style.getPropertyValue('--mark-thickness')).toBe('5px');
    // the default 32 px font at 60 percent, 19.2 rounded
    expect(display?.style.getPropertyValue('--mark-length')).toBe('19px');
    expect(display?.style.getPropertyValue('--offset')).toBe('-2px');
  });

  test('the colour follows the theme until one is picked, then stays', () => {
    startReading();
    const display = () => screen.getByTestId('word').parentElement;
    expect(display()?.style.getPropertyValue('--mark-color')).toBe('#3B2E27');
    press('Settings');
    fireEvent.change(screen.getByLabelText('Mark colour'), { target: { value: '#112233' } });
    press('Apply');
    expect(display()?.style.getPropertyValue('--mark-color')).toBe('#112233');
  });

  test('the word is shown at the font size of the transcript', () => {
    const { store } = startReading();
    const id = store.getSnapshot().transcripts[0]?.id ?? -1;
    act(() => {
      store.setFontSize(id, 64);
    });
    expect(screen.getByTestId('word').parentElement?.style.getPropertyValue('--size')).toBe('64px');
  });
});

describe('the surrounding-words line', () => {
  function startReading() {
    renderPage();
    addTranscript('Notes');
    paste('a b c d e f g h');
    press('Start reading');
  }

  function switchOn(): void {
    press('Settings');
    fireEvent.click(screen.getByLabelText('Show surrounding words'));
    press('Apply');
  }

  test('it is off until switched on', () => {
    startReading();
    expect(screen.queryByTestId('context')).toBeNull();
  });

  test('on, it shows the word, and the words after it, and stays when paused', () => {
    startReading();
    switchOn();
    const line = screen.getByTestId('context');
    expect(Array.from(line.children).map((part) => part.textContent)).toEqual(['', 'a', 'b c']);
    press('Pause');
    expect(screen.getByTestId('context')).toBeInTheDocument();
  });

  test('it moves on with the word', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ skip_word_count: 3 }));
    startReading();
    switchOn();
    press('Pause');
    press('Forward 3 words');
    expect(word()).toBe('d');
    const parts = Array.from(screen.getByTestId('context').children).map(
      (part) => part.textContent,
    );
    expect(parts).toEqual(['c', 'd', 'e f']);
  });

  test('it is the font colour dimmed toward the background', () => {
    startReading();
    switchOn();
    const display = screen.getByTestId('word').parentElement;
    expect(display?.style.getPropertyValue('--context-color')).toBe(
      blendColors('#3B2E27', '#F6EFE3', 0.55),
    );
  });

  test('switching it off takes it away', () => {
    startReading();
    switchOn();
    press('Settings');
    fireEvent.click(screen.getByLabelText('Show surrounding words'));
    press('Apply');
    expect(screen.queryByTestId('context')).toBeNull();
  });
});

describe('the position slider', () => {
  function startReading(text = 'a b c d e f g h') {
    const page = renderPage();
    addTranscript('Notes');
    paste(text);
    press('Start reading');
    return page;
  }

  const slider = () => screen.getByRole('slider', { name: 'Position' });

  function drag(to: number): void {
    fireEvent.change(slider(), { target: { value: String(to) } });
  }

  test('it reads "word X of Y" and rests on the word being read', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ skip_word_count: 3 }));
    startReading();
    expect(screen.getByText('word 1 of 8')).toBeInTheDocument();
    expect(slider()).toHaveAttribute('max', '7');
    press('Pause');
    press('Forward 3 words');
    expect(screen.getByText('word 4 of 8')).toBeInTheDocument();
    expect(slider()).toHaveValue('3');
  });

  test('moving it goes to that word and holds reading while it moves', () => {
    startReading();
    drag(5);
    expect(word()).toBe('f');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByText('word 6 of 8')).toBeInTheDocument();
  });

  test('letting go leaves it paused, and saves that', () => {
    const { store } = startReading();
    drag(5);
    fireEvent.keyUp(slider(), { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(store.getSnapshot().transcripts[0]?.isPaused).toBe(true);
    expect(store.getSnapshot().transcripts[0]?.position).toBe(5);
  });

  test('with "stay paused" off, letting go reads on from that word', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ scrub_pause_enabled: false }));
    const { store } = startReading();
    drag(5);
    fireEvent.pointerUp(slider());
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(store.getSnapshot().transcripts[0]?.isPaused).toBe(false);
  });

  test('keys alone: arrow presses move it a word at a time, and a stray key-up does nothing', () => {
    startReading();
    press('Pause');
    fireEvent.keyUp(slider(), { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    drag(1);
    drag(2);
    fireEvent.keyUp(slider(), { key: 'ArrowRight' });
    expect(word()).toBe('c');
  });

  test('there is a tick for each bookmark, under the spot the thumb rests at', () => {
    const { store } = startReading();
    expect(screen.queryAllByTestId('bookmark-tick')).toHaveLength(0);
    const id = store.getSnapshot().transcripts[0]?.id ?? -1;
    act(() => {
      store.addBookmark(id, 7, 'h');
      store.addBookmark(id, 0, 'a');
    });
    const ticks = screen.getAllByTestId('bookmark-tick');
    expect(ticks.map((tick) => tick.style.getPropertyValue('--fraction'))).toEqual(['0', '1']);
    act(() => {
      store.addBookmark(id, 3, 'd');
    });
    expect(
      screen
        .getAllByTestId('bookmark-tick')
        .map((tick) => tick.style.getPropertyValue('--fraction')),
    ).toEqual(['0', String(3 / 7), '1']);
  });

  test('one word has nothing to move', () => {
    startReading('alone');
    expect(slider()).toBeDisabled();
  });
});

describe('bookmarks', () => {
  function startReading() {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ skip_word_count: 3 }));
    const page = renderPage();
    addTranscript('Notes');
    paste('a b c d e f g h');
    press('Start reading');
    press('Pause');
    return page;
  }

  const saved = (store: { getSnapshot(): Library }) =>
    store.getSnapshot().transcripts[0]?.bookmarks ?? [];

  test('the list starts empty', () => {
    startReading();
    press('Bookmarks');
    expect(screen.getByText('No bookmarks yet.')).toBeInTheDocument();
  });

  test('one is added at the current word, and removed again there', () => {
    const { store } = startReading();
    press('Forward 3 words');
    press('Bookmarks');
    press('Add bookmark here');
    expect(saved(store).map((bookmark) => bookmark.index)).toEqual([3]);
    expect(screen.getByRole('button', { name: /^Go to .*, word 4 of 8$/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('bookmark-tick')).toHaveLength(1);
    press('Remove bookmark here');
    expect(saved(store)).toEqual([]);
    expect(screen.queryAllByTestId('bookmark-tick')).toHaveLength(0);
  });

  test('picking one goes to its word, paused, and closes the list', () => {
    const { store } = startReading();
    const id = store.getSnapshot().transcripts[0]?.id ?? -1;
    act(() => {
      store.addBookmark(id, 5, 'f g h');
    });
    press('Play');
    press('Bookmarks');
    press('Go to f g h, word 6 of 8');
    expect(word()).toBe('f');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(store.getSnapshot().transcripts[0]?.isPaused).toBe(true);
  });

  test('one is given a name, and an empty name brings the snippet back', () => {
    const { store } = startReading();
    const id = store.getSnapshot().transcripts[0]?.id ?? -1;
    act(() => {
      store.addBookmark(id, 2, 'c d e');
    });
    press('Bookmarks');
    press('Rename c d e');
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '  The good part ' } });
    fireEvent.submit(input);
    expect(saved(store)[0]?.label).toBe('The good part');
    expect(
      screen.getByRole('button', { name: 'Go to The good part, word 3 of 8' }),
    ).toBeInTheDocument();
    press('Rename The good part');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('textbox'));
    expect(saved(store)[0]?.label).toBe('');
    expect(screen.getByRole('button', { name: 'Go to c d e, word 3 of 8' })).toBeInTheDocument();
  });

  test('Escape while naming gives up the name only, not the list', () => {
    const { store } = startReading();
    const id = store.getSnapshot().transcripts[0]?.id ?? -1;
    act(() => {
      store.addBookmark(id, 2, 'c d e');
    });
    press('Bookmarks');
    press('Rename c d e');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'never' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(saved(store)[0]?.label).toBe('');
  });

  test('one is deleted from the list', () => {
    const { store } = startReading();
    const id = store.getSnapshot().transcripts[0]?.id ?? -1;
    act(() => {
      store.addBookmark(id, 2, 'c d e');
      store.addBookmark(id, 6, 'g h');
    });
    press('Bookmarks');
    press('Delete c d e');
    expect(saved(store).map((bookmark) => bookmark.index)).toEqual([6]);
  });

  test('at the end there is no word to bookmark', () => {
    const page = startReading();
    press('Play');
    wait(page, WORD_MS * 8);
    expect(screen.getByText('End of the text.')).toBeVisible();
    press('Bookmarks');
    expect(screen.getByRole('button', { name: 'Add bookmark here' })).toBeDisabled();
  });
});

describe('chunking', () => {
  function startReading() {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ skip_word_count: 3 }));
    const page = renderPage();
    addTranscript('Notes');
    paste('a b c d e f g h');
    press('Start reading');
    press('Pause');
    return page;
  }

  const first = (store: { getSnapshot(): Library }) => store.getSnapshot().transcripts[0];

  // A button of the Chunking window, which is open over Settings.
  function inChunking(name: string): void {
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Chunking' })).getByRole('button', { name }),
    );
  }

  function openChunking(): void {
    press('Settings');
    press('Configure chunking…');
  }

  test('Group flashes two words at once, and is saved with the transcript', () => {
    const { store } = startReading();
    expect(word()).toBe('a');
    fireEvent.click(screen.getByLabelText('Group'));
    expect(word()).toBe('a b');
    expect(first(store)?.chunkingEnabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Group'));
    expect(word()).toBe('a');
  });

  test('the size goes from 2 to 5 and no further, and is kept while Group is off', () => {
    const { store } = startReading();
    expect(screen.getByRole('button', { name: 'Fewer words per group' })).toBeDisabled();
    press('More words per group');
    expect(first(store)?.chunkSize).toBe(3);
    expect(word()).toBe('a');
    fireEvent.click(screen.getByLabelText('Group'));
    expect(word()).toBe('a b c');
    press('More words per group');
    press('More words per group');
    expect(word()).toBe('a b c d e');
    expect(screen.getByRole('button', { name: 'More words per group' })).toBeDisabled();
  });

  test('grouping keeps the word being read and snaps to the start of its group', () => {
    startReading();
    press('Forward 3 words');
    expect(word()).toBe('d');
    fireEvent.click(screen.getByLabelText('Group'));
    expect(word()).toBe('c d');
    expect(screen.getByText('word 3 of 8')).toBeInTheDocument();
  });

  test('a transcript that has chunking on is read in groups from the start', () => {
    renderPage({
      ...EMPTY_LIBRARY,
      nextId: 2,
      transcripts: [
        {
          ...TRANSCRIPT_DEFAULTS,
          id: 1,
          title: 'Grouped',
          space: 'General',
          rawText: 'a b c d e f g h',
          isStopped: true,
          chunkingEnabled: true,
          chunkSize: 3,
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grouped' }));
    press('Start reading');
    expect(word()).toBe('a b c');
  });

  test('the Chunking window changes this transcript only on Apply, and at once', () => {
    const { store } = startReading();
    openChunking();
    expect(screen.getByLabelText('This transcript')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Group words together'));
    fireEvent.change(screen.getByLabelText('Group size'), { target: { value: 'adaptive' } });
    fireEvent.change(screen.getByRole('slider', { name: /Group width/ }), {
      target: { value: '15' },
    });
    expect(first(store)?.chunkingEnabled).toBe(false);
    inChunking('Apply');
    expect(screen.getByText('Applied to this transcript.')).toBeInTheDocument();
    expect(first(store)).toMatchObject({
      chunkingEnabled: true,
      chunkMode: 'adaptive',
      chunkCharTarget: 15,
    });
    // Adaptive: up to 15 characters, and never more than 6 words.
    expect(word()).toBe('a b c d e f');
  });

  test('applied to new transcripts, it leaves the open one alone and seeds the next', () => {
    const { store } = startReading();
    openChunking();
    fireEvent.click(screen.getByLabelText('New transcripts'));
    fireEvent.click(screen.getByLabelText('Group words together'));
    fireEvent.change(screen.getByRole('slider', { name: /Words per group/ }), {
      target: { value: '4' },
    });
    inChunking('Apply');
    expect(screen.getByText('Applied to new transcripts.')).toBeInTheDocument();
    expect(first(store)?.chunkingEnabled).toBe(false);
    expect(window.localStorage.getItem(SETTINGS_KEY)).toContain('"default_chunk_size":4');
    inChunking('Close');
    press('Close');
    addTranscript('Later');
    const later = store.getSnapshot().transcripts.find((t) => t.title === 'Later');
    expect(later).toMatchObject({ chunkingEnabled: true, chunkSize: 4 });
  });

  test('switching the target shows what that target holds', () => {
    startReading();
    fireEvent.click(screen.getByLabelText('Group'));
    openChunking();
    expect(screen.getByLabelText('Group words together')).toBeChecked();
    fireEvent.click(screen.getByLabelText('New transcripts'));
    expect(screen.getByLabelText('Group words together')).not.toBeChecked();
  });

  test('with no transcript open it sets the defaults only', () => {
    renderPage();
    openChunking();
    expect(screen.queryByLabelText('This transcript')).toBeNull();
    expect(screen.getByLabelText('New transcripts')).toBeChecked();
  });
});

describe('keyboard shortcuts', () => {
  function startReading() {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ skip_word_count: 3 }));
    const page = renderPage();
    addTranscript('Notes');
    paste('a b c d e f g h');
    press('Start reading');
    return page;
  }

  function key(name: string, target: Element = document.body, more: KeyboardEventInit = {}) {
    return fireEvent.keyDown(target, { key: name, ...more });
  }

  test('Space pauses and plays, and the choice is saved', () => {
    const { store } = startReading();
    key(' ');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(store.getSnapshot().transcripts[0]?.isPaused).toBe(true);
    key(' ');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(store.getSnapshot().transcripts[0]?.isPaused).toBe(false);
  });

  test('the arrows skip by the number of words set in Settings', () => {
    startReading();
    key(' ');
    key('ArrowRight');
    expect(word()).toBe('d');
    key('ArrowRight');
    expect(word()).toBe('g');
    key('ArrowLeft');
    expect(word()).toBe('d');
  });

  test('R starts again and B bookmarks the word, then takes it off', () => {
    const { store } = startReading();
    key(' ');
    key('ArrowRight');
    key('b');
    expect(store.getSnapshot().transcripts[0]?.bookmarks.map((b) => b.index)).toEqual([3]);
    key('B');
    expect(store.getSnapshot().transcripts[0]?.bookmarks).toEqual([]);
    key('r');
    expect(word()).toBe('a');
  });

  test('Escape stops reading and shows the text again', () => {
    const { store } = startReading();
    key('Escape');
    expect(screen.getByLabelText('Transcript text')).toHaveValue('a b c d e f g h');
    expect(store.getSnapshot().transcripts[0]?.isStopped).toBe(true);
  });

  test('a used key does nothing else, an unused one is left alone', () => {
    startReading();
    expect(key(' ')).toBe(false); // preventDefault was called
    expect(key('a')).toBe(true);
  });

  test("with Ctrl held the key is the browser's", () => {
    startReading();
    key(' ');
    key('ArrowRight');
    expect(key('r', document.body, { ctrlKey: true })).toBe(true);
    expect(word()).toBe('d');
  });

  test('Space on a focused button presses that button only', () => {
    startReading();
    // The key goes to the Restart button: reading is not paused by it.
    key(' ', screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  test("the arrows on the position slider are the slider's", () => {
    startReading();
    key(' ');
    key('ArrowRight', screen.getByRole('slider', { name: 'Position' }));
    expect(word()).toBe('a');
  });

  test('nothing fires while the text is being typed', () => {
    renderPage();
    addTranscript('Notes');
    const box = screen.getByLabelText('Transcript text');
    expect(key(' ', box)).toBe(true);
    expect(key('r', box)).toBe(true);
  });

  test('nothing fires behind an open dialog, and Escape closes the dialog only', () => {
    startReading();
    press('Settings');
    key(' ');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    key('Escape');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('word')).toBeInTheDocument();
  });

  test('a held Space does not flicker between play and pause', () => {
    startReading();
    key(' ');
    key(' ', document.body, { repeat: true });
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });
});

describe('the word size', () => {
  function startReading() {
    const page = renderPage();
    addTranscript('Notes');
    paste('a b c d e f g h');
    press('Start reading');
    return page;
  }

  const size = () => screen.getByTestId('word').parentElement?.style.getPropertyValue('--size');

  test('the stepper changes it by the step from Settings and saves it', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ font_size_step: 4 }));
    const { store } = startReading();
    expect(screen.getByLabelText('Word size')).toHaveTextContent('32px');
    press('Larger words');
    expect(store.getSnapshot().transcripts[0]?.fontSize).toBe(36);
    expect(size()).toBe('36px');
    press('Smaller words');
    press('Smaller words');
    expect(store.getSnapshot().transcripts[0]?.fontSize).toBe(28);
  });

  test('it stops at 16 and at 96', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ font_size_step: 10 }));
    const { store } = startReading();
    press('Smaller words');
    press('Smaller words');
    expect(store.getSnapshot().transcripts[0]?.fontSize).toBe(16);
    expect(screen.getByRole('button', { name: 'Smaller words' })).toBeDisabled();
    for (let step = 0; step < 8; step += 1) press('Larger words');
    expect(store.getSnapshot().transcripts[0]?.fontSize).toBe(96);
    expect(screen.getByRole('button', { name: 'Larger words' })).toBeDisabled();
  });
});

describe('fitting a wide flash', () => {
  // jsdom measures nothing, so the widths are handed to it here: every
  // character is half the font size wide, and the row is 300 px.
  function measuring(rowWidth: number) {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(rowWidth);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const px = Number.parseFloat(this.style.fontSize || '0');
      return { width: (this.textContent.length * px) / 2 } as DOMRect;
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const size = () => screen.getByTestId('word').parentElement?.style.getPropertyValue('--size');

  function read(text: string) {
    const page = renderPage();
    addTranscript('Notes');
    paste(text);
    press('Start reading');
    return page;
  }

  test('a transcript whose widest word fits is drawn at the chosen size', () => {
    measuring(300);
    read('a bb ccc');
    expect(size()).toBe('32px');
  });

  test('one long word makes the whole transcript smaller, the saved size stays', () => {
    measuring(300);
    // "abcdefghijklmnopqrstuvwxyz": the focus letter is early, so 20 or so
    // characters trail it. Wider than the row at 32 px.
    const { store } = read('a abcdefghijklmnopqrstuvwxyz b');
    const drawn = Number.parseFloat(size() ?? '0');
    expect(drawn).toBeLessThan(32);
    expect(drawn).toBeGreaterThanOrEqual(19);
    expect(store.getSnapshot().transcripts[0]?.fontSize).toBe(32);
    expect(screen.getByLabelText('Word size')).toHaveTextContent('32px');
  });

  test('it is one size for the session, not one per word', () => {
    measuring(300);
    read('a abcdefghijklmnopqrstuvwxyz b');
    const first = size();
    press('Pause');
    press('Forward 10 words');
    expect(size()).toBe(first);
  });

  test('never under 60 percent of the chosen size', () => {
    measuring(60);
    read('a abcdefghijklmnopqrstuvwxyz b');
    expect(size()).toBe('19px');
  });

  test('grouping words is fitted again', () => {
    measuring(300);
    read('aaaa bbbb cccc dddd eeee ffff');
    expect(size()).toBe('32px');
    fireEvent.click(screen.getByLabelText('Group'));
    for (let step = 0; step < 3; step += 1) press('More words per group');
    expect(Number.parseFloat(size() ?? '0')).toBeLessThan(32);
    fireEvent.click(screen.getByLabelText('Group'));
    expect(size()).toBe('32px');
  });

  test('the guide marks and the surrounding words are sized from the fitted size', () => {
    measuring(60);
    read('a abcdefghijklmnopqrstuvwxyz b');
    const display = screen.getByTestId('word').parentElement;
    // 19 px: marks 35 percent is 6.65, so the 8 px minimum. Context is half, 9.5 to 10.
    expect(display?.style.getPropertyValue('--mark-length')).toBe('8px');
    expect(display?.style.getPropertyValue('--context-size')).toBe('10px');
  });
});

describe('the reading settings reach the reader', () => {
  function startReading(saved: Record<string, unknown>, text = 'a b c d e f g h') {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ skip_word_count: 3, ...saved }));
    const page = renderPage();
    addTranscript('Notes');
    paste(text);
    press('Start reading');
    return page;
  }

  test('with "pause when skipping" on, a skip pauses, and that is saved', () => {
    const { store } = startReading({ pause_on_skip: true });
    press('Forward 3 words');
    expect(word()).toBe('d');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(store.getSnapshot().transcripts[0]?.isPaused).toBe(true);
  });

  test('with it off, a skip keeps reading', () => {
    startReading({ pause_on_skip: false });
    press('Forward 3 words');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  test('with the rewind on, resuming steps back that many words first', () => {
    startReading({ resume_rewind_enabled: true, resume_rewind_words: 2 });
    press('Pause');
    press('Forward 3 words');
    expect(word()).toBe('d');
    press('Play');
    expect(word()).toBe('b');
  });

  test('with the rewind off, resuming goes on from the same word', () => {
    startReading({ resume_rewind_enabled: false, resume_rewind_words: 2 });
    press('Pause');
    press('Forward 3 words');
    press('Play');
    expect(word()).toBe('d');
  });

  test('the warm-up holds the first words longer', () => {
    const plain = startReading({ warm_up_enabled: false });
    wait(plain, WORD_MS);
    expect(word()).toBe('b');
    cleanup();
    window.localStorage.clear();
    const warm = startReading({ warm_up_enabled: true });
    wait(warm, WORD_MS);
    expect(word()).toBe('a');
  });

  test('length pacing holds a long word longer', () => {
    const text = 'extraordinarily b c';
    const plain = startReading({ length_pacing_enabled: false }, text);
    wait(plain, WORD_MS);
    expect(word()).toBe('b');
    cleanup();
    window.localStorage.clear();
    const paced = startReading({ length_pacing_enabled: true }, text);
    wait(paced, WORD_MS);
    expect(word()).toBe('extraordinarily');
  });
});

describe('the Settings window', () => {
  const saved = () =>
    JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;

  function startReading(more: Record<string, unknown> = {}) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ skip_word_count: 3, ...more }));
    const page = renderPage();
    addTranscript('Notes');
    paste('extraordinarily b c d e f g h');
    press('Start reading');
    return page;
  }

  test('nothing is saved until Apply, and closing drops the changes', () => {
    renderPage();
    press('Settings');
    fireEvent.click(screen.getByLabelText('Slow down for long words'));
    fireEvent.change(screen.getByRole('slider', { name: /Speed/ }), { target: { value: '450' } });
    expect(screen.getByText('450 WPM')).toBeInTheDocument();
    expect(saved().length_pacing_enabled).toBeUndefined();
    press('Close');
    press('Settings');
    expect(screen.getByLabelText('Slow down for long words')).not.toBeChecked();
    expect(screen.getByText('300 WPM')).toBeInTheDocument();
  });

  test('Apply saves everything and closes the window', () => {
    renderPage();
    press('Settings');
    fireEvent.click(screen.getByLabelText('Slow down for long words'));
    fireEvent.change(screen.getByRole('slider', { name: /Speed/ }), { target: { value: '450' } });
    fireEvent.change(screen.getByRole('textbox', { name: /each time \+\/- is clicked/ }), {
      target: { value: ' 7 ' },
    });
    press('Apply');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(saved()).toMatchObject({
      length_pacing_enabled: true,
      default_wpm: 450,
      font_size_step: 7,
    });
  });

  test('a setting applied while reading reaches the words on screen', () => {
    const page = startReading();
    press('Pause');
    press('Restart');
    press('Pause');
    press('Settings');
    fireEvent.click(screen.getByLabelText('Slow down for long words'));
    press('Apply');
    press('Play');
    wait(page, WORD_MS);
    // A long word is held longer now.
    expect(word()).toBe('extraordinarily');
  });

  test('a wrong number is named, the window stays open and nothing is saved', () => {
    renderPage();
    press('Settings');
    fireEvent.click(screen.getByLabelText('Slow down for long words'));
    const box = screen.getByRole('textbox', { name: /Thickness of the vertical guide marks/ });
    fireEvent.change(box, { target: { value: '9' } });
    press('Apply');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The guide mark thickness must be between 2 and 6.',
    );
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(saved().length_pacing_enabled).toBeUndefined();
    expect(box).toHaveFocus();
  });

  test('a wrong number hidden by a search, or on another tab, is shown again', () => {
    renderPage();
    press('Settings');
    fireEvent.change(screen.getByRole('textbox', { name: /Words to rewind on resume/ }), {
      target: { value: 'abc' },
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), {
      target: { value: 'surrounding' },
    });
    expect(screen.queryByRole('textbox', { name: /Words to rewind/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }));
    press('Apply');
    expect(screen.getByRole('searchbox', { name: 'Search settings' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /Words to rewind/ })).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Words to rewind on resume must be a whole number.',
    );
  });

  test('the search shows what it finds, and says when it finds nothing', () => {
    renderPage();
    press('Settings');
    const search = screen.getByRole('searchbox', { name: 'Search settings' });
    fireEvent.change(search, { target: { value: 'colour' } });
    expect(screen.getAllByTestId(/^setting-/).map((entry) => entry.dataset.testid)).toEqual([
      'setting-fontColor',
      'setting-highlightColor',
      'setting-backgroundColor',
      'setting-guideMarkColor',
    ]);
    expect(screen.getByText('Clear the search to show the reset button.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'bearings' } });
    expect(screen.getByText('No settings match your search.')).toBeInTheDocument();
    press('Descriptions');
    expect(screen.getAllByTestId(/^setting-/).map((entry) => entry.dataset.testid)).toEqual([
      'setting-scrubPause',
    ]);
  });

  test('the skip settings are saved at once, without Apply', () => {
    renderPage();
    press('Settings');
    fireEvent.change(screen.getByRole('slider', { name: /Skip amount/ }), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByLabelText('Pause playback when skipping'));
    expect(saved()).toMatchObject({ skip_word_count: 7, pause_on_skip: true });
    press('Close');
    press('Settings');
    expect(screen.getByText('7 words')).toBeInTheDocument();
  });

  test('Reset puts the original values in the window, and saves them on Apply', () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ default_wpm: 600, warm_up_enabled: true, skip_word_count: 9 }),
    );
    renderPage();
    press('Settings');
    press('Reset to Original Defaults');
    expect(screen.getByText('300 WPM')).toBeInTheDocument();
    expect(screen.getByLabelText('Ease in at the start of reading')).not.toBeChecked();
    // The skip amount is saved straight away, the rest waits for Apply.
    expect(saved()).toMatchObject({ skip_word_count: 10, default_wpm: 600 });
    press('Apply');
    expect(saved()).toMatchObject({ default_wpm: 300, warm_up_enabled: false });
  });

  test('Reset in Dark gives the guide marks the original colour as a colour picked by hand', () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ appearance_mode: 'dark' }));
    renderPage();
    expect(saved().guide_mark_color).toBe('#F2E8DC');
    press('Settings');
    press('Reset to Original Defaults');
    press('Apply');
    // As on the desktop: the reset colour differs from the dark one, so it
    // no longer follows the theme.
    expect(saved()).toMatchObject({
      guide_mark_color: '#3B2E27',
      guide_mark_color_is_default: false,
    });
  });

  test('the Chunking window opens over Settings, and Escape closes only it', () => {
    renderPage();
    press('Settings');
    press('Configure chunking…');
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });

  test('the theme is on its own tab and waits for Apply too', () => {
    renderPage();
    openSettings('Appearance');
    fireEvent.change(screen.getByLabelText('Colour theme'), { target: { value: 'dark' } });
    expect(document.documentElement.dataset.theme).toBe('light');
    press('Apply');
    expect(document.documentElement.dataset.theme).toBe('dark');
    delete document.documentElement.dataset.theme;
  });
});

// ---- test_normalize_in_app.py ----
// The desktop's tests click the real button in the real app, with tkinter,
// so they cannot be replayed. They are written again here under the same
// names. The web keeps one text per transcript, where the desktop keeps a
// text and a draft, so the draft checks become checks of the text.
describe('test_normalize_in_app.py', () => {
  const WRAPPED =
    'The meeting started late\nbecause the speaker was\nstuck in traffic.\n\nSecond paragraph here.';
  const NORMALIZED =
    'The meeting started late because the speaker was stuck in traffic.\n\nSecond paragraph here.';
  const CLEAN = 'Nothing in here needs tidying.';

  function two(more: Partial<Library['transcripts'][number]> = {}) {
    const page = renderPage({
      ...EMPTY_LIBRARY,
      nextId: 3,
      transcripts: [
        {
          ...TRANSCRIPT_DEFAULTS,
          ...LIGHT_READING,
          id: 1,
          title: 'Lecture',
          space: 'General',
          rawText: WRAPPED,
          isStopped: true,
          ...more,
        },
        {
          ...TRANSCRIPT_DEFAULTS,
          ...LIGHT_READING,
          id: 2,
          title: 'Other',
          space: 'General',
          rawText: CLEAN,
          isStopped: true,
        },
      ],
    });
    press('Lecture');
    return page;
  }

  const lecture = (page: Page) => page.store.getSnapshot().transcripts.find((t) => t.id === 1);
  const box = () => screen.getByLabelText('Transcript text');
  const icon = () =>
    screen.queryByRole('button', { name: 'Revert to the original text' }) ? 'Revert' : 'Normalize';
  function pressNormalize(): void {
    fireEvent.click(
      screen.getByRole('button', { name: /^(Normalize the text|Revert to the original text)$/ }),
    );
  }
  function type(text: string): void {
    fireEvent.change(box(), { target: { value: (box() as HTMLTextAreaElement).value + text } });
  }
  const undoInfo = (page: Page) => [lecture(page)?.preNormalizeText, lecture(page)?.normalizedText];

  test('test_normalizing_tidies_the_text_and_keeps_the_way_back', () => {
    const page = two();
    expect(icon()).toBe('Normalize');
    pressNormalize();
    expect(box()).toHaveValue(NORMALIZED);
    expect(icon()).toBe('Revert');
    expect(undoInfo(page)).toEqual([WRAPPED, NORMALIZED]);
    expect(lecture(page)?.rawText).toBe(NORMALIZED);
  });

  test('test_a_second_click_puts_the_original_back_and_forgets_it', () => {
    const page = two();
    pressNormalize();
    pressNormalize();
    expect(box()).toHaveValue(WRAPPED);
    expect(icon()).toBe('Normalize');
    expect(undoInfo(page)).toEqual(['', '']);
    expect(lecture(page)?.rawText).toBe(WRAPPED);
  });

  test('test_text_that_needs_no_tidying_is_left_alone_and_nothing_is_kept', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const page = two({ rawText: CLEAN });
      pressNormalize();
      expect(screen.getByText('Nothing to change')).toBeInTheDocument();
      expect(box()).toHaveValue(CLEAN);
      expect(icon()).toBe('Normalize');
      expect(undoInfo(page)).toEqual(['', '']);
      // The message goes after two seconds.
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.queryByText('Nothing to change')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test('test_normalizing_again_after_an_edit_goes_back_to_the_edited_text', () => {
    const page = two();
    pressNormalize();
    type('\nand a wrapped line\nthat was added later.');
    const edited = (box() as HTMLTextAreaElement).value;
    pressNormalize();
    const tidied = (box() as HTMLTextAreaElement).value;
    expect(tidied).not.toBe(edited);
    expect(undoInfo(page)).toEqual([edited, tidied]);
    pressNormalize();
    expect(box()).toHaveValue(edited);
  });

  test('test_revert_is_still_there_after_leaving_and_coming_back_with_the_text_as_it_was', () => {
    const page = two();
    pressNormalize();
    press('Other');
    expect(icon()).toBe('Normalize');
    expect(undoInfo(page)).toEqual([WRAPPED, NORMALIZED]);
    press('Lecture');
    expect(box()).toHaveValue(NORMALIZED);
    expect(icon()).toBe('Revert');
    pressNormalize();
    expect(box()).toHaveValue(WRAPPED);
  });

  test('test_spaces_and_blank_lines_added_at_the_end_dont_end_revert', () => {
    const page = two();
    pressNormalize();
    type('   \n\n  ');
    press('Other');
    press('Lecture');
    expect(undoInfo(page)).toEqual([WRAPPED, NORMALIZED]);
    expect(icon()).toBe('Revert');
  });

  test('test_an_edit_ends_revert_and_the_edit_is_kept', () => {
    const page = two();
    pressNormalize();
    type(' And one more thing.');
    expect(icon()).toBe('Normalize');
    press('Other');
    const edited = `${NORMALIZED} And one more thing.`;
    expect(undoInfo(page)).toEqual(['', '']);
    expect(lecture(page)?.rawText).toBe(edited);
    press('Lecture');
    expect(box()).toHaveValue(edited);
    expect(icon()).toBe('Normalize');
  });

  test('test_a_transcript_that_was_never_normalized_has_nothing_cleared', () => {
    const page = two();
    const cleared = vi.spyOn(page.store, 'setNormalization');
    type(' An edit.');
    press('Other');
    press('Lecture');
    expect(lecture(page)?.rawText).toBe(`${WRAPPED} An edit.`);
    expect(cleared).not.toHaveBeenCalled();
  });

  test('test_start_reading_ends_revert_and_saves_the_tidied_text', () => {
    const page = two();
    pressNormalize();
    press('Start reading');
    press('Stop reading');
    expect(lecture(page)?.rawText).toBe(NORMALIZED);
    expect(undoInfo(page)).toEqual(['', '']);
    expect(icon()).toBe('Normalize');
  });

  test('with "Split long paragraphs" on, a wall of prose is broken at sentence ends', () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ split_long_paragraphs_enabled: true }),
    );
    const wall = Array.from(
      { length: 12 },
      (_, i) => `This is sentence number ${i + 1} of a long wall.`,
    ).join(' ');
    two({ rawText: wall });
    pressNormalize();
    expect((box() as HTMLTextAreaElement).value).toContain('\n\n');
  });
});
