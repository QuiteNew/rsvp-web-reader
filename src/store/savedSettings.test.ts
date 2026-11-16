import { describe, expect, test } from 'vitest';
import {
  readLastTranscriptId,
  readSavedSettings,
  reopenLastTranscript,
  writeLastTranscriptId,
  writeSavedSettings,
} from './savedSettings';
import { SETTINGS_KEY } from './schema';

function storage(start: Record<string, string> = {}) {
  const items = new Map(Object.entries(start));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

describe('the settings kept for an export', () => {
  test('nothing saved reads as no settings', () => {
    expect(readSavedSettings(storage())).toEqual({});
  });

  test('what is written is read back, without the folder path', () => {
    const kept = storage();
    expect(writeSavedSettings(kept, { default_wpm: 450, data_directory: 'C:\\somewhere' })).toBe(
      true,
    );
    expect(readSavedSettings(kept)).toEqual({ default_wpm: 450 });
  });

  test('text that is not JSON reads as no settings', () => {
    expect(readSavedSettings(storage({ [SETTINGS_KEY]: '{not json' }))).toEqual({});
  });

  test('JSON that is not a set of settings is put aside', () => {
    const kept = storage({ [SETTINGS_KEY]: '[1, 2]' });
    expect(readSavedSettings(kept)).toEqual({});
    expect(kept.items.get(`${SETTINGS_KEY}.damaged`)).toBe('[1, 2]');
  });

  test('a storage that refuses does not throw', () => {
    const refusing = {
      getItem: (): string | null => {
        throw new Error('blocked');
      },
      setItem: (): void => {
        throw new Error('full');
      },
    };
    expect(readSavedSettings(refusing)).toEqual({});
    expect(writeSavedSettings(refusing, { default_wpm: 450 })).toBe(false);
  });
});

describe('the transcript that was open last', () => {
  test('is none to begin with, and reopening is on', () => {
    expect(readLastTranscriptId(storage())).toBeNull();
    expect(reopenLastTranscript(storage())).toBe(true);
  });

  test('is remembered next to the other settings', () => {
    const kept = storage({ [SETTINGS_KEY]: JSON.stringify({ default_wpm: 450 }) });
    writeLastTranscriptId(kept, 7);
    expect(readLastTranscriptId(kept)).toBe(7);
    expect(readSavedSettings(kept)).toEqual({ default_wpm: 450, last_transcript_id: 7 });
    writeLastTranscriptId(kept, null);
    expect(readLastTranscriptId(kept)).toBeNull();
  });

  test.each(['7', 7.5, true, [7], {}])('an odd id reads as none %j', (odd) => {
    const kept = storage({ [SETTINGS_KEY]: JSON.stringify({ last_transcript_id: odd }) });
    expect(readLastTranscriptId(kept)).toBeNull();
  });

  test('reopening is off only when the settings say false', () => {
    const off = storage({ [SETTINGS_KEY]: JSON.stringify({ reopen_last_transcript: false }) });
    expect(reopenLastTranscript(off)).toBe(false);
    for (const odd of [null, 0, 'no']) {
      const kept = storage({ [SETTINGS_KEY]: JSON.stringify({ reopen_last_transcript: odd }) });
      expect(reopenLastTranscript(kept)).toBe(true);
    }
  });
});
