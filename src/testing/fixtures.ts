// Loads the golden fixtures and runs a function against them. Used by tests
// only. docs/PORTING.md explains what the fixtures are.

import { expect } from 'vitest';

/** One recorded call: the arguments, then the result or the error it raised. */
export type FixtureCase =
  | readonly [args: readonly unknown[], result: unknown]
  | readonly [args: readonly unknown[], result: null, raises: string];

export interface Fixture {
  readonly meta: Readonly<Record<string, string>>;
  readonly functions: Readonly<Record<string, readonly FixtureCase[]>>;
}

const files = import.meta.glob('../../fixtures/core/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Fixture>;

/** The fixture file fixtures/core/<name>.json. */
export function loadFixture(name: string): Fixture {
  const fixture = files[`../../fixtures/core/${name}.json`];
  if (!fixture) {
    throw new Error(`No fixture file fixtures/core/${name}.json`);
  }
  return fixture;
}

function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) =>
    same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/**
 * Run every recorded case of one Python function through `run` and fail if
 * any answer differs. Where Python raised ValueError, `run` has to throw a
 * RangeError. The first few differences are shown, not all of them.
 */
export function expectToMatchFixture(
  fixture: Fixture,
  pythonName: string,
  run: (args: readonly unknown[]) => unknown,
): void {
  const cases = fixture.functions[pythonName];
  if (!cases || cases.length === 0) {
    throw new Error(`The fixture has no cases for ${pythonName}`);
  }
  const differences: unknown[] = [];
  for (const [args, expected, raises] of cases) {
    let actual: unknown;
    let thrown: unknown;
    try {
      actual = run(args);
    } catch (error) {
      thrown = error;
    }
    const matches = raises
      ? thrown instanceof RangeError
      : thrown === undefined && same(actual, expected);
    if (!matches) {
      differences.push({
        args,
        python: raises ? `raises ${raises}` : expected,
        typescript: thrown === undefined ? actual : `throws ${String(thrown)}`,
      });
    }
  }
  expect(differences.slice(0, 5), `${differences.length} of ${cases.length} cases differ`).toEqual(
    [],
  );
}
