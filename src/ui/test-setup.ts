// Runs before every component test file.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Take the rendered page down after each test, so one test never sees what
// another one drew.
afterEach(() => {
  cleanup();
});
