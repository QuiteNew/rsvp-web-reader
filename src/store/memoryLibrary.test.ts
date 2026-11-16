// The rules of the stand-in library, as read from the desktop app's
// core/transcript_store.py. Golden fixtures for them come in phase 3.

import { describe, expect, test } from 'vitest';

import { currentSpace, MemoryLibraryStore } from './memoryLibrary';

function names(store: MemoryLibraryStore): readonly string[] {
  return store.getSnapshot().spaces;
}

describe('spaces', () => {
  test('a new library has the General Space and nothing in it', () => {
    const store = new MemoryLibraryStore();
    expect(names(store)).toEqual(['General']);
    expect(currentSpace(store.getSnapshot())).toBe('General');
    expect(store.getSnapshot().transcripts).toEqual([]);
  });

  test('adding a Space trims the name and switches to it', () => {
    const store = new MemoryLibraryStore();
    expect(store.addSpace('  Work  ')).toBe('Work');
    expect(names(store)).toEqual(['General', 'Work']);
    expect(currentSpace(store.getSnapshot())).toBe('Work');
  });

  test('an empty or taken name adds nothing and stays where it was', () => {
    const store = new MemoryLibraryStore();
    store.addSpace('Work');
    store.switchToSpace('General');
    expect(store.addSpace('   ')).toBe('General');
    expect(store.addSpace('Work')).toBe('General');
    expect(names(store)).toEqual(['General', 'Work']);
  });

  test('switching to a Space that does not exist does nothing', () => {
    const store = new MemoryLibraryStore();
    expect(store.switchToSpace('Nowhere')).toBe('General');
  });

  test('renaming a Space moves its transcripts along', () => {
    const store = new MemoryLibraryStore();
    const transcript = store.addTranscript({ title: 'A', space: 'General' });
    expect(store.renameSpace('General', ' Home ')).toBe(true);
    expect(names(store)).toEqual(['Home']);
    expect(store.getSnapshot().transcripts[0]).toMatchObject({ id: transcript.id, space: 'Home' });
    expect(currentSpace(store.getSnapshot())).toBe('Home');
  });

  test('a rename is refused for a missing, empty, same or taken name', () => {
    const store = new MemoryLibraryStore();
    store.addSpace('Work');
    expect(store.renameSpace('Nowhere', 'X')).toBe(false);
    expect(store.renameSpace('Work', '  ')).toBe(false);
    expect(store.renameSpace('Work', 'Work')).toBe(false);
    expect(store.renameSpace('Work', 'General')).toBe(false);
    expect(names(store)).toEqual(['General', 'Work']);
  });

  test('only an empty Space can be deleted, and never the last one', () => {
    const store = new MemoryLibraryStore();
    expect(store.deleteSpace('General')).toBe(false);
    store.addSpace('Work');
    store.addTranscript({ title: 'A', space: 'Work' });
    expect(store.deleteSpace('Work')).toBe(false);
    expect(store.deleteSpace('General')).toBe(true);
    expect(names(store)).toEqual(['Work']);
  });

  test('deleting the current Space makes the first one current', () => {
    const store = new MemoryLibraryStore();
    store.addSpace('A');
    store.addSpace('B');
    expect(store.deleteSpace('B')).toBe(true);
    expect(currentSpace(store.getSnapshot())).toBe('General');
  });

  test('deleting another Space keeps the current one current', () => {
    const store = new MemoryLibraryStore();
    store.addSpace('A');
    store.addSpace('B');
    expect(store.deleteSpace('General')).toBe(true);
    expect(currentSpace(store.getSnapshot())).toBe('B');
  });
});

describe('transcripts', () => {
  test('a new transcript gets the defaults and the next id', () => {
    const store = new MemoryLibraryStore();
    const first = store.addTranscript({ title: 'A', space: 'General' });
    const second = store.addTranscript({ title: 'B', space: 'General', wpm: 450 });
    expect(first).toMatchObject({ id: 1, title: 'A', wpm: 300, position: 0, rawText: '' });
    expect(second).toMatchObject({ id: 2, wpm: 450 });
  });

  test('an id is never used again after a delete', () => {
    const store = new MemoryLibraryStore();
    const first = store.addTranscript({ title: 'A', space: 'General' });
    store.deleteTranscript(first.id);
    expect(store.addTranscript({ title: 'B', space: 'General' }).id).toBe(2);
    expect(store.getSnapshot().transcripts.map((transcript) => transcript.title)).toEqual(['B']);
  });

  test('the setters change one transcript and leave the others', () => {
    const store = new MemoryLibraryStore();
    const a = store.addTranscript({ title: 'A', space: 'General' });
    const b = store.addTranscript({ title: 'B', space: 'General' });
    store.setTitle(a.id, 'A2');
    store.setText(a.id, 'hello there');
    store.setPosition(a.id, 1);
    store.setWpm(a.id, 500);
    const [first, second] = store.getSnapshot().transcripts;
    expect(first).toMatchObject({ title: 'A2', rawText: 'hello there', position: 1, wpm: 500 });
    expect(second).toEqual(b);
  });

  test('an id that does not exist changes nothing and tells no one', () => {
    const store = new MemoryLibraryStore();
    const before = store.getSnapshot();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.setTitle(99, 'X');
    store.deleteTranscript(99);
    expect(store.getSnapshot()).toBe(before);
    expect(calls).toBe(0);
  });

  test('setting a value it already has changes nothing and tells no one', () => {
    const store = new MemoryLibraryStore();
    const a = store.addTranscript({ title: 'A', space: 'General' });
    const before = store.getSnapshot();
    store.setPosition(a.id, 0);
    store.setTitle(a.id, 'A');
    expect(store.getSnapshot()).toBe(before);
  });

  test('listeners hear a change and get a new snapshot', () => {
    const store = new MemoryLibraryStore();
    const before = store.getSnapshot();
    let calls = 0;
    const stop = store.subscribe(() => {
      calls += 1;
    });
    store.addSpace('Work');
    expect(calls).toBe(1);
    expect(store.getSnapshot()).not.toBe(before);
    stop();
    store.addSpace('Play');
    expect(calls).toBe(1);
  });
});
