"""Writes the golden fixtures for the TypeScript port.

The desktop app's Python code is the specification. This script feeds many
inputs through the real desktop functions and writes each input with the
answer Python gave to JSON files under fixtures/core/. The TypeScript tests
then run the same inputs through the port and compare.

How to run it, from the root of the web repository:

    python -B tools/fixtures/generate.py --desktop PATH_TO_DESKTOP_CLONE

Rules this script keeps:

- It only reads the desktop repository. It writes nothing there, and it
  refuses to run if the output folder is inside it. Run it with -B so Python
  writes no __pycache__ there either (the script also switches that off
  itself, but only for imports made after its first lines).
- The output is the same on every run: no dates, no random input. If the
  files change, the desktop code or this script changed.
- Use Python 3.13, the version the desktop app targets. What counts as a
  letter, a digit or a space comes from Python's Unicode tables, and those
  change between Python versions.

Besides the fixtures it writes two tables the port needs at run time, so
they live with the code: src/core/pythonLowerTable.ts, every character
Python's str.lower() changes, and src/core/pythonCasefoldTable.ts, the
short list where str.casefold() and lower-casing disagree.

To add a module: write a build_<module>() function that returns
{function name: [cases]}, and add it to MODULES at the bottom. A case is
[[arguments], result], or [[arguments], None, "ValueError"] when the call
is expected to raise.
"""

import sys

sys.dont_write_bytecode = True

import argparse
import json
import random
import re
import subprocess
import unicodedata
from pathlib import Path

EXPECTED_PYTHON = (3, 13)


# ---------------------------------------------------------------------------
# Input. Written with \u escapes so this file stays plain ASCII and no editor
# can damage it.
# ---------------------------------------------------------------------------

SPEAKER_TRANSCRIPT = (
    "Interviewer: Welcome back to the show. Today we're talking about RSVP.\n"
    "Dr. Smith: Thanks for having me! It's a well-known idea, isn't it?\n"
    "Interviewer: It is... but few people try it.\n"
    ">> So, where do we start?\n"
    "Dr. Smith: At the beginning; with one word at a time.\n"
)

YOUTUBE_TRANSCRIPT = (
    "0:05\nso today we talk\n0:09\nabout the reader\n1:02:03\nand that is all"
)

SRT_TRANSCRIPT = (
    "1\r\n00:00:01,000 --> 00:00:04,000\r\nHello world.\r\n\r\n"
    "2\r\n00:00:04,500 --> 00:00:08,250\r\nThis is the second line.\r\n"
)

# Ordinary and awkward text. Every module that takes text gets all of these.
TEXTS = [
    "",
    " ",
    "     ",
    "\n",
    "\t\n \r\n",
    "Hello",
    "Welcome to the show",
    "Hello    there     friend",
    "Hello\nthere\tfriend",
    "   Hello there friend   ",
    "Welcome to the show. Today we're talking about RSVP.",
    "Just a plain sentence with no timestamps at all.",
    "Hello   there\n\nfriend",
    # Only punctuation
    "...",
    "-- ... !? ,;:",
    "\"'\" (--) [..]",
    "hello :) there",
    "just words, and more :) words",
    # Punctuation around words
    "\"hello.\" ...hello!!! well-known $5.99 \"don't\" step-by-step sub-terrain",
    "e.g. i.e. U.S.A. 3.14 1,000,000 50% #tag @name a/b c\\d",
    "(parenthesised) [bracketed] {braced} <angled>",
    # Curly quotes, dashes, ellipsis
    "“Hello,” she said — ‘quietly’… and left–slowly.",
    # Emoji: single, with a skin tone, joined family, a flag, next to words
    "\U0001F600",
    "I ❤️ reading \U0001F600 fast\U0001F680!",
    "\U0001F44D\U0001F3FD ok \U0001F468‍\U0001F469‍\U0001F467 family \U0001F1F2\U0001F1F0 flag",
    "\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600 a\U0001F600b",
    # Cyrillic and Greek
    "Привет, мир! Как дела?",
    "Здраво, свету. Ќе читаме побрзо; зошто не?",
    "Καλημέρα, κόσμε! Τι κάνεις;",
    # Accents: one character, and a letter followed by a combining mark
    "café naïve résumé über straße",
    "café naïve",
    # Chinese, Japanese, Arabic, Hebrew, Hindi
    "你好，世界。 こんにちは、世界！",
    "مرحبا بالعالم، ٣٤٥ שלום नमस्ते।",
    # Numbers that are not ASCII digits
    "½ x² Ⅷ ① ٣٤٥ \U0001D7D8\U0001D7D9",
    # Very long words
    "a" * 50,
    "supercalifragilisticexpialidocious pneumonoultramicroscopicsilicovolcanoconiosis",
    "anti-dis-establish-ment-arian-ism " + "x" * 200,
    # Line endings
    "First line.\r\nSecond line.\r\n\r\nThird line.",
    "Old Mac line.\rSecond line.\rThird.",
    "First.\n\n\n\nSecond.",
    "First.\n   \n\t\nSecond.",
    "   First.   \n   Second.   ",
    # Odd spaces: no-break, narrow no-break, ideographic, thin, zero width,
    # byte order mark, next line, form feed, vertical tab, file separator,
    # line and paragraph separators
    "no break narrow space wide　space thin space",
    "zero​width ﻿bom at﻿middle",
    "next\u0085line form\ffeed vertical\vtab file\x1cseparator unit\x1fseparator",
    "line separator paragraph separator",
    "  padded with no-break spaces  ",
    "﻿Starts with a byte order mark.",
    # Combined letters
    "ﬁnd the ﬂow",
    "eﬃcient and oﬀer ﬀﬁﬂﬃﬄﬅﬆ",
    "½ x² wait…",
    # Timestamps
    "[00:00:01] Welcome to the show.",
    "(1:23) Today we're talking about speed reading.",
    "00:02:45 rapid serial visual presentation.",
    "[00:00:01] Welcome to the show. (1:23) Today we're talking about RSVP.",
    "[00:00:01] Welcome to the show.\n(1:23) Today we're talking.",
    "[00:00:01]\nHello.",
    "We met at 10:30 today.",
    "We met at 10:30:15 today, and at 1:02:03.5 again.",
    "0:05\r\nHello.",
    "0:05\rHello.",
    "  0:05  \nHello.\n\t12:34\t\nWorld.",
    "0:05",
    "0:05\n",
    "Hello.\n0:05",
    "0:05 Hello.",
    "0:05\u0085Hello.",
    "00:00:01,000 --> 00:00:04,000\nHello world.",
    "00:00:01.000-->00:00:04.000 tight arrow",
    "00:00:01,000 --> 00:00:04,000 no-break spaces round the arrow",
    "00:00:01,000﻿-->﻿00:00:04,000 byte order marks round the arrow",
    "0:05\nHello.\n0:09\nWorld.",
    "text [00:01:23], more",
    "wrap up [00:05:00]. Next part",
    "(intro [0:30])",
    "Speaker [00:01]: hello",
    "(a [0:30], b [0:45], c)",
    "See ([00:01:23], (1:23), 00:02:45, the notes)",
    "[1:2] [123:45] [1:234] (12:34:56.789) [12:34.5] (1:23,45)",
    "100:20:30 1:2:3 12:34:56:78 :12:34:56 x12:34:56y 9912:34:56",
    "Ratio 3:10 and score 21:19, then [3:10].",
    "later , we [0:01] ; ; went ( [0:02] ) home [0:03] !",
    # A separator left in front of a closing bracket
    "(done, [0:30])",
    "[first; (1:23)]",
    "(x [0:01] : )",
    "list (9:00, 9:15, done [0:20], ) and [a, b: (0:30) ]",
    "[٠٠:٠١] Arabic-Indic digits in a timestamp",
    "[\U0001D7D8\U0001D7D9:\U0001D7DA\U0001D7DB] mathematical digits in a timestamp",
    "[00:00:01] \U0001F600 emoji after a timestamp (0:02) Привет",
    SPEAKER_TRANSCRIPT,
    SPEAKER_TRANSCRIPT.replace("\n", "\r\n"),
    YOUTUBE_TRANSCRIPT,
    SRT_TRANSCRIPT,
]

# Single tokens that the texts above do not produce on their own.
EXTRA_WORDS = (
    ["a" * n for n in range(0, 21)]
    + ["a" * 30, "a" * 50]
    + [
        "I", "to", "about", "show.", "friendship", "understanding",
        "hello", '"hello', '"hello."', "...hello!!!", "well-known", "$5.99",
        "\"don't\"", "--", ".", "-", "---", "-a-", "a-", "-a", "a--b",
        "step-by-step", "sub-terrain", "—dash—", "non‐breaking",
        # Emoji at every position of a short word, to catch counting in
        # UTF-16 units and not in characters
        "\U0001F600", "\U0001F600a", "a\U0001F600", "ab\U0001F600cd",
        "\U0001F600\U0001F600", "\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600",
        "\U0001F600abcde", "abcde\U0001F600", "\U0001F600.",  ".\U0001F600",
        "\U0001D7D8\U0001D7D9", "\U00020000\U00020001",
        "é", "café", "́",
        "½", "x²", "Ⅷ", "①", "٣٤", "三",
        "ª", "µ", "ʰ", "ͅ", "_", "a_b", "‿",
    ]
)

MARKS = [
    "", ".", "!", "?", ",", ";", ":", '"', "-", "...", "?!", '."', ',"', ".,",
    ",.", ";:", "--", "'", ")", "(", "…", "。", "，", "؟",
    ";", "¿", "¡", "!”", "”", " . ", "a.", "1,",
]


# Lines that start with a speaker label, and lines that only look like it.
SPEAKER_LINES = [
    "Interviewer: So how did it start?", "Speaker 2: In a garage.", "Q: Why?", "A: Because.",
    "Dr. Smith: Good morning.", "O'Brien: Hello.", "O’Brien: Hello.", "Mary-Jane: Hi.",
    "Jean Luc Le Bon: Bonjour.", "Иван: Привет.",
    "INTERVIEWER: Hello.", "张三: 你好", "Speaker 2 : Hello.", "Speaker   2: Hello.",
    "   Bob: indented.", "\tBob: after a tab.", "Bob:", "Bob:\tafter a tab.",
    "and Bob: hi", "the answer is: yes", "speaker 1: hi", "Note:hello", "http://example.com is up",
    "10:30 is when we met", "2nd: second place", "_x: hi", "Wait, Bob: hi", "Ready? Go: now",
    "Really! Bob: no", "\"Bob\": quoted", "(Bob): in brackets", "[Bob] hello",
    "One two three four five: too many words", "One two three four: hi", "Bob", ": nothing before it",
    "plain words with no label", "A" * 30 + ": hi", "A" * 30 + "B: hi",
    "A" * 14 + "        " + "B" * 15 + ": hi", "Bob: time is 10:30: late",
    ">> And then what happened?", ">> JOHN: hi", ">>JOHN: hi", ">>> quoted reply", "a >> b", ">>", ">>\t Ann: hi",
    # Capitals and small letters in other scripts, and letters with no case
    "Émile: salut", "émile: salut", "Σωκράτης: ναι",
    "σωκράτης: ναι", "ª: ordinal", "ʰx: modifier", "ʕ: glottal",
    "ǅak: titlecase", "Ⅷ: roman numeral", "½: a fraction", "x́y: combining mark",
    "\U0001F600: emoji", "Bob\U0001F600: emoji inside", "\U00010400x: Deseret capital", "\U00010428x: Deseret small",
    "Straße: one", "STRASSE: two", "ΟΔΟΣ: three", "οδος: four",
    "İstanbul: dotted capital", "Bob Smith: no-break space inside", "Bob : line separator after",
    "Bob: no-break space after", "Bob:\x85next line after", "Bob:﻿byte order mark after", "Bob_1: underscore",
    # Sixteen letters that each take two UTF-16 units: 16 characters to
    # Python, 32 to a JavaScript string.
    "\U00010400" * 16 + ": letters outside the basic plane", "\U00010400" * 31 + ": too long either way",
    "B.o.b.: dots", "Bob-: hyphen at the end", "Bob.: dot at the end", "Bob': apostrophe at the end",
]

# Whole transcripts with speakers.
SPEAKER_TEXTS = [
    SPEAKER_TRANSCRIPT,
    SPEAKER_TRANSCRIPT.replace("\n", "\r\n"),
    "Intro words here.\nInterviewer: So?\n\nSpeaker 2: Yes, it did.\n",
    "[00:01:02] Bob: hi there\n00:01:05 Ann: hello\n0:07\nBob: again",
    "1\n00:00:01,000 --> 00:00:04,000\nBob: hi\n",
    "Bob: one\nAnn: two\nBob: three",
    "Bob: one\rAnn: two\rBob: three",
    "one Bob: two\none\x85Bob: two\none\x0bBob: two\none\x0cBob: two\none\x1cBob: two",
    "\n\n   \nBob: hi\n\t\n \nAnn: hey",
    "Ann: a\nBob: b\nAnn : c\nCarl: d\nBob: e\nANN: f\n>> g",
    "INTERVIEWER: a\nBob: b\nInterviewer: c\nBOB: d",
    "Welcome.\nAnn: hi\nBob: hey\nNote: once only\nAnn: bye\nBob: see you",
    "Interviewer: So, how did it start?\n[00:00:05] Speaker 2: In a garage.\n>> And then?",
    "Dr. Smith: first\nSmith: second\nAnn: third\nDr. Smith: fourth\nSmith: fifth",
    ">> one two\n>> three\nplain line\n>> JOHN: four\n>> JOHN: five\n>> six",
    "Ann: one. Two, three!\nAnn: again\nBob: well-known step-by-step words; then more.\nAnn: bye",
    "Straße: one\nSTRASSE: two\nstrasse: three\nStrasse: four",
    "first line\n>>\nsecond line",
]

# A longer piece of ordinary prose, so chunking has sentences to work with.
PROSE = (
    "Reading one word at a time sounds strange, but it works. The eye stays in one place; "
    "the words come to it. Some words are short, some are extraordinarily long, and a few are "
    "hyphenated, like well-known or state-of-the-art. Does that matter? It does! A longer word "
    "needs more time: that is what pacing is for. In a typical session you start slowly, speed up, "
    "and settle. If you lose your place, skip back a little. That is all there is to it -- really."
)

# Pieces the random texts are built from: labels, changes, timestamps, odd
# spaces and line endings, punctuation, other scripts and emoji. The same
# idea as the random test in the desktop's tests/test_speakers.py.
RANDOM_PIECES = [
    "Bob:", "Ann:", "Speaker 2:", "Q:", "Dr. Smith:", "INTERVIEWER:", "Note:",
    ">>", ">> JOHN:", ">>>", "word", "two words", "end.", "hi,", "10:30", "--",
    "http://x.y", "[00:01:02]", "(1:23)", "00:02:45", "0:05",
    "00:00:01,000 --> 00:00:04,000", "naïve", "Иван:",
    "\U0001F600", " ", " ", "\x85", "\x0b", "\t", " ", "  ",
    "extraordinarily", "well-known", "wait...", "really?", "yes;",
    "\n", "\n", "\n", "\r\n", "\r", "\n\n",
]


def random_texts(count, seed):
    """The same made-up texts on every run: the seed fixes them."""
    rng = random.Random(seed)
    return [
        "".join(rng.choice(RANDOM_PIECES) + rng.choice(["", " ", "\n"]) for _ in range(rng.randint(0, 40)))
        for _ in range(count)
    ]


CUSTOM_SPEAKERS = [
    None,
    {},
    {"bob": "Bob", "ann": "Ann", "interviewer": "Host", "john": "John"},
    {"dr. smith": "Smith", "smith": "Smith", "ann": "Ann", "note": "Note", "speaker 2": "Second"},
]

# Values a damaged save file could hold where a speaker list should be.
DAMAGED_CUSTOM = [
    None, {}, [], [["bob", "Bob"]], "bob", 7, True, 1.5,
    {"bob": "Bob"}, {"Bob": "Bob"}, {" bob": "Bob"}, {"bob  smith": "B"}, {"bob smith": "  Bob   Smith  "},
    {"": "Empty key"}, {"bob": ""}, {"bob": "   "}, {"bob": 5}, {"bob": None}, {"bob": ["Bob"]},
    {"bob": "A" * 30}, {"bob": "A" * 31}, {"bob": "\U0001F600" * 30}, {"bob": "\U0001F600" * 31},
    {"straße": "x"}, {"strasse": "x"}, {"οδος": "x"}, {"οδοσ": "x"},
    {"ann": "Ann", "BAD": "x", "bob": "Bob", "carl": 3},
    {"bob smith": "x"}, {"bob\tsmith": "x"}, {"constructor": "x", "toString": "y"},
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def call(function, *arguments):
    """One case: the arguments and what the function returned, or the name
    of the error it raised."""
    try:
        result = function(*arguments)
    except ValueError:
        return [list(arguments), None, "ValueError"]
    return [list(arguments), result]


def unique(items):
    """The items in their first-seen order, without repeats."""
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def ranges(predicate):
    """Every character the predicate accepts, as [first, last] pairs of
    character numbers."""
    found = []
    start = None
    for number in range(0x110000):
        if predicate(chr(number)):
            if start is None:
                start = number
        elif start is not None:
            found.append([start, number - 1])
            start = None
    if start is not None:
        found.append([start, 0x10FFFF])
    return found


# ---------------------------------------------------------------------------
# One builder per desktop module
# ---------------------------------------------------------------------------

def build_charsets(core):
    """Not a desktop module. These are the character rules of Python itself
    that the desktop code leans on, so the port's own versions of them can
    be checked character by character."""
    space = re.compile(r"\s")
    digit = re.compile(r"\d")
    word = re.compile(r"\w")
    return {
        "str_isspace": ranges(str.isspace),
        "re_space": ranges(lambda ch: space.fullmatch(ch) is not None),
        "re_digit": ranges(lambda ch: digit.fullmatch(ch) is not None),
        "str_isalnum": ranges(str.isalnum),
        "unassigned": ranges(lambda ch: unicodedata.category(ch) == "Cn"),
        "re_word": ranges(lambda ch: word.fullmatch(ch) is not None),
        "str_islower": ranges(str.islower),
        # Not ranges: every character str.casefold() changes, with what it
        # becomes. Surrogates are left out, they are not characters.
        "str_casefold": [
            [number, chr(number).casefold()]
            for number in range(0x110000)
            if not 0xD800 <= number <= 0xDFFF and chr(number).casefold() != chr(number)
        ],
    }


def all_words(core):
    tokens = []
    for text in TEXTS:
        tokens.extend(core.tokenizer.tokenize(text))
        tokens.extend(core.tokenizer.tokenize(core.parser.clean_transcript(text)))
    return unique(tokens + EXTRA_WORDS)


def build_tokenizer(core):
    cleaned = [core.parser.clean_transcript(text) for text in TEXTS]
    return {
        "tokenize": [call(core.tokenizer.tokenize, text) for text in unique(TEXTS + cleaned)],
    }


def build_parser(core):
    lines = unique(line for text in TEXTS for line in re.split(r"\r\n|\r|\n", text))
    return {
        "clean_transcript": [call(core.parser.clean_transcript, text) for text in TEXTS],
        "clean_transcript_keep_lines": [
            call(core.parser.clean_transcript_keep_lines, text) for text in TEXTS
        ],
        "strip_timestamps": [
            call(core.parser.strip_timestamps, text) for text in unique(TEXTS + lines)
        ],
        "expand_ligatures": [call(core.parser.expand_ligatures, text) for text in TEXTS],
    }


def build_punctuation(core):
    words = all_words(core)
    stripped = []
    for word in words:
        leading, _, trailing = core.punctuation.split_punctuation(word)
        stripped.append(leading + trailing)
    return {
        "split_punctuation": [
            [[word], list(core.punctuation.split_punctuation(word))] for word in words
        ],
        "classify_pacing": [
            call(core.punctuation.classify_pacing, marks) for marks in unique(MARKS + stripped)
        ],
    }


def build_orp(core):
    words = all_words(core)
    cores = unique(core.punctuation.split_punctuation(word)[1] for word in words)

    def split(word):
        try:
            result = core.orp.split_at_orp(word)
        except ValueError:
            return [[word], None, "ValueError"]
        return [[word], {"before": result.before, "focus": result.focus, "after": result.after}]

    return {
        "get_orp_index_for_length": [
            call(core.orp.get_orp_index_for_length, length) for length in range(-2, 61)
        ],
        "get_orp_index": [call(core.orp.get_orp_index, word) for word in unique(words + cores)],
        "split_at_orp": [split(word) for word in unique(words + cores)],
    }


def build_timing(core):
    timing = core.timing
    words = all_words(core)
    paces = ["none", "clause", "sentence", "not-a-real-pace", ""]
    bases = list(range(0, 701))
    return {
        # Every speed from far below to far above what Settings allows, so
        # every halfway case of the rounding is in here.
        "wpm_to_delay_ms": [call(timing.wpm_to_delay_ms, wpm) for wpm in [-50, -1, 0] + list(range(1, 1501))],
        "pacing_multiplier": [call(timing.pacing_multiplier, pace) for pace in paces],
        "apply_pacing_multiplier": [
            call(timing.apply_pacing_multiplier, base, pace)
            for pace in ["clause", "sentence", "none", "not-a-real-pace"]
            for base in (bases if pace in ("clause", "sentence") else [0, 1, 89, 200, 601])
        ],
        "effective_pacing_length": [call(timing.effective_pacing_length, word) for word in words],
        "length_multiplier": [call(timing.length_multiplier, band) for band in range(-2, 8)],
        "apply_length_multiplier": [
            call(timing.apply_length_multiplier, base, band)
            for band in [-1, 0, 1, 2, 3, 4, 5]
            for base in (bases if band in (2, 3, 4) else [0, 1, 89, 200, 601])
        ],
        "warm_up_multiplier": [call(timing.warm_up_multiplier, shown) for shown in range(-5, 31)],
        "apply_warm_up": [
            call(timing.apply_warm_up, base, shown)
            for base in [0, 1, 60, 86, 89, 150, 200, 333, 500, 600, 1500]
            for shown in range(-2, 26)
        ],
        "format_duration": [
            call(timing.format_duration, seconds)
            for seconds in [-3600, -5, -1]
            + list(range(0, 131))
            + [599, 600, 601, 754, 3540, 3599, 3600, 3601, 3661, 3900, 7199, 7200,
               35999, 36000, 86399, 86400, 100000, 359999, 360000]
        ],
    }


def hit_list(scan):
    return [[hit.word_index, hit.key, hit.name, hit.marked] for hit in scan.hits]


def row_list(rows):
    return [[row.key, row.label, row.appearances, row.ticked, row.name] for row in rows]


def build_speakers(core):
    speakers = core.speakers
    made_up = random_texts(200, 20261115)
    texts = unique(SPEAKER_LINES + SPEAKER_TEXTS + TEXTS + made_up)
    # Every text is scanned. The functions that take a speaker list as well
    # get a smaller set, or the file would hold each text many times over.
    with_lists = set(SPEAKER_LINES + SPEAKER_TEXTS + made_up[:25])
    with_edits = set(SPEAKER_TEXTS + made_up[:8])
    names = unique(
        ["", " ", "  Speaker   TWO ", "STRASSE", "straße", "ΟΔΟΣ", "οδος",
         "İstanbul", "I", "ı", "ﬁsh", "ẞ", "ᎠᎡ", "ꭰꭱ", "µ", "ſ",
         "A B", "A\tB\nC", "\U00010400", "ǅ", "ͅ"]
        + [hit.name for text in texts for hit in speakers.scan_speakers(text).hits]
    )

    scans, candidates, autos, turns, rows, saved, whole, lookups = [], [], [], [], [], [], [], []
    row_names = []
    for text in texts:
        scan = speakers.scan_speakers(text)
        scans.append([[text], {"word_count": scan.word_count, "hits": hit_list(scan)}])
        found = speakers.speaker_candidates(scan)
        if not scan.hits:
            continue
        candidates.append([[text], [[c.key, c.name, c.appearances] for c in found]])
        autos.append([[text], speakers.auto_speakers(found)])
        if text not in with_lists:
            continue
        for custom in CUSTOM_SPEAKERS:
            speaker_of = custom if custom is not None else speakers.auto_speakers(found)
            built = speakers.build_turns(scan, speaker_of)
            turns.append([[text, custom], {"starts": list(built.starts), "speakers": list(built.speakers)}])
            table = speakers.speaker_rows(text, custom)
            rows.append([[text, custom], row_list(table)])
            if text not in with_edits:
                continue
            lookups.append([
                [list(built.starts), list(built.speakers)],
                [[built.speaker_at(i), built.is_turn_start(i)] for i in range(-1, scan.word_count + 2)],
            ])
            whole.append([[text, custom], speakers.transcript_speakers(text, custom)])
            # What the window would save: as shown, then with every row
            # ticked, with none ticked, and with odd names typed in.
            edits = [
                table,
                [dataclass_replace(row, ticked=True) for row in table],
                [dataclass_replace(row, ticked=False) for row in table],
                [dataclass_replace(row, ticked=True, name="  Same   Name  ") for row in table],
                [dataclass_replace(row, name="") for row in table],
                [dataclass_replace(row, name="N" * 29 + " tail") for row in table],
                [dataclass_replace(row, name="\U0001F600" * 29 + "  \U0001F600\U0001F600") for row in table],
            ]
            for edited in edits:
                saved.append([[row_list(edited)], speakers.speakers_to_save(edited)])
                row_names.extend([[row_list([row])[0]], speakers.speaker_row_name(row)] for row in edited)

    def keep_unique(cases):
        seen, kept = set(), []
        for case in cases:
            key = json.dumps(case[0], sort_keys=True)
            if key not in seen:
                seen.add(key)
                kept.append(case)
        return kept

    return {
        "label_key": [call(speakers.label_key, name) for name in names],
        "clean_custom_speakers": [call(speakers.clean_custom_speakers, value) for value in DAMAGED_CUSTOM],
        "scan_speakers": scans,
        "speaker_candidates": candidates,
        "auto_speakers": autos,
        "build_turns": turns,
        "speaker_at_and_is_turn_start": keep_unique(lookups),
        "speaker_rows": rows,
        "speaker_row_name": keep_unique(row_names),
        "speakers_to_save": keep_unique(saved),
        "transcript_speakers": whole,
    }


def dataclass_replace(row, **changes):
    import dataclasses
    return dataclasses.replace(row, **changes)


# --- The reader -------------------------------------------------------------
#
# ReaderSession keeps state, so one call and one answer is not enough. A
# reader fixture is a scenario: the text and options a session is made with,
# then a list of steps. After every step the script records what the session
# shows.

READER_OPTIONS = [
    {},
    {"wpm": 192},
    {"wpm": 960, "length_pacing_enabled": True},
    {"warm_up_enabled": True},
    {"wpm": 250, "length_pacing_enabled": True, "warm_up_enabled": True, "start_index": 3},
    {"chunk_enabled": True, "chunk_size": 2},
    {"chunk_enabled": True, "chunk_size": 3, "warm_up_enabled": True},
    {"chunk_enabled": True, "chunk_size": 5, "length_pacing_enabled": True, "start_index": 4},
    {"chunk_enabled": True, "chunk_size": 2, "chunk_mode": "adaptive", "chunk_char_target": 15},
    {"chunk_enabled": True, "chunk_mode": "adaptive", "chunk_char_target": 30, "start_index": 7},
    {"chunk_enabled": True, "chunk_mode": "adaptive", "chunk_char_target": 60, "speaker_cues_enabled": True},
    {"speaker_cues_enabled": True},
    {"speaker_cues_enabled": True, "chunk_enabled": True, "chunk_size": 3, "length_pacing_enabled": True},
    {"speaker_cues_enabled": True, "speaker_custom": {"dr. smith": "Smith", "smith": "Smith", "ann": "Ann", "bob": "Bob"}},
    {"speaker_cues_enabled": True, "speaker_custom": {}},
    {"speaker_cues_enabled": False, "speaker_custom": {"bob": "Bob"}},
    {"start_index": -5},
    {"start_index": 99999, "chunk_enabled": True, "chunk_size": 2},
    {"chunk_enabled": True, "chunk_size": 1},
    {"chunk_enabled": True, "chunk_size": 0},
    {"chunk_enabled": False, "chunk_mode": "adaptive", "chunk_char_target": 15},
    {"chunk_enabled": True, "chunk_size": 4, "chunk_mode": "something else"},
    # 296 words a minute is 203 ms a word. Times 1.5 or 3.5 that ends in a
    # half, so these catch a port that rounds halves the JavaScript way.
    {"wpm": 296},
    {"wpm": 296, "speaker_cues_enabled": True, "length_pacing_enabled": True},
    {"wpm": 296, "chunk_enabled": True, "chunk_size": 3, "speaker_cues_enabled": True},
]


def light(session):
    """What changes at every step."""
    bounds = session.current_chunk_bounds()
    return [
        session.index, session.is_finished, session.current_delay_ms(), session.current_chunk_delay_ms(),
        session.remaining_ms(), session.current_speaker, list(bounds) if bounds is not None else None,
    ]


def frame_list(frames):
    return None if frames is None else [[f.before, f.focus, f.after] for f in frames]


def detail(session, with_groups, with_texts=False):
    """The rest of what a session shows. The chunk ranges and speaker turns
    cover the whole text, so they are only recorded when they can have
    changed (with_groups)."""
    frame = session.current_frame()
    answer = {
        "frame": None if frame is None else [frame.before, frame.focus, frame.after],
        "chunk": frame_list(session.current_chunk()),
        "around": [list(part) if isinstance(part, list) else part for part in session.peripheral_context(2, 3)],
        "around_chunk": [
            list(part) if isinstance(part, list) else part for part in session.chunk_peripheral_context(2, 3)
        ],
        "around_none": [
            list(part) if isinstance(part, list) else part for part in session.peripheral_context(-1, 0)
        ],
    }
    # With one word per chunk both lists are as long as the text and say
    # nothing new, so the file only notes that it was so. The test builds
    # the lists it expects from the frames.
    ranges_now = [list(pair) for pair in session.chunk_ranges()]
    one_per_word = ranges_now == [[i, i + 1] for i in range(session.total_words)]
    if with_groups:
        answer["chunks"] = "one per word" if one_per_word else ranges_now
    if with_texts:
        answer["chunk_texts"] = (
            "one per word" if one_per_word else [list(triple) for triple in session.chunk_texts()]
        )
    if with_groups:
        answer["turn_starts"] = list(session.speaker_turns.starts)
        answer["turn_speakers"] = list(session.speaker_turns.speakers)
    return answer


def reader_scripts(total):
    """Three lists of steps. Each step is [method, arguments, record detail]."""
    walk = [["advance", [], n in (0, 3)] for n in range(45)]
    walk.append(["advance", [], True])
    jump = [
        ["seek", [3], False], ["seek", [-1], True], ["seek", [100000], False], ["seek", [-100000], False],
        ["seek_to", [total // 2], True], ["advance", [], False], ["seek_to", [total], True], ["seek", [-2], False],
        ["seek_to", [-5], False], ["seek_to", [total - 1], True], ["advance", [], False], ["advance", [], False],
        ["seek", [0], False], ["reset", [], True], ["advance", [], False], ["seek", [1], False],
    ]
    settings = [
        ["advance", [], False], ["advance", [], False], ["set_wpm", [192], False], ["advance", [], False],
        ["set_length_pacing_enabled", [True], False], ["advance", [], False],
        ["set_warm_up_enabled", [True], False], ["advance", [], False],
        ["set_chunking", [True, 3, None, None], "groups"], ["advance", [], False],
        ["set_chunking", [True, 2, "adaptive", 20], "groups"], ["advance", [], False],
        ["set_chunking", [True, 4, "fixed", None], "groups"], ["seek", [-3], False],
        ["set_chunking", [False, 2, None, None], "groups"], ["advance", [], False],
        ["set_speaker_cues", [True, None], "groups"], ["advance", [], False], ["seek_to", [total // 3], False],
        ["set_speaker_cues", [True, {"bob": "Bob", "ann": "Ann", "interviewer": "Host"}], "groups"],
        ["set_chunking", [True, 3, None, 40], "groups"], ["advance", [], False],
        ["set_speaker_cues", [False, None], "groups"], ["advance", [], False],
        ["set_length_pacing_enabled", [False], False], ["set_warm_up_enabled", [False], False],
        ["set_wpm", [960], False], ["reset", [], True], ["advance", [], False],
    ]
    return [walk, jump, settings]


def build_reader(core):
    reader = core.reader
    main_texts = [
        "", "Hello", "--", "-- ... !? ,;:", "Welcome to the show. Today we're talking about RSVP.",
        PROSE, SPEAKER_TRANSCRIPT, SPEAKER_TEXTS[9], SPEAKER_TEXTS[13], SPEAKER_TEXTS[14], SPEAKER_TEXTS[15],
        "I ❤️ reading \U0001F600 fast\U0001F680! \U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600 a\U0001F600b \U0001F468‍\U0001F469‍\U0001F467 ok.",
    ]
    other_texts = [
        "Привет, мир! Как дела? Καλημέρα, κόσμε!",
        "supercalifragilisticexpialidocious pneumonoultramicroscopicsilicovolcanoconiosis a b c d e f g h",
        "anti-dis-establish-ment-arian-ism " + "x" * 200 + " end.",
        YOUTUBE_TRANSCRIPT, SRT_TRANSCRIPT, SPEAKER_TEXTS[1], SPEAKER_TEXTS[3], SPEAKER_TEXTS[7],
        "See ([00:01:23], (1:23), 00:02:45, the notes)",
        "no break ﻿bom next\u0085line \"don't\" $5.99 e.g. a/b",
    ] + random_texts(5, 20261116)

    scenarios = []
    number = 0
    for text_number, text in enumerate(main_texts + other_texts):
        is_main = text_number < len(main_texts)
        for option_number, options in enumerate(READER_OPTIONS):
            # Every option set for the main texts, every fourth for the rest.
            if not is_main and (option_number + text_number) % 4 != 0:
                continue
            session = reader.ReaderSession(text, **options)
            script = reader_scripts(session.total_words)[number % 3]
            number += 1
            scenario = {
                "text": text,
                "options": options,
                "total_words": session.total_words,
                "start": [light(session), detail(session, True, with_texts=is_main)],
                "steps": [],
            }
            if option_number == 0 or not is_main:
                scenario["frames"] = frame_list(session.frames)
            for method, arguments, record in script:
                was_finished = session.is_finished
                getattr(session, method)(*arguments)
                scenario["steps"].append(
                    [method, arguments, light(session), detail(session, record == "groups") if record else None]
                )
                # Walking on long after the end adds nothing.
                if method == "advance" and was_finished and script[0][0] == "advance" and len(script) > 40:
                    break
            scenarios.append(scenario)

    frames_cases = []
    for text in unique(main_texts + other_texts):
        session = reader.ReaderSession(text)
        for size in (0, 1, 2, 3, 5):
            for start in range(0, max(1, session.total_words), 7):
                frames = session.frames[start:start + size]
                frames_cases.append([[frame_list(frames)], list(reader.assemble_chunk_text(frames))])

    return {"scenarios": scenarios, "assemble_chunk_text": frames_cases}


def casefold_table():
    """The source of src/core/pythonCasefoldTable.ts: the characters where
    str.casefold() gives something other than lower-casing that character."""
    def escape(text):
        return "".join(
            f"\\u{ord(ch):04x}" if ord(ch) <= 0xFFFF else f"\\u{{{ord(ch):x}}}" for ch in text
        )

    lines = [
        "// Written by tools/fixtures/generate.py. Do not edit by hand.",
        "//",
        "// Python's str.casefold() is close to lower-casing each character, but",
        "// not the same. This is every character where the two differ, with what",
        f"// casefold() turns it into (Python {EXPECTED_PYTHON[0]}.{EXPECTED_PYTHON[1]}, Unicode {unicodedata.unidata_version}).",
        "",
        "export const CASEFOLD_EXCEPTIONS: Readonly<Record<string, string>> = {",
    ]
    for number in range(0x110000):
        if 0xD800 <= number <= 0xDFFF:
            continue
        ch = chr(number)
        if ch.casefold() != ch.lower():
            lines.append(f"  '{escape(ch)}': '{escape(ch.casefold())}',")
    lines.extend(["};", ""])
    return "\n".join(lines)


def lower_table():
    """The source of src/core/pythonLowerTable.ts: every character that
    str.lower() changes, with what it becomes."""
    def escape(text):
        return "".join(
            f"\\u{ord(ch):04x}" if ord(ch) <= 0xFFFF else f"\\u{{{ord(ch):x}}}" for ch in text
        )

    lines = [
        "// Written by tools/fixtures/generate.py. Do not edit by hand.",
        "//",
        "// Every character Python's str.lower() changes, with what it becomes",
        f"// (Python {EXPECTED_PYTHON[0]}.{EXPECTED_PYTHON[1]}, Unicode {unicodedata.unidata_version}). The port uses this and not the browser's",
        "// toLowerCase(), because a browser with a newer or older Unicode lower-cases",
        "// a different set of characters, and saved keys would stop matching.",
        "",
        "export const LOWER: Readonly<Record<string, string>> = {",
    ]
    for number in range(0x110000):
        if 0xD800 <= number <= 0xDFFF:
            continue
        ch = chr(number)
        if ch.lower() != ch:
            lines.append(f"  '{escape(ch)}': '{escape(ch.lower())}',")
    lines.extend(["};", ""])
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Phase 3: the small library helpers.
# ---------------------------------------------------------------------------

def build_wpm_step(core):
    import core.wpm_step
    step = core.wpm_step.step_wpm
    cases = []
    for wpm in list(range(-25, 46)) + list(range(80, 131)) + list(range(285, 316)) + list(range(975, 1031)):
        for direction in (1, -1):
            cases.append(call(step, wpm, direction))
    # Anything that is not "up" counts as "down", zero included.
    for direction in (0, 2, -5):
        for wpm in (300, 305, 100, 1000):
            cases.append(call(step, wpm, direction))
    return {
        "step_wpm": cases,
        "constants": [[["WPM_KEY_STEP"], core.wpm_step.WPM_KEY_STEP]],
    }


SORT_TITLES = [
    "beta", "Alpha", "gamma", "alpha", "ALPHA", "", " leading space", "10", "9", "Zebra", "apple",
    "Éclair", "eclair", "éclair", "İstanbul", "istanbul", "I", "ı",
    "ΣΑΣ", "σας", "σασ", "straße", "STRASSE", "strasse",
    "ǅ", "ǆ", "￿ last in the BMP", "\U0001F600 emoji", "\U00010400 deseret",
    "\U00010428 deseret", " private", "张三", "_underscore", "~tilde", "Same", "same",
]


def build_transcript_sort(core):
    import core.transcript_sort
    from core.models import Transcript
    module = core.transcript_sort

    def sort_ids(rows, sort_id):
        transcripts = [
            Transcript(id=i, title=title, space="General", times_read=read, total_time_spent_seconds=seconds)
            for i, title, read, seconds in rows
        ]
        return [t.id for t in module.sort_transcripts(transcripts, sort_id)]

    rng = random.Random(3)
    lists = [
        [[1, "beta", 2, 300], [2, "Alpha", 5, 100], [3, "gamma", 1, 900]],
        [[1, "same", 0, 0], [2, "Same", 0, 0], [3, "same", 0, 0]],
        [],
        [[7, "only", 1, 1]],
        [[i + 1, title, 0, 0] for i, title in enumerate(SORT_TITLES)],
    ]
    for _ in range(40):
        count = rng.randint(2, 12)
        ids = rng.sample(range(1, 60), count)
        lists.append([[i, rng.choice(SORT_TITLES), rng.randint(0, 3), rng.choice([0, 0, 60, 61, 3600])] for i in ids])

    sort_ids_cases = []
    for rows in lists:
        for sort_id in list(module.SORT_ORDERS) + ["", "TITLE_AZ", None, 3]:
            sort_ids_cases.append(call(sort_ids, rows, sort_id))

    odd = ["", "Title (A–Z)", "TITLE_AZ", None, 3, ["title_az"], True, "oldest ", 0]
    return {
        "sort_transcripts": sort_ids_cases,
        "known_sort": [call(module.known_sort, value) for value in list(module.SORT_ORDERS) + odd],
        "orders": [[[sort_id], [order.label, order.reverse]] for sort_id, order in module.SORT_ORDERS.items()],
        "constants": [[["DEFAULT_SORT"], module.DEFAULT_SORT]],
    }


def build_storage(core):
    import copy
    from dataclasses import asdict
    import core.storage
    from core.models import Transcript

    def parse_data(data):
        # parse_data() changes what it is given, so it gets a copy and the
        # fixture keeps the input as it was.
        state = core.storage.parse_data(copy.deepcopy(data))
        if state is None:
            return None
        return {**state, "transcripts": [asdict(t) for t in state["transcripts"]]}

    def data(transcripts, **changes):
        base = {"next_id": 5, "current_space_index": 0, "spaces": ["General", "Work"], "transcripts": transcripts}
        base.update(changes)
        return base

    def without(mapping, *keys):
        return {k: v for k, v in mapping.items() if k not in keys}

    small = {"id": 1, "title": "T", "space": "General"}
    full = asdict(Transcript(
        id=2, title="Full é \U0001F600", space="Work", raw_text="Ann: hi\nBob: yo", wpm=450, position=7,
        font_color="#111111", highlight_color="#222222", background_color="#333333", font_size=40,
        is_paused=True, draft_text="draft", is_stopped=True, font_color_is_default=False,
        highlight_color_is_default=True, background_color_is_default=False, times_read=3,
        total_words_read=1200, total_time_spent_seconds=345, pre_normalize_text="before",
        normalized_text="after", chunking_enabled=True, chunk_size=4, chunk_mode="adaptive",
        chunk_char_target=42, speaker_custom={"ann": "Ann", "bob": "Robert"},
    ))
    full["bookmarks"] = [
        {"index": 3, "snippet": "hi there", "created_at": "2026-01-02T03:04:05", "label": "start"},
        {"index": 9},
    ]
    old = {
        "id": 1, "title": "Doc", "space": "General", "raw_text": "hello world", "wpm": 300, "position": 0,
        "font_color": "#FFFFFF", "highlight_color": "#E74C3C", "background_color": "#1E1E1E",
        "font_size": 32, "is_paused": False, "draft_text": "", "is_stopped": False,
    }

    inputs = [
        data([]), data([small]), data([full]), data([small, full]), data([old]),
        # Unknown keys are dropped, on the file, a transcript and a bookmark.
        data([{**small, "from_the_future": 1}], also_new=True),
        data([{**small, "bookmarks": [{"index": 1, "colour": "red"}]}]),
        # The three colour flags: missing means false, present is kept.
        data([{**small, "font_color_is_default": True}]),
        data([{**small, "highlight_color_is_default": False, "background_color_is_default": True}]),
        # Bookmarks in odd shapes.
        data([{**small, "bookmarks": []}]), data([{**small, "bookmarks": None}]),
        data([{**small, "bookmarks": ""}]), data([{**small, "bookmarks": "ab"}]),
        data([{**small, "bookmarks": {}}]), data([{**small, "bookmarks": {"a": 1}}]),
        data([{**small, "bookmarks": [5]}]), data([{**small, "bookmarks": [{}]}]),
        data([{**small, "bookmarks": [{"snippet": "no index"}]}]), data([{**small, "bookmarks": 7}]),
        data([{**small, "bookmarks": [None]}]), data([{**small, "bookmarks": [[1]]}]),
        # The speaker list is cleaned.
        data([{**small, "speaker_custom": None}]), data([{**small, "speaker_custom": {}}]),
        data([{**small, "speaker_custom": {"ann": "  Ann ", "Bad": "X", "bob": 7}}]),
        data([{**small, "speaker_custom": ["ann"]}]), data([{**small, "speaker_custom": "Ann"}]),
        # A transcript that is not whole, or not an object.
        data([without(small, "id")]), data([without(small, "title")]), data([without(small, "space")]),
        data([{}]), data([5]), data([None]), data(["text"]), data([[small]]), data([small, 5]),
        # The list of transcripts in odd shapes.
        data(None), data(""), data("ab"), data({}), data({"a": small}), data(5), data(True),
        # Missing keys at the top.
        without(data([small]), "next_id"), without(data([small]), "current_space_index"),
        without(data([small]), "spaces"), without(data([small]), "transcripts"), {},
        # Not an object at all.
        None, [], [small], "text", 5, True,
        # Values are not checked. See docs/handoff/phase-3.md.
        data([small], next_id="x", current_space_index=-3, spaces="abc"),
        data([small], next_id=None, current_space_index=None, spaces=None),
        data([small], spaces=[]), data([small], current_space_index=99),
        data([{**small, "wpm": "fast", "position": None, "title": 5, "id": "one", "space": "Nowhere"}]),
        data([{**small, "bookmarks": [{"index": "no", "label": 5}]}]),
        data([{**small, "chunk_mode": "sideways", "chunk_size": 99, "is_paused": "yes"}]),
        data([{**small, "wpm": 300.5, "font_size": 1e3}]),
        data([small, small]),
    ]
    return {
        "parse_data": [call(parse_data, value) for value in inputs],
        "constants": [[["LIVE_SAVE_INTERVAL_SECONDS"], core.storage.LIVE_SAVE_INTERVAL_SECONDS]],
    }


def build_bundle(core):
    import copy
    import tempfile
    from dataclasses import asdict
    import core.data_bundle
    import core.storage
    from core.transcript_store import TranscriptStore

    def state_dict(state):
        return {**state, "transcripts": [asdict(t) for t in state["transcripts"]]}

    def parse_bundle(text):
        try:
            bundle = core.data_bundle.parse_bundle(text)
        except core.data_bundle.BundleFormatError as error:
            return ["error", str(error)]
        return ["ok", state_dict(bundle["data"]), bundle["settings"]]

    def fresh_store(folder, data):
        # The store saves into its folder. It gets a temporary one, far from
        # the desktop repository and from the real data folder.
        store = TranscriptStore(data_directory=folder)
        store.replace_all(core.storage.parse_data(copy.deepcopy(data)))
        return store

    def replace_all(data):
        with tempfile.TemporaryDirectory() as folder:
            return fresh_store(folder, data).export_state()

    def merge_all(current, incoming):
        with tempfile.TemporaryDirectory() as folder:
            store = fresh_store(folder, current)
            store.merge_all(core.storage.parse_data(copy.deepcopy(incoming)))
            return store.export_state()

    def data(spaces, transcripts, next_id, index=0):
        return {"next_id": next_id, "current_space_index": index, "spaces": spaces, "transcripts": transcripts}

    def t(i, title, space, **more):
        return {"id": i, "title": title, "space": space, **more}

    mine = data(["General", "Work"], [t(1, "One", "General"), t(4, "Four", "Work", position=9)], 5, 1)
    theirs = data(
        ["General", "Books", "work"],
        [t(1, "A", "General", bookmarks=[{"index": 2, "label": "x"}]), t(2, "B", "Books", wpm=450),
         t(7, "C", "work", speaker_custom={"ann": "Ann"})],
        8, 2,
    )
    empty = data([], [], 1)
    libraries = [mine, theirs, empty, data(["General"], [], 1), data(["Solo"], [t(3, "S", "Solo")], 4, 5),
                 data(["A", "B"], [t(1, "x", "B")], 2, -1)]

    def text(bundle):
        return json.dumps(bundle)

    good = {"bundle_format": 1, "data": theirs, "settings": {"default_wpm": 450, "unknown": [1]}}
    texts = [
        text(good), json.dumps(good, indent=2), text({**good, "extra": 1}),
        text({**good, "data": empty}), text({**good, "settings": {}}),
        # Python's True equals 1, so this one is let in.
        text({**good, "bundle_format": True}),
        # 1. Not JSON.
        "", "not json", "{", "[1, 2,]", "{'bundle_format': 1}", "﻿" + text(good),
        # 2. Not an object, or no bundle_format.
        "null", "5", "\"text\"", "[]", "[1]", "{}", text({"data": theirs, "settings": {}}), "true",
        # 3. Another format.
        text({**good, "bundle_format": 2}), text({**good, "bundle_format": 0}),
        text({**good, "bundle_format": -1}), text({**good, "bundle_format": "1"}),
        text({**good, "bundle_format": "two"}), text({**good, "bundle_format": None}),
        text({**good, "bundle_format": False}), text({**good, "bundle_format": [1]}),
        text({**good, "bundle_format": []}), text({**good, "bundle_format": {"a": "b"}}),
        # 4. data or settings is not an object.
        text({"bundle_format": 1}), text({"bundle_format": 1, "data": theirs}),
        text({"bundle_format": 1, "settings": {}}), text({**good, "data": []}),
        text({**good, "settings": None}), text({**good, "settings": [1]}), text({**good, "data": "x"}),
        # 5. data that parse_data refuses.
        text({**good, "data": {}}), text({**good, "data": data(["General"], [{"id": 1}], 2)}),
        text({**good, "data": data(["General"], [5], 2)}),
    ]
    return {
        "parse_bundle": [call(parse_bundle, value) for value in texts],
        "replace_all": [call(replace_all, value) for value in libraries],
        "merge_all": [call(merge_all, a, b) for a in libraries[:5] for b in libraries],
        "constants": [
            [["BUNDLE_FORMAT_VERSION"], core.data_bundle.BUNDLE_FORMAT_VERSION],
            [["DEFAULT_SPACE"], core.transcript_store.DEFAULT_SPACE],
        ],
    }


def build_case(core):
    """Not a desktop module: what Python's own str.lower() and str.casefold()
    do to every single character, so the port's tables can be checked whole.
    Plus some longer texts, for the sigma at the end of a Greek word."""
    def changed(method):
        return [[cp, method(chr(cp))] for cp in range(sys.maxunicode + 1)
                if not 0xD800 <= cp <= 0xDFFF and method(chr(cp)) != chr(cp)]

    texts = SORT_TITLES + [
        "Σ", "ΑΣ", "ΣΑ", "ΑΣ ΑΣ.", "ΑΣ'Α", "Α'Σ",
        "ΑΣ́", "AΣ", "1Σ", "ΑΣΣ", "ΟΔΥΣΣΕΥΣ",
        "İ", "İ", "ẞ", "ﬁ", "\U00010400\U00010401",
    ]
    return {
        "lower_characters": [[["all"], changed(str.lower)]],
        "casefold_characters": [[["all"], changed(str.casefold)]],
        "lower": [call(str.lower, text) for text in unique(texts)],
        "casefold": [call(str.casefold, text) for text in unique(texts)],
    }


def build_reopen(core):
    import core.reopen
    from core.models import Transcript

    def reopen_id(enabled, last_id, ids):
        transcripts = [Transcript(id=i, title=f"T{i}", space="General") for i in ids]
        found = core.reopen.transcript_to_reopen(enabled, last_id, transcripts)
        return None if found is None else found.id

    cases = []
    for enabled in (True, False):
        for last_id in (None, 0, 1, 2, 99, -1):
            for ids in ([], [1], [1, 2], [2, 1], [5, 99, 0]):
                cases.append(call(reopen_id, enabled, last_id, ids))
    return {"transcript_to_reopen": cases}


MODULES = {
    "charsets": build_charsets,
    "tokenizer": build_tokenizer,
    "parser": build_parser,
    "punctuation": build_punctuation,
    "orp": build_orp,
    "timing": build_timing,
    "speakers": build_speakers,
    "reader": build_reader,
    "wpm_step": build_wpm_step,
    "transcript_sort": build_transcript_sort,
    "reopen": build_reopen,
    "case": build_case,
    "storage": build_storage,
    "bundle": build_bundle,
}


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------

def to_json(meta, functions):
    """The file's text: readable at the top, one case per line below. Plain
    ASCII with \\u escapes, so no editor or Git setting can alter a character."""
    lines = ["{", ' "meta": ' + json.dumps(meta) + ",", ' "functions": {']
    names = list(functions)
    for name in names:
        lines.append("  " + json.dumps(name) + ": [")
        cases = functions[name]
        for index, case in enumerate(cases):
            comma = "," if index < len(cases) - 1 else ""
            lines.append("   " + json.dumps(case, separators=(",", ":")) + comma)
        lines.append("  ]" + ("," if name != names[-1] else ""))
    lines.extend([" }", "}", ""])
    return "\n".join(lines)


def desktop_commit(desktop):
    """The commit the desktop clone is at. Reading it changes nothing there."""
    try:
        done = subprocess.run(
            ["git", "-C", str(desktop), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    return done.stdout.strip()


def main():
    here = Path(__file__).resolve()
    arguments = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    arguments.add_argument("--desktop", required=True, help="path to a clone of rsvp-desktop-reader")
    arguments.add_argument(
        "--out", default=str(here.parents[2] / "fixtures" / "core"),
        help="folder to write the JSON files into (default: fixtures/core in this repository)",
    )
    arguments.add_argument("--any-python", action="store_true", help="run even if this is not Python 3.13")
    options = arguments.parse_args()

    desktop = Path(options.desktop).resolve()
    out = Path(options.out).resolve()

    if not (desktop / "core" / "reader.py").is_file():
        sys.exit(f"{desktop} does not look like the desktop repository (no core/reader.py).")
    if out == desktop or desktop in out.parents:
        sys.exit("The output folder is inside the desktop repository. Nothing may be written there.")
    if sys.version_info[:2] != EXPECTED_PYTHON and not options.any_python:
        sys.exit(
            f"This is Python {sys.version_info[0]}.{sys.version_info[1]}, and the fixtures are made with "
            f"{EXPECTED_PYTHON[0]}.{EXPECTED_PYTHON[1]}. Its Unicode tables may differ. "
            "Use --any-python to run anyway."
        )

    sys.path.insert(0, str(desktop))
    import core.app_info
    import core.orp
    import core.parser
    import core.punctuation
    import core.reader
    import core.speakers
    import core.timing
    import core.tokenizer

    meta = {
        "written_by": "tools/fixtures/generate.py",
        "desktop_repository": "QuiteNew/rsvp-desktop-reader",
        "desktop_commit": desktop_commit(desktop),
        "desktop_version": core.app_info.APP_VERSION,
        "python": f"{sys.version_info[0]}.{sys.version_info[1]}",
        "unicode": unicodedata.unidata_version,
    }

    out.mkdir(parents=True, exist_ok=True)
    for name, build in MODULES.items():
        functions = build(core)
        text = to_json(meta, functions)
        (out / f"{name}.json").write_text(text, encoding="ascii", newline="\n")
        total = sum(len(cases) for cases in functions.values())
        print(f"{name}.json: {total} cases, {len(text) // 1024} KB")

    table = here.parents[2] / "src" / "core" / "pythonCasefoldTable.ts"
    table.write_text(casefold_table(), encoding="ascii", newline="\n")
    print(f"{table.name}: written")
    table = table.with_name("pythonLowerTable.ts")
    table.write_text(lower_table(), encoding="ascii", newline="\n")
    print(f"{table.name}: written")


if __name__ == "__main__":
    main()
