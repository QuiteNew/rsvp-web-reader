import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// The layer rule. Imports only go one way:
//
//   core       imports nothing from the other layers, and no React.
//   engine     imports core only.
//   store      imports core only.
//   importers  imports core only, and no React.
//   ui         imports anything.
//
// A wrong import fails the lint here and in CI, so the rule does not depend
// on anyone remembering it.

// Builds the no-restricted-imports setting for one layer. `layers` are the
// folders under src that the layer may not import from. Only a path that
// leaves the folder (../) or names src/ counts, so a file of the same name
// inside the layer itself, such as src/core/importers.ts, is not mistaken
// for the importers layer.
function forbidImports(layers, why) {
  return [
    'error',
    {
      patterns: [
        {
          regex: `(^|/)(\\.\\.|src)/(${layers.join('|')})(/|$)`,
          message: why,
        },
        {
          regex: '^react(-dom)?(/|$)',
          message: 'React belongs in src/ui only.',
        },
      ],
    },
  ];
}

// Things only a browser has. Core may not use them, so it stays pure and
// can be tested without a browser. tsconfig.core.json checks the same thing
// from the type side.
const BROWSER_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'performance',
  'fetch',
].map((name) => ({
  name,
  message: 'src/core is pure logic. Take this in as an argument instead.',
}));

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': forbidImports(
        ['engine', 'store', 'ui', 'importers'],
        'src/core may not import from engine, store, ui or importers.',
      ),
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': forbidImports(
        ['store', 'ui', 'importers'],
        'src/engine may only import from core.',
      ),
    },
  },
  {
    files: ['src/store/**/*.ts'],
    rules: {
      'no-restricted-imports': forbidImports(
        ['engine', 'ui', 'importers'],
        'src/store may only import from core.',
      ),
    },
  },
  {
    files: ['src/importers/**/*.ts'],
    rules: {
      'no-restricted-imports': forbidImports(
        ['engine', 'store', 'ui'],
        'src/importers may only import from core.',
      ),
    },
  },
);
