// The saving store: what it tells its listeners, and when it writes. The
// rules themselves are tested in src/core/library.test.ts.
import { describe, expect, test } from 'vitest';
import { EMPTY_LIBRARY, TRANSCRIPT_DEFAULTS, type Library } from '../core/models';
import type { Persistence, ReadResult } from './contract';
import { SavedLibraryStore, pythonUtcNow, type StoreClock } from './libraryStore';
import { MemoryPersistence } from './memoryPersistence';

/** A clock that only moves when a test moves it, with one list of timers. */
class TestClock implements StoreClock {
  time = 10_000;
  private timers: { at: number; callback: () => void }[] = [];

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, delayMs: number): unknown {
    const timer = { at: this.time + delayMs, callback };
    this.timers.push(timer);
    return timer;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((timer) => timer !== handle);
  }

  advance(ms: number): void {
    this.time += ms;
    const due = this.timers.filter((timer) => timer.at <= this.time);
    this.timers = this.timers.filter((timer) => timer.at > this.time);
    for (const timer of due) timer.callback();
  }
}

function setUp(library: Library = EMPTY_LIBRARY) {
  const persistence = new MemoryPersistence<Library>();
  const clock = new TestClock();
  const store = SavedLibraryStore.ready(persistence, library, clock);
  let told = 0;
  store.subscribe(() => {
    told += 1;
  });
  return { persistence, clock, store, told: () => told };
}

const ONE: Library = {
  ...EMPTY_LIBRARY,
  nextId: 2,
  transcripts: [{ ...TRANSCRIPT_DEFAULTS, id: 1, title: 'One', space: 'General' }],
};

describe('loading', () => {
  test('nothing saved yet starts empty and ready', async () => {
    const store = new SavedLibraryStore(new MemoryPersistence<Library>());
    expect(store.isReady()).toBe(false);
    await store.load();
    expect(store.isReady()).toBe(true);
    expect(store.getSnapshot()).toEqual(EMPTY_LIBRARY);
    expect(store.damagedNotice()).toBeNull();
  });

  test('a saved library comes back', async () => {
    const store = new SavedLibraryStore(new MemoryPersistence<Library>({ kind: 'ok', value: ONE }));
    await store.load();
    expect(store.getSnapshot()).toEqual(ONE);
  });

  test('loading twice reads once and tells the listeners once', async () => {
    let reads = 0;
    const persistence: Persistence<Library> = {
      read: () => {
        reads += 1;
        return Promise.resolve<ReadResult<Library>>({ kind: 'missing' });
      },
      write: () => Promise.resolve(),
    };
    const store = new SavedLibraryStore(persistence);
    let told = 0;
    store.subscribe(() => {
      told += 1;
    });
    await Promise.all([store.load(), store.load()]);
    expect(reads).toBe(1);
    expect(told).toBe(1);
  });

  test('nothing can be changed before the saved library is read', () => {
    const persistence = new MemoryPersistence<Library>();
    const store = new SavedLibraryStore(persistence);
    store.addSpace('Work');
    expect(store.getSnapshot()).toBe(EMPTY_LIBRARY);
    expect(persistence.writes).toEqual([]);
  });

  test('a library with no Spaces, or an open Space past the end, is tidied', async () => {
    const odd: Library = { ...ONE, spaces: [], currentSpaceIndex: 4 };
    const store = new SavedLibraryStore(new MemoryPersistence<Library>({ kind: 'ok', value: odd }));
    await store.load();
    expect(store.getSnapshot().spaces).toEqual(['General']);
    expect(store.getSnapshot().currentSpaceIndex).toBe(0);
  });

  test('a damaged save starts empty and says where the copy is, once', async () => {
    const store = new SavedLibraryStore(
      new MemoryPersistence<Library>({
        kind: 'damaged',
        keptAs: 'library.damaged-20261116-101500',
      }),
    );
    await store.load();
    expect(store.getSnapshot()).toEqual(EMPTY_LIBRARY);
    expect(store.damagedNotice()).toContain('library.damaged-20261116-101500');
    store.clearDamagedNotice();
    expect(store.damagedNotice()).toBeNull();
  });

  test('a damaged save whose copy failed says so', async () => {
    const store = new SavedLibraryStore(
      new MemoryPersistence<Library>({ kind: 'damaged', keptAs: null }),
    );
    await store.load();
    expect(store.damagedNotice()).toContain('could not be kept');
  });

  test('a browser that will not open its storage still gives a working store', async () => {
    const persistence: Persistence<Library> = {
      read: () => Promise.reject(new Error('no storage')),
      write: () => Promise.reject(new Error('no storage')),
    };
    const store = new SavedLibraryStore(persistence);
    await store.load();
    expect(store.isReady()).toBe(true);
    expect(store.saveProblem()).toContain('not letting the app save');
    store.addSpace('Work');
    expect(store.getSnapshot().spaces).toEqual(['General', 'Work']);
  });
});

describe('changing', () => {
  test('a change tells the listeners and is written at once', async () => {
    const { store, persistence, told } = setUp();
    expect(store.addSpace('Work')).toBe('Work');
    expect(told()).toBe(1);
    await store.flush();
    expect(persistence.writes).toHaveLength(1);
    expect(persistence.writes[0]?.spaces).toEqual(['General', 'Work']);
  });

  test('a refused change tells nobody and writes nothing', async () => {
    const { store, persistence, told } = setUp();
    expect(store.addSpace('General')).toBe('General');
    expect(store.renameSpace('Gone', 'X')).toBe(false);
    expect(store.deleteSpace('General')).toBe(false);
    store.deleteTranscript(9);
    await store.flush();
    expect(told()).toBe(0);
    expect(persistence.writes).toEqual([]);
  });

  test('the snapshot is a new object after a change and the same one otherwise', () => {
    const { store } = setUp(ONE);
    const before = store.getSnapshot();
    store.setTitle(9, 'x');
    expect(store.getSnapshot()).toBe(before);
    store.setTitle(1, 'New');
    expect(store.getSnapshot()).not.toBe(before);
  });

  test('a new transcript is given back with its id', () => {
    const { store } = setUp(ONE);
    const added = store.addTranscript({ title: 'Two', space: 'General', wpm: 450 });
    expect(added).toMatchObject({ id: 2, title: 'Two', wpm: 450 });
    expect(store.getSnapshot().nextId).toBe(3);
  });

  test('renaming and deleting a Space answer whether it happened', () => {
    const { store } = setUp(ONE);
    store.addSpace('Work');
    expect(store.renameSpace('Work', 'Office')).toBe(true);
    expect(store.deleteSpace('General')).toBe(false); // it holds a transcript
    expect(store.deleteSpace('Office')).toBe(true);
  });

  test('a bookmark is stamped with the time the desktop way', () => {
    const { store, clock } = setUp(ONE);
    clock.time = Date.UTC(2026, 10, 16, 15, 26, 1, 123);
    store.addBookmark(1, 4, 'words');
    expect(store.getSnapshot().transcripts[0]?.bookmarks).toEqual([
      { index: 4, snippet: 'words', createdAt: '2026-11-16T15:26:01.123000+00:00', label: '' },
    ]);
    expect(pythonUtcNow(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe(
      '2026-01-02T03:04:05.000000+00:00',
    );
  });

  test('an import replaces or adds', () => {
    const { store } = setUp(ONE);
    store.mergeAll(ONE);
    expect(store.getSnapshot().transcripts.map((t) => t.id)).toEqual([1, 2]);
    store.replaceAll(EMPTY_LIBRARY);
    expect(store.getSnapshot()).toEqual(EMPTY_LIBRARY);
  });
});

describe('saving the position and the speed', () => {
  test('the first one is written at once, the next ones at most once a second', async () => {
    const { store, persistence, clock } = setUp(ONE);
    store.setPosition(1, 1);
    await store.flush();
    expect(persistence.writes).toHaveLength(1);

    store.setPosition(1, 2);
    clock.advance(300);
    store.setPosition(1, 3);
    store.setWpm(1, 450);
    expect(persistence.writes).toHaveLength(1);
    expect(store.getSnapshot().transcripts[0]?.position).toBe(3); // memory is always current

    clock.advance(700); // the second is up
    await Promise.resolve();
    expect(persistence.writes).toHaveLength(2);
    expect(persistence.writes[1]?.transcripts[0]).toMatchObject({ position: 3, wpm: 450 });
  });

  test('a held-back change is written without waiting for another change', async () => {
    const { store, persistence, clock } = setUp(ONE);
    store.setPosition(1, 1);
    store.setPosition(1, 2);
    clock.advance(1000);
    await Promise.resolve();
    expect(persistence.writes.at(-1)?.transcripts[0]?.position).toBe(2);
  });

  test('flush writes a held-back change now', async () => {
    const { store, persistence } = setUp(ONE);
    store.setPosition(1, 1);
    store.setPosition(1, 2);
    await store.flush();
    expect(persistence.writes.at(-1)?.transcripts[0]?.position).toBe(2);
    // And the timer that was waiting has nothing left to write.
    const writes = persistence.writes.length;
    await store.flush();
    expect(persistence.writes).toHaveLength(writes);
  });

  test('any other change writes the held-back one with it', async () => {
    const { store, persistence } = setUp(ONE);
    store.setPosition(1, 1);
    store.setPosition(1, 2);
    store.setTitle(1, 'New');
    await store.flush();
    expect(persistence.writes.at(-1)?.transcripts[0]).toMatchObject({ position: 2, title: 'New' });
  });

  test('an unchanged position or speed writes nothing', async () => {
    const { store, persistence, told } = setUp(ONE);
    store.setPosition(1, 0);
    store.setWpm(1, 300);
    await store.flush();
    expect(told()).toBe(0);
    expect(persistence.writes).toEqual([]);
  });
});

describe('writing', () => {
  /** A persistence whose writes finish only when the test says so. */
  function slow() {
    const written: Library[] = [];
    const waiting: (() => void)[] = [];
    let fail = false;
    const persistence: Persistence<Library> = {
      read: () => Promise.resolve<ReadResult<Library>>({ kind: 'missing' }),
      write: (library) =>
        new Promise<void>((resolve, reject) => {
          waiting.push(() => {
            if (fail) {
              reject(new Error('full'));
            } else {
              written.push(library);
              resolve();
            }
          });
        }),
    };
    return {
      persistence,
      written,
      finishOne: async () => {
        waiting.shift()?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
      failFromNow: (value: boolean) => {
        fail = value;
      },
    };
  }

  test('writes go one at a time, and only the newest waiting one is written', async () => {
    const { persistence, written, finishOne } = slow();
    const store = SavedLibraryStore.ready(persistence, ONE);
    store.setTitle(1, 'a');
    store.setTitle(1, 'b');
    store.setTitle(1, 'c');
    await finishOne();
    expect(written.map((library) => library.transcripts[0]?.title)).toEqual(['a']);
    await finishOne();
    expect(written.map((library) => library.transcripts[0]?.title)).toEqual(['a', 'c']);
    await store.flush();
  });

  test('flush waits for the write to finish', async () => {
    const { persistence, written, finishOne } = slow();
    const store = SavedLibraryStore.ready(persistence, ONE);
    store.setTitle(1, 'a');
    let flushed = false;
    void store.flush().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);
    await finishOne();
    expect(flushed).toBe(true);
    expect(written).toHaveLength(1);
  });

  test('a write that fails is reported, and cleared by the next one that works', async () => {
    const { persistence, finishOne, failFromNow } = slow();
    const store = SavedLibraryStore.ready(persistence, ONE);
    failFromNow(true);
    store.setTitle(1, 'a');
    await finishOne();
    expect(store.saveProblem()).toContain('could not be saved');
    expect(store.getSnapshot().transcripts[0]?.title).toBe('a'); // still in memory
    failFromNow(false);
    store.setTitle(1, 'b');
    await finishOne();
    expect(store.saveProblem()).toBeNull();
  });
});
