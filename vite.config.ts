import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves a project site from /<repo-name>/, not from the root.
// The built site asks for its files under this path, so it has to match the
// repository name. If the site moves to its own domain, this becomes '/'.
const BASE_PATH = '/rsvp-web-reader/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
  test: {
    // Three groups of tests. The logic layers run in plain Node, which is
    // fast and proves they need no browser. The importers and the React
    // components get a pretend browser (jsdom): the importers need its
    // DOMParser. The real browsers are in e2e/.
    projects: [
      {
        extends: true,
        test: {
          name: 'logic',
          environment: 'node',
          include: ['src/{core,engine,store}/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'importers',
          environment: 'jsdom',
          include: ['src/importers/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/ui/**/*.test.tsx'],
          setupFiles: ['src/ui/test-setup.ts'],
        },
      },
    ],
  },
});
