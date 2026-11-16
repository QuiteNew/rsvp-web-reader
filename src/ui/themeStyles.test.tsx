/// <reference types="node" />
// The style sheet cannot import the palette, so this checks that the colours
// written in it are the ones in src/core/theme.ts, which are the desktop's.
import { describe, expect, test } from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DARK_PALETTE, LIGHT_PALETTE, type Palette } from '../core/theme';

// The style sheet's variable and the palette key it stands for.
const SAME_AS = {
  '--paper': 'hearth_paper',
  '--ink': 'cocoa_ink',
  '--taupe': 'warm_taupe',
  '--mocha': 'warm_mocha',
  '--ember': 'ember_glow',
  '--ember-hover': 'ember_glow_hover',
  '--line': 'warm_line',
} as const;

const css = readFileSync(join(process.cwd(), 'src/ui/global.css'), 'utf8');

function block(start: string): string {
  const from = css.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  return css.slice(from, css.indexOf('}', from));
}

function value(text: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6});`, 'u').exec(text)?.[1]?.toUpperCase();
}

describe('global.css', () => {
  test.each([
    [':root {', LIGHT_PALETTE],
    [":root[data-theme='dark'] {", DARK_PALETTE],
  ] as const)('%s has the colours of its palette', (start, palette: Palette) => {
    const text = block(start);
    for (const [name, key] of Object.entries(SAME_AS)) {
      expect(value(text, name), name).toBe(palette[key]?.toUpperCase());
    }
  });
});
