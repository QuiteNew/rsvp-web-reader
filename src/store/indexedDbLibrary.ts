// The library saved in the browser's IndexedDB: one record that holds the
// whole library in the desktop's data.json shape. The layout is in
// schema.ts and the reasons are in docs/handoff/phase-3.md.
//
// This file talks to the browser, so the unit tests cannot run it. The
// browser tests in e2e/ do: they reload the page and look for the data.
import type { Library } from '../core/models';
import { parseData, toSavedData } from '../core/storageFormat';
import type { Persistence, ReadResult } from './contract';
import {
  DAMAGED_STORE,
  DATABASE_NAME,
  DATABASE_VERSION,
  LIBRARY_KEY,
  LIBRARY_RECORD_FORMAT,
  LIBRARY_STORE,
  type DamagedRecord,
  type LibraryRecord,
} from './schema';

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction was aborted'));
    };
  });
}

function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    // Version 1 makes both stores. A later version adds its own step here
    // and leaves these as they are.
    if (!database.objectStoreNames.contains(LIBRARY_STORE)) {
      database.createObjectStore(LIBRARY_STORE);
    }
    if (!database.objectStoreNames.contains(DAMAGED_STORE)) {
      database.createObjectStore(DAMAGED_STORE);
    }
  };
  return done(request);
}

/** "20261116-153012" for a local time, the stamp the desktop uses. */
export function damagedStamp(now: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}` +
    `-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`
  );
}

function readLibrary(found: unknown): Library | null {
  if (typeof found !== 'object' || found === null) return null;
  const record = found as Partial<LibraryRecord>;
  if (record.format !== LIBRARY_RECORD_FORMAT) return null;
  return parseData(record.data);
}

export class IndexedDbLibrary implements Persistence<Library> {
  private database: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.database ??= openDatabase();
    return this.database;
  }

  async read(): Promise<ReadResult<Library>> {
    const database = await this.open();
    const found: unknown = await done(
      database.transaction(LIBRARY_STORE).objectStore(LIBRARY_STORE).get(LIBRARY_KEY),
    );
    if (found === undefined) return { kind: 'missing' };
    const library = readLibrary(found);
    if (library !== null) return { kind: 'ok', value: library };
    return { kind: 'damaged', keptAs: await this.keepDamaged(database, found) };
  }

  async write(library: Library): Promise<void> {
    const database = await this.open();
    const record: LibraryRecord = {
      format: LIBRARY_RECORD_FORMAT,
      savedAt: new Date().toISOString(),
      data: toSavedData(library),
    };
    const transaction = database.transaction(LIBRARY_STORE, 'readwrite');
    transaction.objectStore(LIBRARY_STORE).put(record, LIBRARY_KEY);
    await finished(transaction);
  }

  /**
   * Copy a record that could not be read into the damaged store, before
   * anything is saved over it. Gives the key of the copy, or of an earlier
   * copy with the same content, or null if the copy could not be made.
   * Never throws, so a failed copy cannot stop the app from starting.
   */
  private async keepDamaged(database: IDBDatabase, found: unknown): Promise<string | null> {
    try {
      const content = JSON.stringify(found);
      const transaction = database.transaction(DAMAGED_STORE, 'readwrite');
      const store = transaction.objectStore(DAMAGED_STORE);
      const keys = (await done(store.getAllKeys())).map(String);
      const earlier = (await done(store.getAll())) as DamagedRecord[];
      const same = earlier.findIndex((record) => JSON.stringify(record.found) === content);
      if (same !== -1) return keys[same] ?? null;

      const now = new Date();
      const base = `library.damaged-${damagedStamp(now)}`;
      let key = base;
      for (let number = 2; keys.includes(key); number += 1) {
        key = `${base}-${number}`;
      }
      const record: DamagedRecord = { kind: 'library', keptAt: now.toISOString(), found };
      store.put(record, key);
      await finished(transaction);
      return key;
    } catch {
      return null;
    }
  }
}
