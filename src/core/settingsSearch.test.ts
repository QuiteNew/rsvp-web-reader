// Tests for the Settings search rule. First against the Python fixtures, then
// the desktop project's own tests/test_settings_search.py, replayed.
import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import { matches, queryWords } from './settingsSearch';

const fixture = loadFixture('settings_search');

describe('against the desktop', () => {
  test('query_words', () => {
    expectToMatchFixture(fixture, 'query_words', ([query]) => queryWords(query as string));
  });

  test('matches', () => {
    expectToMatchFixture(fixture, 'matches', ([query, name, keywords, description, include]) =>
      matches(
        query as string,
        name as string,
        keywords as string,
        description as string,
        include as boolean,
      ),
    );
  });
});

// The desktop's tests were run as they are, and every call they made was
// written down with its answer. The names are the Python ones. Optional
// arguments the test named come as a fourth item.
describe('test_settings_search.py', () => {
  type Recorded = readonly [
    name: string,
    args: readonly unknown[],
    result: unknown,
    named?: Record<string, unknown>,
  ];
  const recorded = (fixture.functions.desktop_tests ?? []).map(
    ([[name], calls]) => [name as string, calls as readonly Recorded[]] as const,
  );

  test('every desktop test was recorded', () => {
    expect(recorded.length).toBe(13);
    expect(recorded.every(([, calls]) => calls.length > 0)).toBe(true);
  });

  test.each(recorded)('%s', (_name, calls) => {
    for (const [name, args, expected, named] of calls) {
      if (name === 'query_words') {
        expect(queryWords(args[0] as string)).toEqual(expected);
      } else {
        expect(
          matches(
            args[0] as string,
            args[1] as string,
            (args[2] ?? named?.keywords ?? '') as string,
            (args[3] ?? named?.description ?? '') as string,
            (args[4] ?? named?.include_description ?? false) as boolean,
          ),
        ).toBe(expected);
      }
    }
  });
});

describe('where the fixture does not reach', () => {
  test('a query with no words finds every setting', () => {
    expect(matches('', 'Speed')).toBe(true);
    expect(matches('  ', '')).toBe(true);
  });

  test('"ß" in the query finds "ss" in the name, as casefold does', () => {
    expect(matches('straße', 'STRASSE')).toBe(true);
  });
});
