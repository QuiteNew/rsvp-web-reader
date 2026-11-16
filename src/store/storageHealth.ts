// Asking the browser not to clear this site's data on its own.
import type { PersistenceGrant, StorageHealth } from './contract';

export const browserStorageHealth: StorageHealth = {
  async requestPersistence(): Promise<PersistenceGrant> {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') {
      return 'unsupported';
    }
    try {
      if (await navigator.storage.persisted()) return 'granted';
      return (await navigator.storage.persist()) ? 'granted' : 'denied';
    } catch {
      return 'unsupported';
    }
  },
};
