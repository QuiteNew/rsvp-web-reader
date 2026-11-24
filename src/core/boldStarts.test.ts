import { describe, expect, test } from 'vitest';
import { expectToMatchFixture, loadFixture } from '../testing/fixtures';
import {
  MAX_BOLD_LETTERS,
  MAX_NUDGE,
  boldRanges,
  charKind,
  cutAfter,
  fixationLength,
  isNumericChar,
  type CharKind,
} from './boldStarts';
import { characters } from './pythonText';

const fixture = loadFixture('bold_starts');
const charsets = loadFixture('charsets').functions as unknown as Record<
  string,
  readonly (readonly [number, number])[]
>;

const LAST_CHARACTER = 0x10ffff;
const SOFT_HYPHEN = '\u00ad';
const ZERO_WIDTH_SPACE = '\u200b';
const ACUTE = '\u0301';
const CURLY_APOSTROPHE = '\u2019';
const EMOJI = '\u{1F600}';

/** The text with [ ] around every bold stretch, counted in characters. */
function show(text: string): string {
  const chars = characters(text);
  let shown = '';
  let last = 0;
  for (const [start, end] of boldRanges(text)) {
    shown += `${chars.slice(last, start).join('')}[${chars.slice(start, end).join('')}]`;
    last = end;
  }
  return shown + chars.slice(last).join('');
}

describe('against the desktop', () => {
  test('fixationLength gives the same answer for every length tried', () => {
    expectToMatchFixture(fixture, 'fixation_length', ([count]) => fixationLength(count as number));
  });

  test('boldRanges gives the same stretches for every text tried', () => {
    const cases = fixture.functions['bold_ranges']!;
    expect(cases.length).toBeGreaterThan(2000);
    expectToMatchFixture(fixture, 'bold_ranges', ([text]) => boldRanges(text as string));
  });
});

// The fixture lists, for each kind of character, every character of that
// kind as [first, last] pairs of character numbers.
function toSet(ranges: readonly (readonly [number, number])[]): Uint8Array {
  const set = new Uint8Array(LAST_CHARACTER + 1);
  for (const [first, last] of ranges) set.fill(1, first, last + 1);
  return set;
}

// Characters that had no meaning yet in Python's Unicode version. A newer
// browser may know them, so they are left out of the comparison.
const unassigned = toSet(charsets['unassigned']!);

function hex(number: number): string {
  return `U+${number.toString(16).toUpperCase().padStart(4, '0')}`;
}

describe('against every character Python knows', () => {
  test('charKind agrees with the desktop for letters, marks, apostrophes and glue', () => {
    const lists = fixture.functions['kind_ranges']![0]![1] as Record<string, [number, number][]>;
    const python = new Map<string, Uint8Array>(
      (['L', 'M', 'A', 'I'] as const).map((kind) => [kind, toSet(lists[kind]!)]),
    );
    expect(lists['L']!.length).toBeGreaterThan(10);
    const wrong: string[] = [];
    for (let number = 0; number <= LAST_CHARACTER; number += 1) {
      if (unassigned[number]) continue;
      let expected: CharKind = 'O';
      for (const kind of ['L', 'M', 'A', 'I'] as const) {
        if (python.get(kind)![number] === 1) expected = kind;
      }
      if (charKind(String.fromCodePoint(number)) !== expected) wrong.push(hex(number));
    }
    expect(wrong).toEqual([]);
  });

  test('isNumericChar agrees with str.isnumeric()', () => {
    const numeric = toSet(fixture.functions['numeric_ranges']![0]![1] as [number, number][]);
    const wrong: string[] = [];
    for (let number = 0; number <= LAST_CHARACTER; number += 1) {
      if (unassigned[number]) continue;
      if (isNumericChar(String.fromCodePoint(number)) !== (numeric[number] === 1)) {
        wrong.push(hex(number));
      }
    }
    expect(wrong).toEqual([]);
  });

  test('a character that is not there is not numeric', () => {
    expect(isNumericChar('')).toBe(false);
  });
});

// The cases below are the ones of the desktop's tests/test_bold_starts.py,
// kept so a reader of this file sees each rule stated in plain examples. The
// fixture above already proves them against the real code.

describe('how much of a word is bold', () => {
  test.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [6, 3],
    [7, 4],
    [10, 4],
    [11, 5],
    [14, 5],
    [15, 6],
    [30, 6],
  ])('%i letters give %i bold', (letters, bold) => {
    expect(fixationLength(letters)).toBe(bold);
  });

  test('a word of two letters or more is never bold all the way', () => {
    for (let letters = 2; letters < 80; letters += 1) {
      expect(fixationLength(letters)).toBeGreaterThanOrEqual(1);
      expect(fixationLength(letters)).toBeLessThan(letters);
    }
  });

  test('the bold part never shrinks as the word grows, and stops at the cap', () => {
    const lengths = Array.from({ length: 79 }, (_, index) => fixationLength(index + 1));
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(Math.max(...lengths)).toBe(MAX_BOLD_LETTERS);
  });
});

describe('ordinary words', () => {
  test.each([
    ['a', '[a]'],
    ['I', '[I]'],
    ['of', '[o]f'],
    ['the', '[th]e'],
    ['that', '[th]at'],
    ['about', '[abo]ut'],
    ['people', '[peo]ple'],
    ['NASA', '[NA]SA'],
    ['iPhone', '[iPh]one'],
  ])('%s', (word, expected) => {
    expect(show(word)).toBe(expected);
  });

  test('a sentence gets a bold start on every word', () => {
    expect(show('The quick brown fox.')).toBe('[Th]e [qui]ck [bro]wn [fo]x.');
  });
});

describe('long words', () => {
  test.each([
    ['reading', '[read]ing'],
    ['JavaScript', '[Java]Script'],
    ['internationalization', '[intern]ationalization'],
    [
      'pneumonoultramicroscopicsilicovolcanoconiosis',
      '[pneumo]noultramicroscopicsilicovolcanoconiosis',
    ],
  ])('%s stays light and is cut between a vowel and a consonant', (word, expected) => {
    expect(show(word)).toBe(expected);
  });

  test('a very long word is never far from the cap', () => {
    const word = 'a' + 'bc'.repeat(40);
    const ranges = boldRanges(word);
    expect(ranges).toHaveLength(1);
    const [start, end] = ranges[0]!;
    expect(start).toBe(0);
    expect(end).toBeGreaterThanOrEqual(MAX_BOLD_LETTERS - MAX_NUDGE);
    expect(end).toBeLessThanOrEqual(MAX_BOLD_LETTERS + MAX_NUDGE);
  });
});

describe('where a long word is cut', () => {
  test('a cut in a consonant cluster moves to the vowel before it', () => {
    expect(show('journey')).toBe('[jou]rney');
  });

  test('a cut between two vowels moves to the consonant before them', () => {
    expect(show('audience')).toBe('[aud]ience');
  });

  test('y counts as a vowel', () => {
    expect(show('rhythms')).toBe('[rhy]thms');
  });

  test('when both directions are equally good the lighter cut wins', () => {
    expect(show('because')).toBe('[bec]ause');
  });

  test('a word with no clean cut keeps its normal length', () => {
    expect(show('brrrrrrr')).toBe('[brrr]rrrr');
  });

  test('short words are not nudged', () => {
    expect(show('boat')).toBe('[bo]at');
    expect(show('chair')).toBe('[cha]ir');
  });

  test('a cut is never made right before a Cyrillic sign', () => {
    expect(show('\u043c\u0430\u043c\u0430\u044a\u043c\u0430\u043c')).toBe(
      '[\u043c\u0430\u043c]\u0430\u044a\u043c\u0430\u043c',
    );
  });

  test('the Cyrillic short i is a consonant', () => {
    const word = '\u043a\u043a\u043a\u043a\u0439\u0438\u0438\u0438';
    expect(show(word)).toBe('[\u043a\u043a\u043a\u043a\u0439]\u0438\u0438\u0438');
  });

  test('a cut moves two letters but not three', () => {
    expect(show('babbbbbb')).toBe('[ba]bbbbbb');
    expect(show('abbbbbbb')).toBe('[abbb]bbbb');
  });

  test('a wide nudge cannot run off the end of the word', () => {
    // Nobody should be able to retune the nudge into reading past the word.
    expect(cutAfter(characters('brrrrrrr'), 10)).toBe(4);
  });

  test('capital letters follow the same rules', () => {
    expect(show('AUDIENCE')).toBe('[AUD]IENCE');
  });
});

describe('hyphens, dashes and the like: every part is its own word', () => {
  test('a hyphenated word is bold at the start of each part', () => {
    expect(show('well-known')).toBe('[we]ll-[kno]wn');
    expect(show('state-of-the-art')).toBe('[sta]te-[o]f-[th]e-[ar]t');
    expect(show('mother-in-law')).toBe('[mot]her-[i]n-[la]w');
  });

  test.each(['-', '\u2010', '\u2011', '\u2013', '\u2014', '/', '_', '.', ',', ':', ';', '(', ')'])(
    '%j ends a word',
    (separator) => {
      expect(show(`word${separator}word`)).toBe(`[wo]rd${separator}[wo]rd`);
    },
  );

  test('a zero-width space ends a word', () => {
    expect(show(`foo${ZERO_WIDTH_SPACE}bar`)).toBe(`[fo]o${ZERO_WIDTH_SPACE}[ba]r`);
  });
});

describe('apostrophes', () => {
  test.each([
    ["don't", "[do]n't"],
    [`don${CURLY_APOSTROPHE}t`, `[do]n${CURLY_APOSTROPHE}t`],
    ["O'Brien", "[O'Br]ien"],
    ["I'm", "[I]'m"],
    ['\u043c\u02bc\u044f\u0441\u043e', '[\u043c\u02bc\u044f]\u0441\u043e'],
  ])('one between letters stays in the word: %s', (word, expected) => {
    expect(show(word)).toBe(expected);
  });

  test('one at either end is just punctuation', () => {
    expect(show("dogs'")).toBe("[do]gs'");
    expect(show("'tis")).toBe("'[ti]s");
    expect(show("rock 'n' roll")).toBe("[ro]ck '[n]' [ro]ll");
  });

  test('a lone apostrophe does nothing', () => {
    expect(boldRanges("'")).toEqual([]);
    expect(boldRanges("'' ' ''")).toEqual([]);
  });

  test('one at the very start does not borrow the last character', () => {
    expect(show("'tis 5")).toBe("'[ti]s 5");
  });
});

describe('soft hyphens and joiners', () => {
  test('a soft hyphen is not counted and never changes the answer', () => {
    const withSoftHyphens = 'reading'.split('').join(SOFT_HYPHEN);
    expect(show(withSoftHyphens)).toBe(`[r\u00ade\u00ada\u00add]\u00adi\u00adn\u00adg`);
    expect(show(withSoftHyphens).replaceAll(SOFT_HYPHEN, '')).toBe(show('reading'));
  });

  test('a soft hyphen at the end of a word is left out of the bold part', () => {
    expect(show(`exam${SOFT_HYPHEN}`)).toBe(`[ex]am${SOFT_HYPHEN}`);
  });

  test.each(['\u200c', '\u200d', '\u2060'])('the joiner %j stays inside a word', (glue) => {
    expect(show(`rea${glue}ding`)).toBe(`[rea${glue}d]ing`);
  });
});

describe('combining marks', () => {
  test('an accent stays with its letter', () => {
    expect(show(`cafe${ACUTE}`)).toBe(`[ca]fe${ACUTE}`);
    expect(show(`ca${ACUTE}fe`)).toBe(`[ca${ACUTE}]fe`);
  });

  test('a single accented letter is bold with its accent', () => {
    expect(show(`e${ACUTE}`)).toBe(`[e${ACUTE}]`);
  });

  test('a mark with no letter before it is ignored', () => {
    expect(boldRanges(` ${ACUTE} `)).toEqual([]);
    expect(boldRanges(`1${ACUTE}`)).toEqual([]);
  });
});

describe('alphabets', () => {
  test('Cyrillic and Greek words get bold starts', () => {
    expect(show('\u041f\u0440\u0438\u0432\u0435\u0442')).toBe(
      '[\u041f\u0440\u0438]\u0432\u0435\u0442',
    );
    expect(show('\u039a\u03b1\u03bb\u03b7\u03bc\u03ad\u03c1\u03b1')).toBe(
      '[\u039a\u03b1\u03bb\u03b7]\u03bc\u03ad\u03c1\u03b1',
    );
  });

  test('the Greek question mark is not a letter', () => {
    expect(show('\u03c4\u03b9\u037e')).toBe('[\u03c4]\u03b9\u037e');
  });

  test.each([
    ['Chinese', '\u4f60\u597d\u4e16\u754c'],
    ['Japanese', '\u3053\u3093\u306b\u3061\u306f'],
    ['Arabic', '\u0645\u0631\u062d\u0628\u0627'],
    ['Hebrew', '\u05e9\u05dc\u05d5\u05dd'],
    ['Thai', '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35'],
  ])('%s is left alone', (_name, text) => {
    expect(boldRanges(text)).toEqual([]);
  });

  test('a Latin word next to another script is still bold', () => {
    expect(show('hello\u4f60\u597d')).toBe('[hel]lo\u4f60\u597d');
  });
});

describe('digits', () => {
  test.each(['2024', '3.14', '3rd', '2nd', 'H2O', 'mp3', 'x86', 'version2', "1990's", 'm\u00b2'])(
    '%s is left alone',
    (text) => {
      expect(boldRanges(text)).toEqual([]);
    },
  );

  test('a gap or a hyphen between a word and a number keeps the bold', () => {
    expect(show('COVID-19')).toBe('[COV]ID-19');
    expect(show('3-D')).toBe('3-[D]');
    expect(show('5 apples')).toBe('5 [app]les');
  });

  test('a number written as an ideograph counts, as on the desktop', () => {
    expect(boldRanges('hello\u4e09')).toEqual([]);
    expect(boldRanges('\u4e09hello')).toEqual([]);
  });
});

describe('web and email addresses', () => {
  test('a web address is left alone', () => {
    expect(show('see https://example.com/long-path now')).toBe(
      '[se]e https://example.com/long-path [no]w',
    );
    expect(show('www.example.org is')).toBe('www.example.org [i]s');
    expect(show('go (https://x.org/a) now')).toBe('[g]o (https://x.org/a) [no]w');
  });

  test('an email address is left alone', () => {
    expect(show('mail bob@example.com please')).toBe('[ma]il bob@example.com [ple]ase');
    expect(show('alice.smith+tag@mail.example.co.uk')).toBe('alice.smith+tag@mail.example.co.uk');
  });

  test('an address after an emoji is still found at the right place', () => {
    // The emoji is two UTF-16 units and one character, so the positions of
    // the address have to be turned into characters.
    expect(show(`${EMOJI} see https://x.org now`)).toBe(`${EMOJI} [se]e https://x.org [no]w`);
  });
});

describe('blank and odd text', () => {
  test.each(['', ' ', '   \n\t  ', '!!! ... ???', '-- -- --', '12 34 56'])(
    'text without words has no bold: %j',
    (text) => {
      expect(boldRanges(text)).toEqual([]);
    },
  );
});

describe('offsets', () => {
  test('the ranges count characters, not UTF-16 units', () => {
    const text = `hello ${EMOJI} world`;
    expect(boldRanges(text)).toEqual([
      [0, 3],
      [8, 11],
    ]);
    expect(show(text)).toBe(`[hel]lo ${EMOJI} [wor]ld`);
  });

  test('a word never runs across a line break', () => {
    expect(show('ab\ncd')).toBe('[a]b\n[c]d');
    expect(show('ab\r\ncd')).toBe('[a]b\r\n[c]d');
  });

  test('a whole text gives the same ranges as its lines one by one', () => {
    const text =
      'The well-known state-of-the-art audience\n' +
      "don't read https://example.com/a-b now\n\n" +
      `\u041f\u0440\u0438\u0432\u0435\u0442 \u043a\u044a\u0449\u0430 cafe${ACUTE} 3rd\n` +
      `inter${SOFT_HYPHEN}national 1990's`;
    const byLine: [number, number][] = [];
    let offset = 0;
    for (const line of text.split('\n')) {
      for (const [start, end] of boldRanges(line)) byLine.push([start + offset, end + offset]);
      offset += characters(line).length + 1;
    }
    expect(boldRanges(text)).toEqual(byLine);
  });
});

describe('the shape of the answer', () => {
  const messy =
    "Hello, world! It's a well-known fact (see https://example.com/x) that " +
    "internationalization costs 3 times more than don't-care attitudes; " +
    "e.g. rock 'n' roll, state_of_the_art, O'Brien\u2014and \u041f\u0440\u0438\u0432\u0435\u0442 " +
    `cafe${ACUTE} ${EMOJI} inter${SOFT_HYPHEN}national 1990's H2O.`;

  test('ranges are sorted and never overlap', () => {
    const ranges = boldRanges(messy);
    expect(ranges.length).toBeGreaterThan(0);
    let previousEnd = 0;
    for (const [start, end] of ranges) {
      expect(previousEnd).toBeLessThanOrEqual(start);
      expect(start).toBeLessThan(end);
      expect(end).toBeLessThanOrEqual(characters(messy).length);
      previousEnd = end;
    }
  });

  test('every range starts on a letter', () => {
    const chars = characters(messy);
    for (const [start] of boldRanges(messy)) {
      expect(/^\p{L}$/u.test(chars[start]!)).toBe(true);
    }
  });

  test('the same text always gives the same answer', () => {
    expect(boldRanges(messy)).toEqual(boldRanges(messy));
  });
});
