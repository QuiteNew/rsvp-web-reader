import { expect, test, type Page } from '@playwright/test';

// Speaker cues in a real browser: where the name tag lands, which the unit
// tests cannot tell, the flash when a new speaker starts, and the chime
// reaching Web Audio. The page's clock is Playwright's and stands still
// after Start reading, so the test moves it to the next speaker exactly.
//
// The chime is played into a stand-in for AudioContext that the page gets
// before it loads, so the test sees what would be played, in every browser,
// even one without Web Audio of its own (Playwright's WebKit on Windows).
// The real Web Audio is checked in e2e/chime.spec.ts.

// "Alice:" 300 ms, then 200, 200, and 700 for "friend" with the speaker
// pause: Bob starts 1400 ms in. Each speaker has two turns, because a label
// seen only once is not taken for a speaker, as on the desktop. The long
// word makes a large word size fit the window only when drawn smaller.
const TALK = [
  'Alice: hello extraordinarily friend',
  'Bob: hi again you',
  'Alice: fine thanks much',
  'Bob: good then bye',
].join('\n');
const FIRST_TURN_MS = 1400;

const RECORD_CHIMES = `
  window.chimesPlayed = [];
  window.audioContextsMade = 0;
  window.AudioContext = class {
    constructor() { window.audioContextsMade += 1; this.state = 'suspended'; this.destination = {}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createBuffer(channels, length, sampleRate) {
      return { length, sampleRate, numberOfChannels: channels, copyToChannel() {} };
    }
    createBufferSource() {
      const source = {
        buffer: null, onended: null, connect() {}, stop() {},
        start() { window.chimesPlayed.push({ length: source.buffer.length, rate: source.buffer.sampleRate }); },
      };
      return source;
    }
  };
`;

async function readTalk(page: Page, saved: object = {}): Promise<void> {
  const settings = JSON.stringify({ speaker_cues_enabled: true, ...saved });
  await page.addInitScript(
    `localStorage.setItem('rsvp-web-reader.settings', ${JSON.stringify(settings)});`,
  );
  await page.addInitScript(RECORD_CHIMES);
  await page.clock.install();
  await page.goto('./');
  await page.getByRole('button', { name: 'Add transcript' }).click();
  await page.getByRole('button', { name: 'Blank transcript' }).click();
  await page.getByLabel('Transcript title').fill('Talk');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByLabel('Transcript text').fill(TALK);
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
  await page.getByRole('button', { name: 'Start reading' }).click();
}

const tag = (page: Page) => page.getByTestId('speaker-tag');

// Python's round(): a half goes to the even number.
function roundHalfEven(value: number): number {
  const whole = Math.floor(value);
  const part = value - whole;
  if (part !== 0.5) return Math.round(value);
  return whole % 2 === 0 ? whole : whole + 1;
}

// The reading area's background, as the browser paints it.
async function background(page: Page): Promise<string> {
  return page.evaluate<string>(
    `getComputedStyle(document.querySelector('[data-testid=speaker-tag]').parentElement).backgroundColor`,
  );
}

test('above the word: over the guide marks, centred on the focus letter, half the fitted size', async ({
  page,
}) => {
  // Wider than 720 px, so the list of transcripts sits at the side and the
  // reading area is tall.
  await page.setViewportSize({ width: 900, height: 800 });
  await readTalk(page, { default_font_size: 96 });
  await expect(tag(page)).toHaveText('Alice');
  const letter = page.getByTestId('word').locator('span').nth(1);
  const mark = page.getByTestId('guide-marks').locator('span').nth(0);
  const [l, m, t] = await Promise.all([
    letter.boundingBox(),
    mark.boundingBox(),
    tag(page).boundingBox(),
  ]);
  if (!l || !m || !t) throw new Error('something is not on the page');
  // 8 px between the tag and the top of the upper mark.
  expect(Math.abs(m.y - (t.y + t.height) - 8)).toBeLessThan(1);
  expect(Math.abs(t.x + t.width / 2 - (l.x + l.width / 2))).toBeLessThan(1.5);
  // The word was drawn smaller to fit, and the tag follows the size drawn.
  const sizes = await page.evaluate<number[]>(`[
    parseFloat(getComputedStyle(document.querySelector('[data-testid=word]')).fontSize),
    parseFloat(getComputedStyle(document.querySelector('[data-testid=speaker-tag]')).fontSize),
  ]`);
  const [word, tagSize] = sizes as [number, number];
  expect(word).toBeLessThan(96);
  expect(tagSize).toBe(Math.max(8, roundHalfEven(word / 2)));
});

test('in the corner: 12 px in from the top and the right', async ({ page }) => {
  await readTalk(page, { speaker_cue_tag_position: 'top_right' });
  await expect(tag(page)).toHaveText('Alice');
  const area = tag(page).locator('..');
  const [a, t] = await Promise.all([area.boundingBox(), tag(page).boundingBox()]);
  if (!a || !t) throw new Error('something is not on the page');
  expect(Math.abs(t.y - a.y - 12)).toBeLessThan(1);
  expect(Math.abs(a.x + a.width - (t.x + t.width) - 12)).toBeLessThan(1);
});

test('a new speaker: the tag changes, the area warms for 330 ms, and the chime plays', async ({
  page,
}) => {
  await readTalk(page, { speaker_cue_sound: 'change' });
  await expect(tag(page)).toHaveText('Alice');
  const plain = await background(page);
  await page.clock.runFor(FIRST_TURN_MS);
  await expect(tag(page)).toHaveText('Bob');
  const warm = await background(page);
  expect(warm).not.toBe(plain);
  // The tag is in the highlight colour, the focus letter's, while it flashes.
  const colours = await page.evaluate<string[]>(`[
    getComputedStyle(document.querySelector('[data-testid=speaker-tag]')).color,
    getComputedStyle(document.querySelector('[data-testid=word]').children[1]).color,
  ]`);
  expect(colours[0]).toBe(colours[1]);
  await page.clock.runFor(329);
  expect(await background(page)).toBe(warm);
  await page.clock.runFor(1);
  expect(await background(page)).toBe(plain);
  // The click on Start reading unlocked sound, and Bob's change played the
  // change chime in the bell style: one note, 450 ms at 44100 a second.
  expect(await page.evaluate('window.chimesPlayed')).toEqual([{ length: 19845, rate: 44100 }]);
  expect(await page.evaluate('window.audioContextsMade')).toBe(1);
});

test('no flash when the browser asks for less motion, and the tag still changes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await readTalk(page);
  const plain = await background(page);
  await page.clock.runFor(FIRST_TURN_MS);
  await expect(tag(page)).toHaveText('Bob');
  expect(await background(page)).toBe(plain);
});

test('with the sound off, nothing is played and no sound device is made', async ({ page }) => {
  await readTalk(page, { speaker_cue_sound: 'off' });
  await page.clock.runFor(FIRST_TURN_MS);
  await expect(tag(page)).toHaveText('Bob');
  expect(await page.evaluate('window.chimesPlayed')).toEqual([]);
  expect(await page.evaluate('window.audioContextsMade')).toBe(0);
});

test('switched on in the Speaker cues window, the reader shows who is speaking', async ({
  page,
}) => {
  await readTalk(page, { speaker_cues_enabled: false });
  await expect(tag(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Configure speaker cues…' }).click();
  const cues = page.getByRole('dialog', { name: 'Speaker cues' });
  await cues.getByRole('checkbox', { name: 'Speaker cues' }).check();
  await cues.getByRole('button', { name: 'Apply' }).click();
  await expect(cues.getByRole('status')).toHaveText('Applied.');
  await cues.getByRole('button', { name: 'Close' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(tag(page)).toHaveText('Alice');
});

test('Listen plays the chosen style, even with the sound saved as Off', async ({ page }) => {
  await readTalk(page, { speaker_cue_sound: 'off' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Configure speaker cues…' }).click();
  const cues = page.getByRole('dialog', { name: 'Speaker cues' });
  await cues.getByRole('combobox', { name: 'Style' }).selectOption('glass');
  // With the sound off nothing asked for a sound device before this click.
  expect(await page.evaluate('window.audioContextsMade')).toBe(0);
  await cues.getByRole('button', { name: '▶ Listen' }).click();
  // Off plays the change chime once: one glass note, 700 ms at 44100 a second.
  expect(await page.evaluate('window.chimesPlayed')).toEqual([{ length: 30870, rate: 44100 }]);
  expect(await page.evaluate('window.audioContextsMade')).toBe(1);
});

test("a speaker renamed in the window's list is shown by that name at once", async ({ page }) => {
  await readTalk(page);
  await expect(tag(page)).toHaveText('Alice');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Configure speaker cues…' }).click();
  const cues = page.getByRole('dialog', { name: 'Speaker cues' });
  await expect(cues.getByTestId('list-mode')).toHaveText('Automatic');
  await cues.getByRole('textbox', { name: 'Name shown for Alice' }).fill('Ann');
  await expect(cues.getByTestId('list-mode')).toHaveText('Custom');
  await cues.getByRole('button', { name: 'Apply' }).click();
  await cues.getByRole('button', { name: 'Close' }).click();
  await page.keyboard.press('Escape');
  await expect(tag(page)).toHaveText('Ann');
});
