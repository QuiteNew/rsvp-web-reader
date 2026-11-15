import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { APP_VERSION } from '../core/appInfo';
import { App } from './App';

test('the page shows the app name as its heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('RSVP Web Reader');
});

test('the page shows the version', () => {
  render(<App />);
  expect(
    screen.getByText(new RegExp(`Version ${APP_VERSION.replaceAll('.', '\\.')}`)),
  ).toBeVisible();
});

test('the page links to the source', () => {
  render(<App />);
  expect(screen.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/QuiteNew/rsvp-web-reader',
  );
});
