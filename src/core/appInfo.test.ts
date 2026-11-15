import { expect, test } from 'vitest';
import packageJson from '../../package.json';
import { APP_NAME, APP_VERSION } from './appInfo';

test('the version in the app matches the one in package.json', () => {
  expect(APP_VERSION).toBe(packageJson.version);
});

test('the version is three numbers with dots between them', () => {
  expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});

test('the app has a name', () => {
  expect(APP_NAME).toBe('RSVP Web Reader');
});
