// The Settings window's Defaults tab as data, and its form: what is shown,
// what a search shows, what Reset puts back, and the checks Apply makes.
// From the desktop's gui/components/settings_window.py. That file imports
// tkinter, so it cannot be run here. Its words are read out of it by the
// fixture script (settings_view.json), and settingsView.test.ts checks that
// the ones below are the same. The checks are tested by hand.
import type { Settings } from './models';
import {
  DEFAULT_SAVED_SETTINGS,
  FONT_SIZE_STEP_RANGE,
  GUIDE_MARK_THICKNESS_RANGE,
  HIGHLIGHT_OFFSET_RANGE,
  RESUME_REWIND_WORDS_RANGE,
  settingsView,
  type Range,
} from './settings';
import { matches, queryWords } from './settingsSearch';
import { isPyDigit, pyInt, pyStrip } from './pythonText';

/** One entry of the Defaults tab. A note or the reset row is not searchable. */
export interface DefaultsEntry {
  // The page's own name for the entry, used to find its controls.
  readonly id: string;
  readonly name: string;
  readonly keywords: string;
  readonly description: string;
  readonly searchable: boolean;
}

export const DEFAULTS_NOTE =
  'Speed, the three colours and the word size are what new transcripts start with. Everything else here applies to all transcripts straight away.';
export const WPM_APPLY_NOTE = 'Changes for the WPM slider take effect after clicking Apply.';
export const SKIP_NOTE =
  'Skip controls below apply immediately, to the current transcript and all future ones';
export const NO_MATCH_TEXT = 'No settings match your search.';
export const RESET_NOTE_TEXT = 'Clear the search to show the reset button.';
export const RESET_BUTTON_TEXT = 'Reset to Original Defaults';

/**
 * Places where the web says it differently, because the desktop text talks
 * about its detached window or about launching the app. Each pair is the
 * desktop's words and the web's. The test checks every desktop phrase is
 * still in the desktop text, so a change there is noticed.
 */
export const WEB_WORDING: readonly (readonly [desktop: string, web: string])[] = [
  [', to the main and detached windows', ''],
  ['When the app starts, it opens', 'When the page opens, it opens'],
  ['when you last closed it', 'when you last left it'],
  ['Takes effect the next time you launch the app.', 'Takes effect the next time the page opens.'],
];

/** Desktop entries the web does not have yet, and why. */
export const NOT_YET: Readonly<Record<string, string>> = {
  'Configure speaker cues': 'Speaker cues are phase 6.',
};

function webWords(text: string): string {
  return WEB_WORDING.reduce((words, [desktop, web]) => words.split(desktop).join(web), text);
}

function range([low, high]: Range): string {
  return `Allowed range: ${low} to ${high}.`;
}

const ENTRIES: readonly DefaultsEntry[] = [
  { id: 'note', name: '', keywords: '', description: '', searchable: false },
  {
    id: 'speed',
    name: 'Speed',
    keywords: 'wpm words per minute rate pace tempo fast slow',
    description: '',
    searchable: true,
  },
  {
    id: 'fontColor',
    name: 'Font colour',
    keywords: 'color text letters words',
    description: '',
    searchable: true,
  },
  {
    id: 'highlightColor',
    name: 'Highlight colour',
    keywords: 'color accent focus letter orp optimal recognition point',
    description: '',
    searchable: true,
  },
  {
    id: 'backgroundColor',
    name: 'Background colour',
    keywords: 'color backdrop canvas reading area',
    description: '',
    searchable: true,
  },
  {
    id: 'wordSize',
    name: 'Word size',
    keywords: 'font size text size px pixels bigger smaller larger zoom scale',
    description: '',
    searchable: true,
  },
  { id: 'wpmNote', name: '', keywords: '', description: '', searchable: false },
  {
    id: 'chunking',
    name: 'Configure chunking',
    keywords:
      'chunk chunks chunking group grouping words at a time several multiple phrase adaptive fixed',
    description:
      'Flash several words at once instead of one at a time, so your eyes move less across each flash. Opens a window where you can turn this on for the transcript open now or for new transcripts, pick a fixed number of words or an adaptive width, and set the size.',
    searchable: true,
  },
  {
    id: 'fontSizeStep',
    name: 'Increase the word size by this many pixels each time +/- is clicked',
    keywords: 'font size step increment plus minus buttons zoom change amount',
    description: '',
    searchable: true,
  },
  {
    id: 'highlightOffset',
    name: 'Shift the highlighted letter vertically by this many pixels (positive = up, negative = down)',
    keywords: 'highlight position offset vertical move nudge up down focus letter orp',
    description: `Applies globally, to every transcript. ${range(HIGHLIGHT_OFFSET_RANGE)}`,
    searchable: true,
  },
  {
    id: 'guideMarkThickness',
    name: 'Thickness of the vertical guide marks, in pixels',
    keywords: 'guide marks lines width stroke thick thin crosshair',
    description: `Applies globally, to every transcript. ${range(GUIDE_MARK_THICKNESS_RANGE)}`,
    searchable: true,
  },
  {
    id: 'guideMarkLength',
    name: 'Mark length',
    keywords: 'guide marks vertical lines height size percent percentage crosshair',
    description:
      'Length of the vertical guide marks, as a percentage of the current word so they keep scaling with the Word Size setting above. Applies globally.',
    searchable: true,
  },
  {
    id: 'guideMarkColor',
    name: 'Mark colour',
    keywords: 'color guide marks lines vertical crosshair',
    description:
      'Colour of the vertical guide marks above and below the highlighted letter. Applies globally, to every transcript.',
    searchable: true,
  },
  {
    id: 'guideMarkHorizontal',
    name: 'Show horizontal guide lines',
    keywords: 'crosshair grey gray above below centered centred',
    description:
      'Adds a fixed grey line above and below the vertical guide marks, sized close to the width of the reading area, to help keep your eyes centered while reading.',
    searchable: true,
  },
  {
    id: 'lengthPacing',
    name: 'Slow down for long words',
    keywords: 'length long pacing pause delay timing longer pace speed',
    description:
      "Gives longer words a bit more time on screen, in three steps based on length (short words are unaffected). If a word is both long and ends a sentence or clause, only the longer of the two pauses applies, since they don't stack. Applies globally, takes effect after clicking Apply.",
    searchable: true,
  },
  {
    id: 'warmUp',
    name: 'Ease in at the start of reading',
    keywords: 'warm up warmup warm-up ramp gradually slow start half speed build up begin',
    description: webWords(
      'Starts each reading session at about half speed and builds up to your chosen speed over the first several words, so you settle in instead of being hit with full speed right away. It stacks with the pacing above. Applies globally, to the main and detached windows, and takes effect after clicking Apply.',
    ),
    searchable: true,
  },
  {
    id: 'splitLongParagraphs',
    name: 'Split long paragraphs when normalizing',
    keywords: 'normalize normalise paragraphs break wall of text sentences edit box layout',
    description:
      "When you click Normalize, also break a long wall of text into paragraphs at sentence ends, so it's easier to read in the edit box. This only changes how the text is laid out for editing, never what gets read or the reading speed. Applies globally; takes effect the next time you click Normalize.",
    searchable: true,
  },
  {
    id: 'resumeRewind',
    name: 'Rewind a few words when resuming',
    keywords: 'back step back replay context resume pause words to rewind on resume',
    description: webWords(
      'When you resume after pausing, reading first steps back this many words, so you pick up with a little context instead of exactly where you stopped. ' +
        `Applies globally, to the main and detached windows. ${range(RESUME_REWIND_WORDS_RANGE)} ` +
        'Takes effect after clicking Apply, and only while the toggle above is on.',
    ),
    searchable: true,
  },
  {
    id: 'scrubPause',
    name: 'Pause after using the scrubber',
    keywords: 'scrub scrubber progress bar seek drag jump position slider stop',
    description: webWords(
      'When you drag the progress bar to a new spot and let go, reading pauses there, so you can get your bearings before pressing play. Turn this off to have reading keep going from the new spot if it was already playing. Applies globally, to the main and detached windows, and takes effect after clicking Apply.',
    ),
    searchable: true,
  },
  {
    id: 'peripheralContext',
    name: 'Show surrounding words',
    keywords:
      'peripheral context ribbon sentence before after dim line neighbours neighbors nearby',
    description: webWords(
      "Shows a dim line beneath the flashing word with the words just before and after it, so you keep a little sense of the sentence around what you're reading without your eyes leaving the centre. Applies globally, to the main and detached windows, and takes effect after clicking Apply.",
    ),
    searchable: true,
  },
  {
    id: 'reopenLast',
    name: 'Reopen the last transcript at launch',
    keywords: 'start startup open launch previous last remember resume restore session continue',
    description: webWords(
      'When the app starts, it opens the transcript that was open when you last closed it, at the same word and paused, so nothing starts playing on its own. Turn this off to start with no transcript open. Takes effect the next time you launch the app.',
    ),
    searchable: true,
  },
  { id: 'skipNote', name: '', keywords: '', description: '', searchable: false },
  {
    id: 'skipAmount',
    name: 'Skip amount',
    keywords: 'skip jump forward backward words arrows buttons',
    description: '',
    searchable: true,
  },
  {
    id: 'pauseOnSkip',
    name: 'Pause playback when skipping',
    keywords: 'skip jump stop halt play',
    description: '',
    searchable: true,
  },
  { id: 'reset', name: '', keywords: '', description: '', searchable: false },
];

export const DEFAULTS_ENTRIES = ENTRIES;

/** What the Defaults tab shows for a query, as in _layout_defaults(). */
export interface DefaultsLayout {
  // The ids of the entries shown, in their order.
  readonly shown: readonly string[];
  // "No settings match your search."
  readonly noMatch: boolean;
  // "Clear the search to show the reset button."
  readonly resetNote: boolean;
}

/**
 * A blank query shows every entry. While a query is typed, the notes and
 * the reset row are hidden and only the settings it finds are shown, in
 * their own order. When it finds none, a no-match message is shown; when
 * it finds some, a note says why the reset button is gone.
 */
export function defaultsLayout(query: string, includeDescription: boolean): DefaultsLayout {
  const searching = queryWords(query).length > 0;
  const shown: string[] = [];
  let anyMatch = false;
  for (const entry of ENTRIES) {
    let visible: boolean;
    if (entry.searchable) {
      visible = matches(query, entry.name, entry.keywords, entry.description, includeDescription);
      if (visible) anyMatch = true;
    } else {
      visible = !searching;
    }
    if (visible) shown.push(entry.id);
  }
  return { shown, noMatch: searching && !anyMatch, resetNote: searching && anyMatch };
}

/**
 * The Settings window's values while it is open. Nothing is saved until
 * Apply. The four typed numbers are kept as the text in their boxes, and
 * checked by checkSettingsForm().
 */
export interface SettingsForm {
  readonly defaultWpm: number;
  readonly defaultFontColor: string;
  readonly defaultHighlightColor: string;
  readonly defaultBackgroundColor: string;
  readonly defaultFontSize: number;
  readonly fontSizeStep: string;
  readonly highlightOffsetPx: string;
  readonly guideMarkThicknessPx: string;
  readonly guideMarkLengthPercent: number;
  readonly guideMarkColor: string;
  readonly guideMarkHorizontalEnabled: boolean;
  readonly lengthPacingEnabled: boolean;
  readonly warmUpEnabled: boolean;
  readonly splitLongParagraphsEnabled: boolean;
  readonly resumeRewindEnabled: boolean;
  readonly resumeRewindWords: string;
  readonly scrubPauseEnabled: boolean;
  readonly peripheralContextEnabled: boolean;
  readonly reopenLastTranscript: boolean;
  readonly skipWordCount: number;
  readonly pauseOnSkip: boolean;
  readonly appearanceMode: Settings['appearanceMode'];
}

/** The form as the window opens: what is saved now. */
export function formFromSettings(settings: Settings): SettingsForm {
  return {
    defaultWpm: settings.defaultWpm,
    defaultFontColor: settings.defaultFontColor,
    defaultHighlightColor: settings.defaultHighlightColor,
    defaultBackgroundColor: settings.defaultBackgroundColor,
    defaultFontSize: settings.defaultFontSize,
    fontSizeStep: String(settings.fontSizeStep),
    highlightOffsetPx: String(settings.highlightOffsetPx),
    guideMarkThicknessPx: String(settings.guideMarkThicknessPx),
    guideMarkLengthPercent: settings.guideMarkLengthPercent,
    guideMarkColor: settings.guideMarkColor,
    guideMarkHorizontalEnabled: settings.guideMarkHorizontalEnabled,
    lengthPacingEnabled: settings.lengthPacingEnabled,
    warmUpEnabled: settings.warmUpEnabled,
    splitLongParagraphsEnabled: settings.splitLongParagraphsEnabled,
    resumeRewindEnabled: settings.resumeRewindEnabled,
    resumeRewindWords: String(settings.resumeRewindWords),
    scrubPauseEnabled: settings.scrubPauseEnabled,
    peripheralContextEnabled: settings.peripheralContextEnabled,
    reopenLastTranscript: settings.reopenLastTranscript,
    skipWordCount: settings.skipWordCount,
    pauseOnSkip: settings.pauseOnSkip,
    appearanceMode: settings.appearanceMode,
  };
}

/**
 * "Reset to Original Defaults": every control of the Defaults tab back to
 * the original value, as _handle_reset_defaults() does. Nothing is saved
 * until Apply, except the skip amount and pause when skipping, which the
 * caller saves at once, as on the desktop. The theme is on another tab and
 * stays as it is.
 *
 * The guide mark colour goes back to the original colour itself. On Apply
 * that counts as a colour picked by hand when it differs from the one in
 * use, which in the dark theme it does. That is what the desktop does.
 */
export function resetDefaultsForm(form: SettingsForm): SettingsForm {
  return {
    ...formFromSettings(settingsView(DEFAULT_SAVED_SETTINGS)),
    appearanceMode: form.appearanceMode,
  };
}

/** Where a typed number is wrong, and what to say. */
export interface FormProblem {
  readonly field:
    'fontSizeStep' | 'guideMarkThicknessPx' | 'resumeRewindWords' | 'highlightOffsetPx';
  readonly message: string;
}

export type FormCheck =
  | { readonly ok: true; readonly changes: Partial<Settings> }
  | { readonly ok: false; readonly problem: FormProblem };

// The number in a box, the way the desktop reads it: Python's
// str.isdigit() on the whole text, then int(). isdigit() also lets through
// digits int() cannot read, such as "²" or "①". On the desktop int() then
// fails and nothing is applied, with no message. Here they get the "whole
// number" message. null means it is not a whole number.
function wholeNumber(text: string): number | null {
  if (text === '' || ![...text].every(isPyDigit)) return null;
  try {
    return pyInt(text);
  } catch {
    return null;
  }
}

/**
 * The checks Apply makes, in the desktop's order (_handle_apply): the three
 * typed numbers, then the highlighted letter shift, which may start with a
 * minus. Spaces around a number are fine. The first problem found stops the
 * check, and nothing is applied.
 */
export function checkSettingsForm(form: SettingsForm): FormCheck {
  const numbers: readonly [FormProblem['field'], Range, string][] = [
    ['fontSizeStep', FONT_SIZE_STEP_RANGE, 'The word size step for +/-'],
    ['guideMarkThicknessPx', GUIDE_MARK_THICKNESS_RANGE, 'The guide mark thickness'],
    ['resumeRewindWords', RESUME_REWIND_WORDS_RANGE, 'Words to rewind on resume'],
  ];
  const values: Partial<Record<FormProblem['field'], number>> = {};
  for (const [field, [low, high], name] of numbers) {
    const number = wholeNumber(pyStrip(form[field]));
    if (number === null) {
      return { ok: false, problem: { field, message: `${name} must be a whole number.` } };
    }
    if (!(low <= number && number <= high)) {
      return {
        ok: false,
        problem: { field, message: `${name} must be between ${low} and ${high}.` },
      };
    }
    values[field] = number;
  }

  const offsetText = pyStrip(form.highlightOffsetPx);
  const negative = offsetText.startsWith('-');
  const digits = negative ? offsetText.slice(1) : offsetText;
  const offsetName = 'The highlighted letter shift';
  const size = wholeNumber(digits);
  if (size === null) {
    return {
      ok: false,
      problem: { field: 'highlightOffsetPx', message: `${offsetName} must be a whole number.` },
    };
  }
  // "-0" is 0, not minus zero.
  const offset = negative && size !== 0 ? -size : size;
  const [low, high] = HIGHLIGHT_OFFSET_RANGE;
  if (!(low <= offset && offset <= high)) {
    return {
      ok: false,
      problem: {
        field: 'highlightOffsetPx',
        message: `${offsetName} must be between ${low} and ${high}.`,
      },
    };
  }

  return {
    ok: true,
    changes: {
      fontSizeStep: values.fontSizeStep,
      guideMarkThicknessPx: values.guideMarkThicknessPx,
      resumeRewindWords: values.resumeRewindWords,
      highlightOffsetPx: offset,
      defaultWpm: form.defaultWpm,
      defaultFontColor: form.defaultFontColor,
      defaultHighlightColor: form.defaultHighlightColor,
      defaultBackgroundColor: form.defaultBackgroundColor,
      defaultFontSize: form.defaultFontSize,
      skipWordCount: form.skipWordCount,
      pauseOnSkip: form.pauseOnSkip,
      guideMarkHorizontalEnabled: form.guideMarkHorizontalEnabled,
      lengthPacingEnabled: form.lengthPacingEnabled,
      splitLongParagraphsEnabled: form.splitLongParagraphsEnabled,
      warmUpEnabled: form.warmUpEnabled,
      resumeRewindEnabled: form.resumeRewindEnabled,
      scrubPauseEnabled: form.scrubPauseEnabled,
      peripheralContextEnabled: form.peripheralContextEnabled,
      reopenLastTranscript: form.reopenLastTranscript,
      guideMarkLengthPercent: form.guideMarkLengthPercent,
      appearanceMode: form.appearanceMode,
    },
  };
}
