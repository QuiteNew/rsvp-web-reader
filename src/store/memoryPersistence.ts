// A Persistence that keeps its value in memory. For tests, and for a
// browser that will not let the app save.
import type { Persistence, ReadResult } from './contract';

export class MemoryPersistence<T> implements Persistence<T> {
  /** Every value written, oldest first. Tests look at this. */
  readonly writes: T[] = [];
  private result: ReadResult<T>;

  constructor(start: ReadResult<T> = { kind: 'missing' }) {
    this.result = start;
  }

  read(): Promise<ReadResult<T>> {
    return Promise.resolve(this.result);
  }

  write(value: T): Promise<void> {
    this.writes.push(value);
    this.result = { kind: 'ok', value };
    return Promise.resolve();
  }
}
