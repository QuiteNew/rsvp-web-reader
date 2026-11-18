import { execFileSync } from 'node:child_process';
import { expect, test } from 'vitest';
import packageJson from '../../package.json';
import { APP_NAME, APP_VERSION } from './appInfo';

type Version = readonly [number, number, number];

// The highest plain release tag (vMAJOR.MINOR.PATCH) in a list, compared as
// numbers, so v1.10.0 beats v1.9.5, which a text sort would get wrong. Tags
// that are not plain releases (a stray "main", "v2", a "-rc1") are ignored.
function newestReleaseTag(tags: readonly string[]): Version | null {
  let newest: Version | null = null;
  for (const tag of tags) {
    const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
    if (match === null) continue;
    const version: Version = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (newest === null || compareVersions(version, newest) > 0) newest = version;
  }
  return newest;
}

function compareVersions(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

// The tags of this repository, or null when there is nothing to read: git
// is not installed, or this is a copy without the repository.
function repositoryTags(): string[] | null {
  try {
    const output = execFileSync('git', ['tag', '--list'], { encoding: 'utf8', timeout: 10_000 });
    return output.split(/\s+/).filter(Boolean);
  } catch {
    return null;
  }
}

test('the version in the app matches the one in package.json', () => {
  expect(APP_VERSION).toBe(packageJson.version);
});

test('the version is three numbers with dots between them', () => {
  expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});

test('the app has a name', () => {
  expect(APP_NAME).toBe('RSVP Web Reader');
});

test('the version is not behind the newest release tag', () => {
  // The version is bumped by hand, so this catches the one way that goes
  // wrong: tagging a release without bumping it first. It can only fail once
  // the tag exists, and it does nothing where there are no tags to read (the
  // CI checkout has none).
  const newest = newestReleaseTag(repositoryTags() ?? []);
  if (newest === null) return;
  const current = APP_VERSION.split('.').map(Number) as unknown as Version;
  expect(
    compareVersions(current, newest),
    `APP_VERSION is ${APP_VERSION} but the newest release tag is v${newest.join('.')}. ` +
      'Bump the version in src/core/appInfo.ts and package.json before tagging.',
  ).toBeGreaterThanOrEqual(0);
});

test('the newest release tag is found by number, not by text', () => {
  expect(newestReleaseTag(['v1.2.0', 'v1.10.0', 'v1.9.5'])).toEqual([1, 10, 0]);
});

test('tags that are not plain releases are ignored', () => {
  expect(newestReleaseTag(['main', 'v2', 'v1.0', 'v9.9.9-rc1', 'release-9.9.9', 'v1.0.0'])).toEqual(
    [1, 0, 0],
  );
});

test('with no release tags there is nothing to compare with', () => {
  expect(newestReleaseTag([])).toBeNull();
  expect(newestReleaseTag(['main'])).toBeNull();
});
