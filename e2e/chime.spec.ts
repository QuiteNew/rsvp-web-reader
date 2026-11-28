import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { build } from 'vite';

// The speaker cue chimes in the real browsers. The unit tests run the chime
// maths in Node. Each browser has its own maths library, so here the same
// code runs inside Chromium, Firefox and WebKit and has to give the samples
// the desktop app gave, checked by SHA-256 against fixtures/core/chime.json.
// Then Web Audio plays a chime into an OfflineAudioContext, which renders
// without speakers, and what comes out must be the same samples. Last, a
// real click has to unlock sound.
//
// The player is not on the page yet, so the test bundles src/ui/chimePlayer.ts
// with Vite and adds it to the page as window.chimeLab.

interface ChimeCase {
  readonly args: [number[], string?];
  readonly sha256: string;
  readonly frames: number;
}

interface Fixture {
  functions: { chime_wav: unknown[][] };
}

const fixture = JSON.parse(readFileSync('fixtures/core/chime.json', 'utf8')) as Fixture;

// The chimes at the default volume, the only one the app plays.
const CASES: ChimeCase[] = fixture.functions.chime_wav
  .filter((entry) => entry.length === 2 && (entry[0] as unknown[]).length <= 2)
  .map(([args, result]) => {
    const { sha256, frames } = result as { sha256: string; frames: number };
    return { args: args as [number[], string?], sha256, frames };
  });

let bundle = '';

test.beforeAll(async () => {
  const built = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: 'src/ui/chimePlayer.ts', formats: ['iife'], name: 'chimeLab' },
    },
  });
  const outputs = Array.isArray(built) ? built : [built];
  for (const output of outputs) {
    if ('output' in output) bundle = output.output[0].code;
  }
  if (bundle === '') throw new Error('Vite did not give back the bundle');
});

async function openWithPlayer(page: Page) {
  await page.goto('./');
  await page.addScriptTag({ content: bundle });
}

test('every chime is the desktop sound, sample for sample, in this browser', async ({ page }) => {
  expect(CASES.length).toBe(33);
  await openWithPlayer(page);
  const results = (await page.evaluate(`(async (cases) => {
    const hex = (buffer) =>
      Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const answers = [];
    for (const { args } of cases) {
      const [notes, style = 'bell'] = args;
      const floats = window.chimeLab.chimeFloats(notes, style);
      const bytes = new Uint8Array(floats.length * 2);
      const view = new DataView(bytes.buffer);
      floats.forEach((value, index) => view.setInt16(index * 2, Math.round(value * 32768), true));
      answers.push({ frames: floats.length, sha256: hex(await crypto.subtle.digest('SHA-256', bytes)) });
    }
    return answers;
  })(${JSON.stringify(CASES)})`)) as { frames: number; sha256: string }[];
  const differ = CASES.filter(
    (entry, index) =>
      results[index]?.sha256 !== entry.sha256 || results[index]?.frames !== entry.frames,
  ).map((entry) => entry.args);
  expect(differ).toEqual([]);
});

// What Web Audio this browser has. Playwright's WebKit on Windows is built
// without it, so there the app must stay silent without an error. Safari on a
// Mac or an iPhone has it. A browser with only the old prefixed names would
// leave the player silent where it should not be, so that fails.
async function webAudioIn(page: Page) {
  return (await page.evaluate(`({
    standard: typeof AudioContext === 'function' && typeof OfflineAudioContext === 'function',
    prefixed: typeof webkitAudioContext !== 'undefined' || typeof webkitOfflineAudioContext !== 'undefined',
  })`)) as { standard: boolean; prefixed: boolean };
}

const NO_WEB_AUDIO = 'this browser build has no Web Audio, so there is no sound to check';

test('Web Audio plays the chime it is given unchanged', async ({ page }) => {
  await openWithPlayer(page);
  const audio = await webAudioIn(page);
  expect(audio.standard || !audio.prefixed, 'only the prefixed Web Audio names').toBe(true);
  test.skip(!audio.standard, NO_WEB_AUDIO);
  const answers = (await page.evaluate(`(async () => {
    const lab = window.chimeLab;
    const out = [];
    for (const style of ['bell', 'soft', 'glass', 'wood']) {
      const floats = lab.chimeFloats([523.25, 659.25, 783.99], style);
      const context = new OfflineAudioContext(1, floats.length, 44100);
      const source = context.createBufferSource();
      source.buffer = lab.chimeBuffer(context, floats, 44100);
      source.connect(context.destination);
      source.start();
      const rendered = (await context.startRendering()).getChannelData(0);
      let differ = 0;
      for (let i = 0; i < floats.length; i++) if (rendered[i] !== floats[i]) differ++;
      out.push({ style, length: rendered.length, differ });
    }
    return out;
  })()`)) as { style: string; length: number; differ: number }[];
  for (const answer of answers) {
    expect(answer.differ, answer.style).toBe(0);
    expect(answer.length).toBeGreaterThan(0);
  }
});

test('a click unlocks sound and a chime plays, or without Web Audio stays silent', async ({
  page,
}) => {
  await openWithPlayer(page);
  const audio = await webAudioIn(page);
  expect(audio.standard || !audio.prefixed, 'only the prefixed Web Audio names').toBe(true);
  await page.evaluate(`(() => {
    const lab = window.chimeLab;
    window.chimeTest = { player: new lab.ChimePlayer(), errors: [] };
    const button = document.createElement('button');
    button.textContent = 'Unlock sound';
    button.addEventListener('click', () => {
      try {
        window.chimeTest.player.unlock();
        window.chimeTest.played = window.chimeTest.player.play([440], 'bell', true);
      } catch (error) {
        window.chimeTest.errors.push(String(error));
      }
    });
    document.body.prepend(button);
  })()`);
  expect(await page.evaluate('window.chimeTest.player.available')).toBe(audio.standard);
  await page.getByRole('button', { name: 'Unlock sound' }).click();
  expect(await page.evaluate('window.chimeTest.errors')).toEqual([]);
  // With Web Audio the chime starts. Without it, silence and no error.
  expect(await page.evaluate('window.chimeTest.played')).toBe(audio.standard);
  if (!audio.standard) test.info().annotations.push({ type: 'note', description: NO_WEB_AUDIO });
});
