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
- Use a Python that has the desktop app's own packages installed (its
  requirements.txt), the one the desktop app runs with. core/importers.py
  imports lxml, python-docx and pypdf, and the HTML answers depend on the
  lxml version, so importers.json records it.

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
from pathlib import Path, PurePath

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
        # What a reading profile name may hold (core/profiles.py).
        "str_isprintable": ranges(str.isprintable),
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


def build_library(core):
    """The TranscriptStore methods, as scripts: a list of calls made one
    after another on a store that starts empty, with what each call gave
    back and the whole state after it."""
    import tempfile
    from dataclasses import asdict
    from core.transcript_store import TranscriptStore

    def state_of(store):
        state = store.export_state()
        for transcript in state["transcripts"]:
            for bookmark in transcript["bookmarks"]:
                # The time a bookmark was made is "now". The port is handed
                # this same text.
                bookmark["created_at"] = "NOW"
        return state

    def answer(value):
        return asdict(value) if hasattr(value, "__dataclass_fields__") else value

    def play(script):
        # The store saves into its folder. It gets a temporary one, far from
        # the desktop repository and from the real data folder.
        with tempfile.TemporaryDirectory() as folder:
            store = TranscriptStore(data_directory=folder)
            steps = []
            for name, *arguments in script:
                given = getattr(store, name)(*arguments)
                steps.append([answer(given), state_of(store)])
            return steps

    by_hand = [
        [
            ["add_space", "Work"], ["add_space", "  Books  "], ["add_space", "Work"], ["add_space", "   "],
            ["add_space", ""], ["add_space", "work"], ["switch_to_space", "General"],
            ["switch_to_space", "Nowhere"], ["add_transcript", "One", "General"],
            ["add_transcript", "Two", "Work", 450, "#000000", "#111111", "#222222", 40, True, 3, "adaptive", 45],
            ["add_transcript", "Three", "Nowhere"], ["rename_space", "Work", "Office"],
            ["rename_space", "Office", "Office"], ["rename_space", "Office", " Books "],
            ["rename_space", "Office", "  "], ["rename_space", "Gone", "X"], ["rename_space", "General", " Home "],
            ["delete_space", "Office"], ["delete_space", "Books"], ["delete_space", "Gone"],
            ["switch_to_space", "work"], ["delete_space", "work"], ["delete_space", "Home"],
            ["set_transcript_space", 1, "Office"], ["set_transcript_space", 1, "Gone"],
            ["set_transcript_space", 99, "Office"], ["delete_space", "Home"], ["delete_space", "Office"],
            ["delete_transcript", 3], ["delete_transcript", 99], ["delete_transcript", 1],
            ["delete_transcript", 2], ["delete_space", "Office"],
        ],
        [
            ["add_transcript", "T", "General"], ["set_transcript_title", 1, "New title"],
            ["set_transcript_title", 9, "x"], ["set_transcript_text", 1, "Ann: hi\nBob: yo"],
            ["set_transcript_draft_text", 1, "a draft"], ["set_transcript_position", 1, 5],
            ["set_transcript_position", 1, 5], ["set_transcript_wpm", 1, 450], ["set_transcript_paused", 1, True],
            ["set_transcript_stopped", 1, True], ["set_transcript_font_size", 1, 48],
            ["set_transcript_normalization", 1, "before", "after"], ["set_transcript_normalization", 1, "", ""],
            ["set_transcript_chunking", 1, True, 4], ["set_transcript_chunking", 1, True, 3, "adaptive", 40],
            ["set_transcript_chunking", 1, False, 2], ["set_transcript_chunking", 1, True, 5, None, 20],
            ["set_transcript_chunking", 9, True, 5],
            ["set_transcript_speakers", 1, {"ann": " Ann ", "Bad Key": "X", "bob": ""}],
            ["set_transcript_speakers", 1, {}], ["set_transcript_speakers", 1, None],
            ["set_transcript_speakers", 1, "damaged"], ["set_transcript_speakers", 9, {"ann": "Ann"}],
        ],
        [
            ["add_transcript", "A", "General"], ["add_transcript", "B", "General"],
            ["resync_default_reading_colors", "#101010", "#202020", "#303030"],
            ["set_transcript_font_color", 1, "#101010"], ["set_transcript_font_color", 1, "#ABCDEF"],
            ["set_transcript_highlight_color", 1, "#202020"], ["set_transcript_background_color", 2, "#FFFFFF"],
            ["set_transcript_background_color", 2, "#FFFFFF"],
            ["resync_default_reading_colors", "#111111", "#222222", "#333333"],
            ["resync_default_reading_colors", "#111111", "#222222", "#333333"],
            ["set_transcript_highlight_color", 1, "#999999"], ["set_transcript_font_color", 9, "#000000"],
            ["resync_default_reading_colors", "#FFFFFF", "#E74C3C", "#1E1E1E"],
        ],
        [
            ["add_transcript", "A", "General"], ["add_bookmark", 1, 10, "ten"], ["add_bookmark", 1, 3, "three"],
            ["add_bookmark", 1, 10, "again"], ["add_bookmark", 1, 7], ["add_bookmark", 9, 1, "x"],
            ["set_bookmark_label", 1, 3, "start"], ["set_bookmark_label", 1, 3, "start"],
            ["set_bookmark_label", 1, 4, "none"], ["set_bookmark_label", 1, 3, ""],
            ["set_bookmark_label", 9, 3, "x"], ["remove_bookmark", 1, 7], ["remove_bookmark", 1, 7],
            ["remove_bookmark", 9, 3], ["add_bookmark", 1, 0, ""], ["remove_bookmark", 1, 10],
        ],
        [
            ["add_transcript", "A", "General"], ["add_session_stats", 1, 0, 0], ["add_session_stats", 1, 12, 2.9],
            ["add_session_stats", 1, 100, 3], ["add_session_stats", 1, 5, 3.5], ["add_session_stats", 1, 5, 4.5],
            ["add_session_stats", 1, 1, 2.5], ["add_session_stats", 1, 7, 61.49], ["add_session_stats", 9, 7, 60],
        ],
    ]

    rng = random.Random(7)
    names = ["General", "Work", " Books ", "", "work", "Gone"]

    def random_call():
        kind = rng.randrange(12)
        if kind == 0:
            return ["add_space", rng.choice(names)]
        if kind == 1:
            return ["switch_to_space", rng.choice(names)]
        if kind == 2:
            return ["rename_space", rng.choice(names), rng.choice(names + ["Home", "Office"])]
        if kind == 3:
            return ["delete_space", rng.choice(names + ["Home", "Office", "Books"])]
        if kind in (4, 5):
            return ["add_transcript", rng.choice(["One", "Two", ""]), rng.choice(["General", "Work", "Books"])]
        if kind == 6:
            return ["delete_transcript", rng.randint(1, 6)]
        if kind == 7:
            return ["set_transcript_space", rng.randint(1, 6), rng.choice(names + ["Books"])]
        if kind == 8:
            return ["set_transcript_position", rng.randint(1, 6), rng.randint(0, 50)]
        if kind == 9:
            return ["add_bookmark", rng.randint(1, 6), rng.randint(0, 5), rng.choice(["", "words"])]
        if kind == 10:
            return ["remove_bookmark", rng.randint(1, 6), rng.randint(0, 5)]
        return ["set_transcript_wpm", rng.randint(1, 6), rng.choice([100, 300, 1000])]

    scripts = by_hand + [[random_call() for _ in range(30)] for _ in range(12)]
    return {
        "play": [call(play, script) for script in scripts],
        "constants": [
            [["MIN_ACTIVE_SECONDS_TO_COUNT_AS_READ"], TranscriptStore.MIN_ACTIVE_SECONDS_TO_COUNT_AS_READ],
        ],
    }


def build_settings(core):
    import tempfile
    import core.settings_store as settings_store
    from core.settings_store import SettingsStore

    # What the web app reads as settings: every field but the ones that
    # only mean something for a desktop window or a folder on a disk.
    desktop_only = {
        "window_width", "window_height", "window_x", "window_y", "window_maximized",
        "sidebar_width", "bottom_band_height", "freeform_resize_enabled", "data_directory",
    }

    def store_from(folder, text):
        # The store reads and writes settings.json in its folder. It gets a
        # temporary one, far from the desktop repository and the real data.
        if text is not None:
            (Path(folder) / "settings.json").write_text(text, encoding="utf-8")
        return SettingsStore(settings_directory=folder)

    def view(store):
        names = [f for f in store.export_settings() if f not in desktop_only]
        return {name: getattr(store, name) if name != "profiles" else store.export_settings()["profiles"]
                for name in names}

    def defaults():
        with tempfile.TemporaryDirectory() as folder:
            return store_from(folder, None).export_settings()

    def load(text):
        with tempfile.TemporaryDirectory() as folder:
            store = store_from(folder, text)
            if store.damaged_file is not None:
                return None
            return {"saved": store.export_settings(), "view": view(store)}

    def load_saved_only(text):
        with tempfile.TemporaryDirectory() as folder:
            store = store_from(folder, text)
            return None if store.damaged_file is not None else store.export_settings()

    def replace_from_bundle(current_text, incoming):
        with tempfile.TemporaryDirectory() as folder:
            store = store_from(folder, current_text)
            store.replace_from_bundle(json.loads(json.dumps(incoming)))
            return store.export_settings()

    def guide_mark(current_text, method, arguments):
        with tempfile.TemporaryDirectory() as folder:
            store = store_from(folder, current_text)
            getattr(store, method)(*arguments)
            return store.export_settings()

    constants = [[[name], list(getattr(settings_store, name))] for name in (
        "WPM_RANGE", "SKIP_WORD_COUNT_RANGE", "FONT_SIZE_RANGE", "FONT_SIZE_STEP_RANGE",
        "HIGHLIGHT_OFFSET_RANGE", "GUIDE_MARK_THICKNESS_RANGE", "GUIDE_MARK_LENGTH_PERCENT_RANGE",
        "RESUME_REWIND_WORDS_RANGE", "CHUNK_SIZE_RANGE", "CHUNK_CHAR_TARGET_RANGE",
        "LETTER_SPACING_LEVEL_RANGE", "SPEAKER_CUE_SOUNDS", "SPEAKER_CUE_TAG_POSITIONS",
    )]
    constants.append([["CHIME_STYLES"], list(settings_store.CHIME_STYLES)])

    def text(**values):
        return json.dumps(values)

    profile = {"name": "Fast", "values": {"default_wpm": 450}}
    # Every way a saved profile can be wrong: not a profile at all, a name
    # that clashes once case and spaces are set aside, a name too long, values
    # that are not a dict, and values of the wrong kind or for settings a
    # profile no longer holds. Each bad entry goes on its own.
    damaged = [
        "junk", None, profile, {"name": "  fast ", "values": {"default_wpm": 300}},
        {"name": "Old", "values": {"wpm": 600, "skip_word_count": 25, "guide_mark_color": None}},
        {"name": "Bad", "values": "nope"}, {"name": "x" * 31, "values": {}},
        {"name": "  Careful   read ", "values": {"skip_word_count": 1.5, "pause_on_skip": True,
                                                 "guide_mark_color": "#AABBCC"}},
    ]
    custom = text(
        default_wpm=420, default_font_size=40, skip_word_count=5, pause_on_skip=True,
        appearance_mode="dark", guide_mark_color="#112233", guide_mark_color_is_default=False,
        transcript_sort="newest", last_transcript_id=7, reopen_last_transcript=False,
        speaker_cue_sound="per_speaker", speaker_cue_style="glass", profiles=[profile],
        window_width=1200, window_x=40, window_maximized=True,
    )

    load_texts = [
        "{}", json.dumps(defaults()), custom,
        # The flag that came later is worked out from the colour.
        text(guide_mark_color="#112233"), text(guide_mark_color="#3B2E27"),
        text(guide_mark_color="#3B2E27", guide_mark_color_is_default=False),
        text(guide_mark_color="#112233", guide_mark_color_is_default=True),
        # Keys this version does not know are dropped, the rest stays.
        text(header_height=80, default_wpm=350), text(a_setting_from_the_future=[1, 2], pause_on_skip=True),
        text(data_directory="D:/somewhere", default_wpm=350),
        # Profiles: anything that is not a list is no profiles, and each entry
        # of a list is checked on its own.
        text(profiles=None), text(profiles="x"), text(profiles={}), text(profiles=[]),
        text(profiles=[profile]), text(profiles=[profile], something_unknown=1),
        text(profiles=damaged, default_wpm=350),
        # Not settings at all.
        "[]", "null", "5", '"text"', "true", "{", "", "not json", '{"default_wpm": }',
    ]
    # The settings the desktop checks when it reads them.
    for name, values in (
        ("bold_starts_enabled", [True, False, "false", "true", 1, 0, None]),
        ("speaker_cues_enabled", [True, False, "yes", 1, None]),
        ("speaker_cue_sound", ["off", "change", "per_speaker", "loud", "", 5, None, True]),
        ("speaker_cue_style", ["bell", "soft", "glass", "wood", "gong", 2, None]),
        ("speaker_cue_name_tag_enabled", [True, False, 0, None, "false"]),
        ("speaker_cue_tag_position", ["above", "top_right", "left", 1, None]),
        ("speaker_cue_flash_enabled", [True, False, 0, None, "no"]),
        ("reopen_last_transcript", [True, False, 0, None, "false"]),
        ("last_transcript_id", [None, 0, 7, -1, "3", True, False, 2.5]),
        ("transcript_sort", ["title_az", "title_za", "newest", "oldest", "most_read", "most_time",
                             "bogus", "", 5, None]),
    ):
        load_texts += [text(**{name: value}) for value in values]

    # Values the desktop keeps as they are, whatever they are. Only what is
    # saved is recorded for these, because the web cleans what it shows.
    odd_texts = [
        text(default_wpm="fast"), text(default_wpm=5000), text(default_wpm=-1), text(default_wpm=None),
        text(default_font_color=5), text(default_font_color="red"), text(appearance_mode="purple"),
        text(default_chunk_mode="weird"), text(letter_spacing_level=99), text(skip_word_count=0),
        text(pause_on_skip="yes"), text(scrub_pause_enabled=0), text(highlight_offset_px=10),
        text(guide_mark_thickness_px=1), text(resume_rewind_words="3"),
    ]

    bundles = [
        {}, defaults(), json.loads(custom),
        {"default_wpm": 500}, {"default_wpm": 500, "from_a_newer_version": True},
        {"data_directory": "E:/other", "pause_on_skip": True},
        {"profiles": []}, {"profiles": [{"name": "Slow", "values": {"default_wpm": 200}}]},
        {"profiles": "junk"}, {"profiles": None}, {"profiles": damaged},
        {"guide_mark_color": "#445566"}, {"default_wpm": "fast", "skip_word_count": 999},
    ]
    replaces = [call(replace_from_bundle, current, incoming)
                for current in (None, custom) for incoming in bundles]

    following = text(guide_mark_color="#3B2E27", guide_mark_color_is_default=True)
    picked = text(guide_mark_color="#112233", guide_mark_color_is_default=False)
    guide_marks = []
    for current in (None, following, picked):
        for method, arguments in (
            ("set_guide_mark_color", ["#3B2E27"]), ("set_guide_mark_color", ["#112233"]),
            ("set_guide_mark_color", ["#ABCDEF"]),
            ("restore_guide_mark_color", ["#ABCDEF", True]), ("restore_guide_mark_color", ["#ABCDEF", False]),
            ("restore_guide_mark_color", ["#112233", True]),
            ("resync_guide_mark_color_default", ["#F2E9DC"]), ("resync_guide_mark_color_default", ["#3B2E27"]),
            ("resync_guide_mark_color_default", ["#112233"]),
        ):
            guide_marks.append(call(guide_mark, current, method, arguments))

    # Reading profiles (phase 6): the store's profile methods, driven through
    # a script aimed at what the desktop's own tests leave out. Blank, padded
    # and non-text names, names that only match once case is folded the
    # Python way, and an unknown name for every method. Each step is recorded
    # the way desktop_tests.json records a profile call: the profiles before,
    # the method and its arguments, then "ok" and what came back, or "error"
    # and the message, with the profiles after.
    import copy
    from core.profiles import ProfileError

    def profile_step(store, method, arguments):
        before = copy.deepcopy(store.export_settings()["profiles"])
        try:
            answer = getattr(store, method)(*arguments)
            outcome = ["ok", None if answer is None else answer.to_dict()]
        except ProfileError as error:
            outcome = ["error", str(error)]
        return [[before, method, list(arguments)], outcome + [store.export_settings()["profiles"]]]

    script = [
        ("get_profile", ["A"]), ("update_profile", ["A", {}]), ("rename_profile", ["A", "B"]),
        ("delete_profile", ["A"]),
        ("add_profile", ["Fast skim", {"skip_word_count": 25, "guide_mark_color": None, "wpm": 600}]),
        ("add_profile", ["  Careful \t read  ", {"pause_on_skip": True, "letter_spacing_level": 2,
                                                  "dyslexia_font_enabled": True}]),
        ("add_profile", ["New", "not a dict"]), ("add_profile", [42, {}]), ("add_profile", ["\ufeffFast", {}]),
        ("add_profile", ["x" * 31, {}]), ("add_profile", ["\U0001f600" * 30, {"font_size_step": 3}]),
        ("add_profile", ["Stra\u00dfe", {}]), ("add_profile", ["STRASSE", {}]),
        ("add_profile", ["\ufb01le", {"skip_word_count": 3}]), ("add_profile", ["FILE", {}]),
        ("add_profile", ["\u212aelvin", {}]), ("add_profile", ["kelvin", {}]),
        ("add_profile", ["\u0130stanbul", {}]), ("add_profile", ["istanbul", {}]),
        ("get_profile", [""]), ("get_profile", ["   "]), ("get_profile", [" fast  SKIM "]),
        ("get_profile", ["STRASSE"]), ("get_profile", ["file"]), ("get_profile", ["KELVIN"]),
        ("get_profile", [42]), ("get_profile", ["Nope"]), ("get_profile", ["i\u0307stanbul"]),
        ("update_profile", [" FAST skim ", {"skip_word_count": 7, "made_up": 1}]),
        ("update_profile", ["", {}]), ("update_profile", ["   ", {}]), ("update_profile", ["file", None]),
        ("rename_profile", ["fast skim", "  FAST   SKIM "]), ("rename_profile", ["FAST SKIM", "strasse"]),
        ("rename_profile", ["Stra\u00dfe", "STRASSE"]), ("rename_profile", ["kelvin", "KELVIN"]),
        ("rename_profile", ["Nope", "x"]), ("rename_profile", ["file", "x" * 31]),
        ("rename_profile", ["file", ""]), ("rename_profile", ["file", "Fast\x00skim"]),
        ("rename_profile", ["careful read", "Careful read"]),
        ("delete_profile", ["   "]), ("delete_profile", ["istanbul"]), ("delete_profile", ["i\u0307stanbul"]),
        ("delete_profile", ["\u0130STANBUL"]), ("add_profile", ["\u0130stanbul", {"warm_up_enabled": True}]),
        ("delete_profile", ["FAST SKIM"]), ("add_profile", ["fast skim", {}]),
    ]
    profile_steps = []
    with tempfile.TemporaryDirectory() as folder:
        store = store_from(folder, None)
        for method, arguments in script:
            profile_steps.append(profile_step(store, method, arguments))

    return {
        "constants": constants,
        "defaults": [call(defaults)],
        "load": [call(load, t) for t in load_texts],
        "load_saved_only": [call(load_saved_only, t) for t in odd_texts],
        "replace_from_bundle": replaces,
        "guide_mark": guide_marks,
        "profile_steps": profile_steps,
    }


# ---------------------------------------------------------------------------
# Phase 3: the normalizer.
# ---------------------------------------------------------------------------

def digit_table():
    """The source of src/core/pythonDigitTable.ts: what str.isdigit() and
    int() know about digits that JavaScript has no way to ask for."""
    zeros, digits, start, previous = [], [], None, None
    for number in range(0x110000):
        ch = chr(number)
        if ch.isdecimal() and unicodedata.decimal(ch) == 0:
            zeros.append(number)
        if ch.isdigit():
            if start is None:
                start = number
            previous = number
        elif start is not None:
            digits.append((start, previous))
            start = None
    lines = [
        "// Written by tools/fixtures/generate.py. Do not edit by hand.",
        "//",
        f"// Digits as Python {EXPECTED_PYTHON[0]}.{EXPECTED_PYTHON[1]} knows them (Unicode {unicodedata.unidata_version}).",
        "",
        "// The first and last code point of every run of characters that",
        "// str.isdigit() is true for. That is more than 0 to 9 in every script:",
        "// a superscript two and a circled one are digits too.",
        "export const DIGIT_RANGES: readonly (readonly [number, number])[] = [",
    ]
    lines += [f"  [0x{first:x}, 0x{last:x}]," for first, last in digits]
    lines += [
        "];",
        "",
        "// The code point of the zero of every script's decimal digits. The nine",
        "// that follow each zero are its 1 to 9, which is how int() reads them.",
        "export const DECIMAL_ZEROS: readonly number[] = [",
    ]
    lines += ["  " + ", ".join(f"0x{zero:x}" for zero in zeros[i:i + 8]) + "," for i in range(0, len(zeros), 8)]
    lines += ["];", ""]
    return "\n".join(lines)


def printable_table():
    """The source of src/core/pythonPrintableTable.ts: which characters
    str.isprintable() is true for. A browser can be asked about Unicode
    categories with \\p{...}, but its Unicode tables are newer than Python's,
    and every character given out since then is one Python says cannot be
    shown. So the list comes from Python, as it is."""
    runs = ranges(str.isprintable)
    lines = [
        "// Written by tools/fixtures/generate.py. Do not edit by hand.",
        "//",
        f"// Printable characters as Python {EXPECTED_PYTHON[0]}.{EXPECTED_PYTHON[1]} knows them (Unicode {unicodedata.unidata_version}).",
        "",
        "// The first and last code point of every run of characters that",
        "// str.isprintable() is true for, in order. Everything else is a",
        "// control or format character, a space other than the plain one, a",
        "// private use character, half of a surrogate pair, or a character that",
        "// had not been given out yet. Four runs to a line.",
        "export const PRINTABLE_RANGES: readonly (readonly [number, number])[] = [",
    ]
    for i in range(0, len(runs), 4):
        lines.append("  " + " ".join(f"[0x{first:x}, 0x{last:x}]," for first, last in runs[i:i + 4]))
    lines += ["];", ""]
    return "\n".join(lines)


NORMALIZER_PIECES = [
    # List markers of every kind, at the start of a line and inside one.
    "1. Mix", "2. Bake", "3. Eat", "1) First", "2) Second", "(1) One", "[2] Two", "1: Intro",
    "1.3: Methods", "1.1 Scope", "1.2 Terms", "0.50 0.25", "3.14 is pi", "12", "1990. A year.",
    "- Apples", "* Pears", "– Plums", "• Figs", "●", "✓ done", "[X] Cats", "[ ] Dogs",
    "[x]", "[X].", "a) Apples", "b) Pears", "A. Smith said", "I. M. Pei", "i. Alpha", "ii. Beta",
    "IV. Four", "(iv) four", "(b) bee", "1.", "2.", "v2.", "(2)", "p. 12.", "Fig. 3.", "Vol. 2.",
    "see no. 1. and 2.", "Steps: 1. Mix 2. Bake 3. Eat", "1) 2) 3)", "1. 2. 3.",
    # Headings.
    "Part 1: Introduction", "Chapter IV", "Section 2.1 Scope", "Appendix A", "Step 3", "Part of the plan.",
    "CHAPTER 2", "lesson 5.", "Unit 7-", "Book one", "Module X)",
    # Python's ignore-case has a few pairs JavaScript's does not.
    "ſection 2", "BooK 3", "Unİt 4", "Unıt 5", "fİg. 3.", "ſec. 2.",
    # Timestamps.
    "[00:01:23]", "(1:23)", "00:02:45", "0:05", "10:30 we met", "00:00:01,000 --> 00:00:04,000",
    "[00:01:23] Welcome.", "text [00:01:23], more",
    # PDF damage.
    "ef�icient", "ﬂow", "ﬁne", "oﬃce", "�", "�low",
    # Sentences and line ends.
    "This sentence was", "broken in the middle.", "and then we went", "to the store,", "infor-",
    "mation overload", "well-", "known", "Hello world.", "Introduction", "said: \"yes.\"", "(done.)",
    "wait…", "wait...", "really?!", "end;", "\"quoted start", "'single", "“curly", "(paren",
    "Dr. Smith", "e.g. this", "the U.S. Army", "J. W. Forrester", "at 5 p.m. Then",
    # Digits that are not 0 to 9, and letters Python and JavaScript may sort differently.
    "٣. three", "١. one ٢. two", "² squared", "① circled", "１. wide",
    "école", "École", "ʕ", "ª", "ǅ", "\U0001d7ce1. zero",
    # Whitespace Python and JavaScript disagree about, and line ends.
    "\x0b", "\x0c", "\x1c", "\x1d", "\x85", "\xa0", " ", " ", "﻿", "　", "\t",
    "\r", "\r\n", "  ", "",
    # Characters that count as one in Python and two in JavaScript.
    "\U0001F600", "\U0001F600.", "\U0001F468‍\U0001F469",
]

NORMALIZER_SENTENCES = [
    "The quick brown fox jumps over the lazy dog near the river bank today.",
    "Dr. Smith of Acme Inc. went to the U.S. office, e.g. the big one.",
    "It was a long pause ... Then it carried on for a good while longer.",
    "\"Is that so?\" she asked. “Yes,” he said!",
    "The value of pi is 3.14 in the notes (see p. 12.) and so on.",
    "\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600 A sentence after five faces.",
    "J. W. Forrester noted it at 5 p.m. Later it changed.",
    "short one.", "And a Capital start? Yes! No.", "An ending bracket.) Next (one.",
]


def build_normalizer(core):
    import pytest
    import core.normalizer as normalizer

    desktop = Path(normalizer.__file__).resolve().parents[1]

    def toggle(*arguments):
        result = normalizer.toggle_normalization(*arguments)
        return [result.text, result.pre_normalize_text, result.normalized_text]

    rng = random.Random(20261116)

    def made_up(pieces, count, longest):
        return [
            "".join(rng.choice(pieces) + rng.choice([" ", " ", "\n", "\n", "\n\n", ""]) for _ in range(rng.randint(0, longest)))
            for _ in range(count)
        ]

    texts = made_up(NORMALIZER_PIECES, 600, 14)
    # One piece at a time, alone and between two plain lines.
    for piece in NORMALIZER_PIECES:
        texts += [piece, f"Before\n{piece}\nafter it.", f"Before {piece} after it", f"{piece}\n{piece}"]
    # Walls of prose, with lengths around the 400 characters that matter.
    walls = [" ".join(rng.choice(NORMALIZER_SENTENCES) for _ in range(rng.randint(1, 16))) for _ in range(100)]
    walls += ["\n".join(rng.choice(NORMALIZER_SENTENCES) for _ in range(rng.randint(3, 14))) for _ in range(40)]
    for size in range(395, 406):
        walls.append(("Ab cd. " * 80)[:size - 3] + " X.")
        walls.append("\U0001F600" * (size - 12) + ". Two x. Three.")
    walls.append("x" * 500)
    walls.append("A b. " * 200)

    normalize = [call(normalizer.normalize_transcript, text, False) for text in unique(texts)]
    normalize += [call(normalizer.normalize_transcript, text, True) for text in unique(walls + texts[:150])]

    lines = unique(line for text in texts[:250] for line in text.split("\n"))
    toggles = []
    for text in unique(texts[:60] + walls[:10]):
        first = toggle(text, "", "")
        toggles.append([[text, "", "", False], first])
        toggles.append([[first[0] + "\n", first[1], first[2], False], toggle(first[0] + "\n", first[1], first[2])])
        toggles.append([[first[0] + " edited", first[1], first[2], True], toggle(first[0] + " edited", first[1], first[2], True)])
    reverts = [call(normalizer.can_revert, *arguments) for arguments in (
        ("Buy milk\n\nBuy eggs", "1. Buy milk\n2. Buy eggs", "Buy milk\n\nBuy eggs"),
        ("Buy milk\n\nBuy eggs\n", "1. Buy milk\n2. Buy eggs", "Buy milk\n\nBuy eggs"),
        (" \x1c\x85Buy milk　\n", "x", "Buy milk"), ("﻿Buy milk", "x", "Buy milk"),
        ("Buy milk\n\nBuy bread", "1. Buy milk\n2. Buy eggs", "Buy milk\n\nBuy eggs"),
        ("Buy milk", "", ""), ("", "", ""), ("", "x", ""), ("a", "x", "a "),
    )]

    # The desktop's own tests, run as they are. Every call they make to the
    # normalizer is written down with what it returned. A test that passes
    # there and whose calls give the same here holds here too.
    recorded = {}

    class Recorder:
        @pytest.hookimpl(hookwrapper=True)
        def pytest_runtest_call(self, item):
            calls = recorded.setdefault(item.name, [])
            module = item.module

            def watched(name, shape):
                real = getattr(normalizer, name)

                def run(*arguments, **named):
                    result = real(*arguments, **named)
                    split = named.get("split_long_paragraphs", False)
                    calls.append([name, list(arguments) + ([split] if "split_long_paragraphs" in named else []), shape(result)])
                    return result
                return run

            originals = {name: getattr(module, name) for name in ("normalize_transcript", "toggle_normalization", "can_revert")}
            module.normalize_transcript = watched("normalize_transcript", lambda text: text)
            module.toggle_normalization = watched(
                "toggle_normalization", lambda r: [r.text, r.pre_normalize_text, r.normalized_text])
            module.can_revert = watched("can_revert", bool)
            try:
                outcome = yield
            finally:
                for name, original in originals.items():
                    setattr(module, name, original)
            if outcome.excinfo is not None:
                raise SystemExit(f"the desktop test {item.name} failed, so it cannot be recorded")

    status = pytest.main(
        [str(desktop / "tests" / "test_normalizer.py"), "-q", "--no-header", "-p", "no:cacheprovider",
         "--noconftest", "--rootdir", str(desktop), "-o", "addopts="],
        plugins=[Recorder()],
    )
    if status != 0:
        raise SystemExit(f"pytest ended with status {status} on the desktop's test_normalizer.py")

    return {
        "normalize_transcript": normalize,
        "_split_numbered_run": [call(normalizer._split_numbered_run, line) for line in lines],
        "_split_sentences": [call(normalizer._split_sentences, wall) for wall in unique(walls)],
        "can_revert": reverts,
        "toggle_normalization": toggles,
        "desktop_tests": [[[name], calls] for name, calls in recorded.items()],
    }


# ---------------------------------------------------------------------------
# Phase 3: the desktop's own tests for the stores, run as they are.
# ---------------------------------------------------------------------------

DESKTOP_STORE_TESTS = [
    "test_transcript_store.py", "test_storage.py", "test_damaged_files.py", "test_data_bundle.py",
    "test_transcript_speaker_list.py", "test_chunking.py", "test_models.py",
    "test_settings_store.py", "test_settings_store_bold_starts.py", "test_settings_store_dyslexia.py",
    "test_settings_store_speaker_cues.py", "test_settings_store_profiles.py",
]

# The TranscriptStore methods that change the library. Each has a pure
# function in src/core/library.ts.
RECORDED_STORE_METHODS = [
    "add_space", "switch_to_space", "rename_space", "delete_space", "add_transcript", "delete_transcript",
    "set_transcript_title", "set_transcript_space", "set_transcript_text", "set_transcript_draft_text",
    "set_transcript_position", "set_transcript_wpm", "set_transcript_paused", "set_transcript_stopped",
    "set_transcript_font_size", "set_transcript_font_color", "set_transcript_highlight_color",
    "set_transcript_background_color", "resync_default_reading_colors", "set_transcript_normalization",
    "set_transcript_chunking", "set_transcript_speakers", "add_bookmark", "remove_bookmark",
    "set_bookmark_label", "add_session_stats", "replace_all", "merge_all",
]

# The settings the desktop checks when it reads them.
CHECKED_SETTINGS = [
    "bold_starts_enabled", "speaker_cues_enabled", "speaker_cue_sound", "speaker_cue_style",
    "speaker_cue_name_tag_enabled", "speaker_cue_tag_position", "speaker_cue_flash_enabled",
    "reopen_last_transcript", "last_transcript_id", "transcript_sort",
]


def build_desktop_tests(core):
    """Runs the desktop's store and settings tests with pytest, as they are,
    and writes down what they ask of the code that has a port: every change
    to a TranscriptStore, every parse_data and save_state, every bundle read
    or built, and every SettingsStore load, Replace and guide mark change.
    Only tests that pass are kept. The web tests replay each call."""
    import copy
    import inspect
    import pytest
    from dataclasses import asdict, is_dataclass
    import core.data_bundle as data_bundle
    import core.settings_store as settings_store
    import core.storage as storage
    from core.profiles import ProfileError
    from core.settings_store import SettingsStore
    from core.transcript_store import TranscriptStore

    desktop = Path(storage.__file__).resolve().parents[1]

    class NotRecordable(Exception):
        pass

    def plain(value):
        """The value as JSON can hold it, or NotRecordable."""
        if is_dataclass(value) and not isinstance(value, type):
            value = asdict(value)
        if isinstance(value, dict):
            if not all(isinstance(key, str) for key in value):
                raise NotRecordable
            return {key: plain(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [plain(item) for item in value]
        if value is None or isinstance(value, (bool, int, str)):
            return value
        if isinstance(value, float) and value == value and abs(value) != float("inf"):
            return value
        raise NotRecordable

    def with_now(state):
        """A bookmark is stamped with the time it was made. The port is
        handed the text "NOW", so every stamp is recorded as that."""
        for transcript in state.get("transcripts", []) if isinstance(state, dict) else []:
            if isinstance(transcript, dict):
                for bookmark in transcript.get("bookmarks") or []:
                    if isinstance(bookmark, dict) and "created_at" in bookmark:
                        bookmark["created_at"] = "NOW"
        return state

    events = {name: [] for name in (
        "store_step", "parse_data", "save_state", "parse_bundle", "build_bundle",
        "settings_load", "settings_replace", "settings_guide_mark", "settings_profile",
    )}
    left_out = {"not JSON": 0}
    now = {"test": None, "events": [], "busy": False}

    def record(kind, arguments, result):
        now["events"].append((kind, arguments, result))

    def recording():
        return now["test"] is not None and not now["busy"]

    def watch_store(name):
        real = getattr(TranscriptStore, name)
        signature = inspect.signature(real)

        def run(self, *arguments, **named):
            if not recording():
                return real(self, *arguments, **named)
            ready = None
            try:
                bound = signature.bind(self, *arguments, **named)
                bound.apply_defaults()
                given = plain(copy.deepcopy(list(bound.arguments.values())[1:]))
                if name in ("replace_all", "merge_all"):
                    given = [with_now(given[0])]
                ready = (with_now(plain(self.export_state())), given)
            except NotRecordable:
                left_out["not JSON"] += 1
            now["busy"] = True
            try:
                answer = real(self, *arguments, **named)
            finally:
                now["busy"] = False
            if ready is not None:
                answer = plain(answer)
                if name == "add_transcript":
                    answer = with_now({"transcripts": [answer]})["transcripts"][0]
                record("store_step", [ready[0], name, ready[1]], [answer, with_now(plain(self.export_state()))])
            return answer if name != "add_transcript" else self._find_transcript(answer["id"])
        return run

    real_parse_data = storage.parse_data

    def parse_data(data):
        given = None
        if now["test"] is not None:
            try:
                given = [plain(copy.deepcopy(data))]
            except NotRecordable:
                left_out["not JSON"] += 1
        result = real_parse_data(data)
        if given is not None:
            record("parse_data", given, None if result is None else plain(result))
        return result

    real_save_state = storage.save_state

    def save_state(directory, *arguments, **named):
        real_save_state(directory, *arguments, **named)
        if now["test"] is not None:
            written = json.loads((Path(directory) / "data.json").read_text(encoding="utf-8"))
            record("save_state", [written], written)

    real_parse_bundle = data_bundle.parse_bundle

    def parse_bundle(json_text):
        try:
            bundle = real_parse_bundle(json_text)
        except data_bundle.BundleFormatError as error:
            if now["test"] is not None and isinstance(json_text, str):
                record("parse_bundle", [json_text], ["error", str(error)])
            raise
        if now["test"] is not None and isinstance(json_text, str):
            record("parse_bundle", [json_text], ["ok", plain(bundle["data"]), plain(bundle["settings"])])
        return bundle

    real_build_bundle = data_bundle.build_bundle

    def build_bundle(transcript_store, settings_store_):
        bundle = real_build_bundle(transcript_store, settings_store_)
        if now["test"] is not None:
            record(
                "build_bundle",
                [plain(transcript_store.export_state()), plain(settings_store_.export_settings())],
                plain(bundle),
            )
        return bundle

    real_settings_init = SettingsStore.__init__

    def settings_init(self, settings_directory=None):
        text = None
        known = settings_directory is not None and now["test"] is not None
        if known:
            file = Path(settings_directory) / "settings.json"
            if file.exists():
                try:
                    text = file.read_bytes().decode("utf-8")
                    text.encode("utf-8")
                except UnicodeError:
                    known = False
        real_settings_init(self, settings_directory)
        if not known or text is None:
            return
        if self.damaged_file is not None:
            record("settings_load", [text], None)
            return
        try:
            saved = plain(self.export_settings())
            view = plain({name: getattr(self, name) for name in CHECKED_SETTINGS})
        except NotRecordable:
            left_out["not JSON"] += 1
            return
        record("settings_load", [text], {"saved": saved, "view": view})

    def watch_settings(name, kind):
        real = getattr(SettingsStore, name)

        def run(self, *arguments):
            if now["test"] is None:
                return real(self, *arguments)
            try:
                before = plain(self.export_settings())
                given = plain(copy.deepcopy(list(arguments)))
            except NotRecordable:
                left_out["not JSON"] += 1
                return real(self, *arguments)
            answer = real(self, *arguments)
            try:
                after = plain(self.export_settings())
            except NotRecordable:
                left_out["not JSON"] += 1
                return answer
            if kind == "settings_replace":
                record(kind, [before, given[0]], after)
            else:
                record(kind, [before, name, given], after)
            return answer
        return run

    def watch_profiles(name):
        """The store's reading profile methods. They change the list of
        profiles and nothing else, so only that list is recorded, before and
        after, and the script stops if any other setting moved. A ProfileError
        is recorded with its message, which the port has to match too."""
        real = getattr(SettingsStore, name)
        signature = inspect.signature(real)

        def others(settings):
            return {key: value for key, value in settings.items() if key != "profiles"}

        def run(self, *arguments, **named):
            if not recording():
                return real(self, *arguments, **named)
            try:
                bound = signature.bind(self, *arguments, **named)
                bound.apply_defaults()
                given = plain(copy.deepcopy(list(bound.arguments.values())[1:]))
                before = plain(self.export_settings())
            except NotRecordable:
                left_out["not JSON"] += 1
                return real(self, *arguments, **named)
            # Any other exception is the test's business, and nothing is
            # recorded for it.
            outcome = None
            now["busy"] = True
            try:
                answer = real(self, *arguments, **named)
                outcome = ["ok", plain(answer)]
            except ProfileError as error:
                outcome = ["error", str(error)]
                raise
            finally:
                now["busy"] = False
                if outcome is not None:
                    after = plain(self.export_settings())
                    if others(after) != others(before):
                        raise SystemExit(f"{name} changed settings other than the profiles")
                    record("settings_profile", [before["profiles"], name, given], outcome + [after["profiles"]])
            return answer
        return run

    originals = []

    def swap(owner, name, replacement):
        originals.append((owner, name, getattr(owner, name)))
        setattr(owner, name, replacement)

    # A bookmark is stamped with the time it is made, and those stamps end
    # up in saved files and bundles. The clock stands still while the tests
    # run, so the fixture comes out the same on every run.
    import datetime as datetime_module
    import core.transcript_store as transcript_store_module

    class StoppedClock(datetime_module.datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 1, 1, 12, 0, 0, tzinfo=tz)

    swap(transcript_store_module, "datetime", StoppedClock)
    for name in RECORDED_STORE_METHODS:
        swap(TranscriptStore, name, watch_store(name))
    swap(storage, "parse_data", parse_data)
    swap(storage, "save_state", save_state)
    swap(data_bundle, "parse_bundle", parse_bundle)
    swap(data_bundle, "build_bundle", build_bundle)
    swap(SettingsStore, "__init__", settings_init)
    swap(SettingsStore, "replace_from_bundle", watch_settings("replace_from_bundle", "settings_replace"))
    for name in ("set_guide_mark_color", "restore_guide_mark_color", "resync_guide_mark_color_default"):
        swap(SettingsStore, name, watch_settings(name, "settings_guide_mark"))
    for name in ("get_profile", "add_profile", "update_profile", "rename_profile", "delete_profile"):
        swap(SettingsStore, name, watch_profiles(name))
    # Modules that took a function by name hold the old one. Give them the new.
    by_name = {real_parse_data: parse_data, real_save_state: save_state,
               real_parse_bundle: parse_bundle, real_build_bundle: build_bundle}

    tests = []
    seen = set()

    class Recorder:
        def pytest_collection_modifyitems(self, items):
            for module in {item.module for item in items} | {sys.modules["core.transcript_store"]}:
                for name, value in list(vars(module).items()):
                    if inspect.isfunction(value) and value in by_name:
                        swap(module, name, by_name[value])

        @pytest.hookimpl(hookwrapper=True)
        def pytest_runtest_call(self, item):
            now["test"], now["events"] = item.name, []
            try:
                outcome = yield
            finally:
                now["test"] = None
            passed = outcome.excinfo is None
            kept = 0
            if passed:
                for kind, arguments, result in now["events"]:
                    key = json.dumps([kind, arguments, result], sort_keys=True)
                    if key not in seen:
                        seen.add(key)
                        events[kind].append([[item.name, *arguments], result])
                        kept += 1
            tests.append([[item.path.name, item.name], [passed, len(now["events"]), kept]])

    try:
        status = pytest.main(
            [str(desktop / "tests" / name) for name in DESKTOP_STORE_TESTS]
            + ["-q", "--no-header", "-p", "no:cacheprovider", "--noconftest",
               "--rootdir", str(desktop), "-o", "addopts="],
            plugins=[Recorder()],
        )
    finally:
        for owner, name, original in reversed(originals):
            setattr(owner, name, original)
    print(f"desktop store tests: pytest status {status}, left out {left_out}")

    return {**events, "tests": tests}


# ---------------------------------------------------------------------------
# Phase 4: the reading experience.
# ---------------------------------------------------------------------------

def record_desktop_tests(test_file, module, shapes):
    """Runs one of the desktop's test files with pytest, as it is, and
    returns what each test asked of `module`: for every function named in
    `shapes`, the arguments and the answer (passed through the shape, which
    turns it into something JSON can hold). A test that fails stops the
    run, because a recording of a failing test proves nothing."""
    import pytest

    desktop = Path(module.__file__).resolve().parents[1]
    recorded = {}

    class Recorder:
        @pytest.hookimpl(hookwrapper=True)
        def pytest_runtest_call(self, item):
            calls = recorded.setdefault(item.name, [])

            def watched(name):
                real = getattr(module, name)

                def run(*arguments, **keywords):
                    result = real(*arguments, **keywords)
                    # Tests often name the optional arguments. They are
                    # written down as a fourth item, only when there are some.
                    call_record = [name, list(arguments), shapes[name](result)]
                    if keywords:
                        call_record.append(keywords)
                    calls.append(call_record)
                    return result
                return run

            originals = {name: getattr(item.module, name) for name in shapes}
            for name in shapes:
                setattr(item.module, name, watched(name))
            try:
                outcome = yield
            finally:
                for name, original in originals.items():
                    setattr(item.module, name, original)
            if outcome.excinfo is not None:
                raise SystemExit(f"the desktop test {item.name} failed, so it cannot be recorded")

    status = pytest.main(
        [str(desktop / "tests" / test_file), "-q", "--no-header", "-p", "no:cacheprovider",
         "--noconftest", "--rootdir", str(desktop), "-o", "addopts="],
        plugins=[Recorder()],
    )
    if status != 0:
        raise SystemExit(f"pytest ended with status {status} on the desktop's {test_file}")
    return [[[name], calls] for name, calls in recorded.items()]


def build_colors(core):
    import core.colors as colors

    rng = random.Random(4)
    palette = [
        "#000000", "#FFFFFF", "#ffffff", "#3B2E27", "#D98A3D", "#F6EFE3", "#1E1E1E", "#E74C3C",
        "#000", "#fff", "#f00", "#00F", "abc", "ABCDEF", "0a0b0c", "##112233", "#11223344",
    ]
    ratios = [0, 0.0, 1, 1.0, 0.5, 0.25, 0.75, 0.55, 0.18, 0.3, 0.45, -1.0, 2.0, -0.0, 1e-9, 0.999999]
    blends = [call(colors.blend_colors, a, b, ratio) for a in palette[:9] for b in palette[:9] for ratio in ratios[:8]]
    blends += [call(colors.blend_colors, rng.choice(palette), rng.choice(palette), rng.choice(ratios)) for _ in range(150)]
    # Halves, where rounding to the even number shows: 1 and 2 at one half
    # is 1.5, which rounds to 2, and 2 and 3 is 2.5, which also rounds to 2.
    for low in range(0, 255, 7):
        blends.append(call(colors.blend_colors, f"#{low:02X}0000", f"#{low + 1:02X}0000", 0.5))
    for _ in range(300):
        a, b = (f"#{rng.randrange(0x1000000):06X}" for _ in range(2))
        blends.append(call(colors.blend_colors, a, b, rng.random()))
    # Not colours: the desktop raises ValueError for each of these.
    broken = ["", "#", "#12", "#1234", "#12345", "#GGGGGG", "#12345G", "xyz", "#zzz", "red"]
    blends += [call(colors.blend_colors, bad, "#000000", 0.5) for bad in broken]
    blends += [call(colors.blend_colors, "#000000", bad, 0.5) for bad in broken]

    return {
        "blend_colors": blends,
        "_channels": [call(lambda value: list(colors._channels(value)), value) for value in palette + broken],
        "desktop_tests": record_desktop_tests(
            "test_colors.py", colors, {"blend_colors": lambda text: text, "_channels": list}),
    }


def build_settings_search(core):
    import core.settings_search as search

    rng = random.Random(5)
    queries = [
        "", "   ", "\t\n", "speed", "SPEED", "Speed", "  guide   MARK\tcolour ", "guid", "ark", "colour mark",
        "mark speed", "zebra", "markcolour", "half", "ease half", "crosshair", "horizontal crosshair",
        "straße", "STRASSE", "ss", "ß", "σ", "Σ", "ς", "ΟΔΟΣ", "ΟΔΟς", "İ", "i̇", "i", "ı", "I",
        "fi", "ﬁ", "\u00a0", "a\u00a0b", "a\u2003b", "a\x1cb", "a\x85b", "a\u200bb", "a\u180eb",
        "\ufeffspeed", "speed\u3000mark", "e\u0301", "\u00e9", "É", "ǅ", "ǆ", "Ǆ", "ᾈ", "ᾀ",
        "😀", "a😀", "wpm", "words per minute", "per minute words", "font size", "size font",
    ]
    names = [
        "Speed", "SPEED", "Mark colour", "Show horizontal guide lines", "Ease in", "Straße", "STRASSE",
        "ΟΔΟΣ", "Οδος", "İstanbul", "istanbul", "Ǆ size", "ﬁne print", "", "Font size", "Words per minute",
        "Mark", "a\u00a0b", "caf\u00e9", "cafe\u0301", "Emoji 😀",
    ]
    keywords = ["", "guide marks", "crosshair highlight", "crosshair", "colour", "warm up", "wpm", "ς σ", "Colour"]
    descriptions = [
        "", "Starts each session at about half speed.", "Starts slower.", "Words per minute, from 100 to 1000.",
        "The size of the letters.", "ΑΣ", "Straße",
    ]
    cases = []
    for query in queries:
        for name in names[:10]:
            cases.append(call(search.matches, query, name, "", "", False))
    for _ in range(1400):
        cases.append(call(
            search.matches, rng.choice(queries), rng.choice(names), rng.choice(keywords),
            rng.choice(descriptions), rng.random() < 0.5,
        ))
    return {
        "query_words": [call(search.query_words, query) for query in queries],
        "matches": cases,
        "desktop_tests": record_desktop_tests(
            "test_settings_search.py", search, {"matches": lambda value: value, "query_words": list}),
    }


def build_theme(core):
    """gui/theme.py cannot be imported here, because it imports tkinter. Its
    colour tables are plain assignments, so only those are read and run:
    the palettes, the dark reading colours and the guide mark colours."""
    import ast

    wanted = {
        "LIGHT_PALETTE", "DARK_PALETTE", "DARK_READING_FONT_COLOR", "DARK_READING_HIGHLIGHT_COLOR",
        "DARK_READING_BACKGROUND_COLOR", "LIGHT_READING_GUIDE_MARK_COLOR", "DARK_READING_GUIDE_MARK_COLOR",
    }
    source = (Path(core.__file__).resolve().parents[1] / "gui" / "theme.py").read_text(encoding="utf-8")
    values = {}
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and getattr(node.targets[0], "id", None) in wanted:
            module = ast.Module(body=[node], type_ignores=[])
            exec(compile(module, "gui/theme.py", "exec"), values)
    missing = wanted - values.keys()
    if missing:
        raise SystemExit(f"gui/theme.py no longer assigns {sorted(missing)}")
    return {
        "palette": [[[name], values[name.upper() + "_PALETTE"]] for name in ("light", "dark")],
        "constant": [[[name], values[name]] for name in sorted(wanted - {"LIGHT_PALETTE", "DARK_PALETTE"})],
    }


def build_settings_view(core):
    """The words of the Settings window's Defaults tab, read out of
    gui/components/settings_window.py. That file imports tkinter and cannot be
    imported here, so the body of _build_defaults_tab is walked statement by
    statement with ast: string assignments (and `low, high = X_RANGE`) are run
    so the descriptions built from them come out as they are drawn, and every
    self._defaults_item(...) call starts a new entry. For each entry it keeps
    the name, keywords, description and searchable flag the search uses, and
    the plain texts shown in it (labels, notes, switch and button texts)."""
    import ast
    import core.settings_store as settings_store

    path = Path(core.__file__).resolve().parents[1] / "gui" / "components" / "settings_window.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    env = {name: getattr(settings_store, name) for name in dir(settings_store) if name.endswith("_RANGE")}
    constants = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            try:
                constants[node.targets[0].id] = eval(compile(ast.Expression(node.value), "settings_window.py", "eval"), dict(env))
            except Exception:
                pass
    env.update({k: v for k, v in constants.items() if isinstance(v, str)})

    def value(node):
        try:
            return eval(compile(ast.Expression(node), "settings_window.py", "eval"), dict(env))
        except Exception:
            return None

    def is_item_call(node):
        return (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr == "_defaults_item")

    window = next(n for n in ast.walk(tree) if isinstance(n, ast.ClassDef) and n.name == "SettingsWindow")
    method = next(n for n in window.body if isinstance(n, ast.FunctionDef) and n.name == "_build_defaults_tab")
    entries = []
    loose = []
    for statement in method.body:
        if isinstance(statement, ast.Assign):
            target = statement.targets[0]
            if isinstance(target, ast.Tuple) and all(isinstance(e, ast.Name) for e in target.elts):
                found = value(statement.value)
                if isinstance(found, tuple) and len(found) == len(target.elts):
                    env.update(zip((e.id for e in target.elts), found))
                continue
            if isinstance(target, ast.Name) and is_item_call(statement.value):
                call = statement.value
                positional = [value(a) for a in call.args[1:]]
                named = {k.arg: value(k.value) for k in call.keywords}
                parts = positional + [""] * (3 - len(positional))
                entries.append({
                    "name": named.get("name", parts[0]),
                    "keywords": named.get("keywords", parts[1]),
                    "description": named.get("description", parts[2]),
                    "searchable": named.get("searchable", True),
                    "texts": [],
                })
                continue
            if isinstance(target, ast.Name):
                found = value(statement.value)
                if isinstance(found, str):
                    env[target.id] = found
        texts = []
        for node in ast.walk(statement):
            if isinstance(node, ast.Call):
                for keyword in node.keywords:
                    if keyword.arg == "text":
                        found = value(keyword.value)
                        if isinstance(found, str) and found:
                            texts.append(found)
                if isinstance(node.func, ast.Attribute) and node.func.attr in ("_styled_switch", "_styled_button", "_color_row"):
                    if len(node.args) > 1:
                        found = value(node.args[1])
                        if isinstance(found, str) and found:
                            texts.append(found)
        (entries[-1]["texts"] if entries else loose).extend(texts)
    if len(entries) < 20:
        raise SystemExit(f"settings_window.py: found only {len(entries)} Defaults entries")
    # The reset button's text is in its own small method.
    reset_row = next(n for n in window.body if isinstance(n, ast.FunctionDef) and n.name == "_reset_row")
    for node in ast.walk(reset_row):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "_styled_button":
            loose.append(value(node.args[1]))
    return {
        "entry": [[[index], entry] for index, entry in enumerate(entries)],
        "loose_text": [[[index], text] for index, text in enumerate(loose)],
    }


def build_scroll(core):
    """core/scroll.py, the pan arithmetic of the reader's horizontal
    scrollbar. Minus zero is written as zero: it comes out of -0.0 in Python
    and of -0 in JavaScript in different places, and the scrollbar cannot
    tell the two apart."""
    import core.scroll as scroll

    def plain(value):
        if isinstance(value, (list, tuple)):
            return [plain(item) for item in value]
        if isinstance(value, float) and value == 0:
            return 0.0
        return value

    def case(function, *arguments):
        arguments_out, result = call(function, *arguments)[:2]
        return [arguments_out, plain(result)]

    rng = random.Random(11)
    sizes = [0, 0.0, 1, 7.5, 20, 30, 40, 50, 100, 250.25, 1000]
    pans = [-999, -50, -40, -25.5, -10, -0.0, 0, 3, 10, 20, 30, 999]
    fractions = [-0.5, 0, 0.0, 0.1, 0.25, 1 / 3, 0.5, 0.75, 1, 1.0, 1.5]
    cases = {"pan_range": [], "clamp_pan": [], "scrollbar_fractions": [], "pan_from_fraction": []}
    for left in sizes:
        for right in sizes:
            cases["pan_range"].append(case(scroll.pan_range, left, right))
    for _ in range(400):
        left, right = rng.choice(sizes), rng.choice(sizes)
        viewport = rng.choice(sizes + [-5])
        cases["clamp_pan"].append(case(scroll.clamp_pan, rng.choice(pans), left, right))
        cases["scrollbar_fractions"].append(case(scroll.scrollbar_fractions, viewport, left, right, rng.choice(pans)))
        cases["pan_from_fraction"].append(case(scroll.pan_from_fraction, rng.choice(fractions), viewport, left, right))
    shapes = {name: plain for name in cases}
    cases["desktop_tests"] = record_desktop_tests("test_scroll.py", scroll, shapes)
    return cases


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


# ---------------------------------------------------------------------------
# Phase 5: importing files. The desktop importers read a file from a path,
# so each case is written to a file of its own in a temporary folder (never
# in the desktop repository), and the file's bytes go into the fixture.
# Word and PDF come with their own steps of phase 5.
# ---------------------------------------------------------------------------

# Bytes are written into the JSON as a string with one character per byte
# (character 0 to 255), which keeps plain text readable there. The web tests
# turn it back into bytes the same way.
def as_byte_string(data):
    return data.decode("latin-1")


# Extra facts for one fixture file's meta, filled in by its build function.
EXTRA_META = {}

SRT_TEXTS = [
    "1\n00:00:01,000 --> 00:00:04,000\nHello world.\n\n2\n00:00:05,000 --> 00:00:08,000\nSecond line.\n",
    "1\n00:00:01,000 --> 00:00:04,000\n<i>Italic</i> and <b>bold</b> and <font color=\"red\">red</font>\n",
    "1\n00:00:01,000 --> 00:00:04,000\nFirst line of a cue\nsecond line of the same cue\n",
    "1\r\n00:00:01,000 --> 00:00:04,000\r\nWindows endings\r\n\r\n2\r\n00:00:05,000 --> 00:00:06,000\r\nTwo\r\n",
    "1\r00:00:01,000 --> 00:00:04,000\rOld Mac endings\r",
    "No numbers or times at all, just a line.\nAnd another.",
    "12\n007\n  42  \n\u00b2\n\u2460\n\u0663\u0664\n\U0001D7D8\n\u00bd\n4.5\n-1\n1 2\nkeep me",
    "a --> b\n-->\n--> at the start\nat the end -->\n->\n- ->\nkept",
    "<>\n< >\n<a\nb>\na < b and c > d\n<<x>>\n<i><b></b></i>\n<i>  spaced  </i>\nx<br/>y",
    "   indented text   \n\ttabbed\t\n\u00a0no-break\u00a0\n\u3000ideographic\u3000",
    "one\x85two\x0bthree\x0cfour\x1cfive\x1dsix\x1eseven\u2028eight\u2029nine",
    "1\n00:00:01,000 --> 00:00:04,000\n\U0001F600 emoji and \u0438\u0432\u0430\u043d\n",
    # Python's strip() and JavaScript's trim() disagree on these two.
    "\x1fa unit separator round the line\x1f\n\ufeffa byte order mark at a line start\n\x1f12\x1f",
    "",
    "\n\n\n",
]

VTT_TEXTS = [
    "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello world.\n\n00:00:05.000 --> 00:00:08.000\nSecond line.\n",
    "WEBVTT - with a title\n\nintro\n00:00:01.000 --> 00:00:04.000 align:middle line:84%\nHello.\n",
    "WEBVTT\n\nNOTE a comment\nover two lines\n\n00:01.000 --> 00:02.000\nAfter the note.\n",
    "WEBVTT\n\nSTYLE\n::cue { color: red }\n\nREGION\nid:fred\n\n00:01.000 --> 00:02.000\nAfter style.\n",
    "WEBVTT\n\nSTYLE \nnot quite\n\nREGIONS\n00:01.000 --> 00:02.000\nblock starting REGIONS\n\nNOTE\n00:03.000 --> 00:04.000\nnote with a time\n",
    "WEBVTT\n\n00:01.000 --> 00:02.000\n<v Roger Bingham>Hello <c.yellow>there</c> <i>you</i>\n<00:00:01.500>timed",
    "WEBVTT\n\n00:01.000 --> 00:02.000\nline one\nline two\n  line three  \n",
    "WEBVTT\n\n\n\n00:01.000 --> 00:02.000\nafter extra blank lines\n\n\n\n",
    "WEBVTT\n\njust text with no timing\n\n00:01.000 --> 00:02.000\nkept\n",
    "WEBVTT\r\n\r\n1\r\n00:01.000 --> 00:02.000\r\nWindows\r\n\r\n2\r\n00:03.000 --> 00:04.000\r\nendings\r\n",
    "WEBVTT\n \n00:01.000 --> 00:02.000\nspace on the blank line\n\t\n00:03.000 --> 00:04.000\ntab on it\n",
    "WEBVTT\n\u00a0\n00:01.000 --> 00:02.000\nno-break space on the blank line\n",
    "WEBVTT\n\n00:01.000 --> 00:02.000\nfirst\n00:03.000 --> 00:04.000\nsecond timing line in the same block\n",
    "WEBVTT\n\nid\nmore id\n00:01.000 --> 00:02.000\npayload\n",
    "WEBVTT\n\n00:01.000 --> 00:02.000\none\x85two\u2028three\x0cfour\n",
    "00:01.000 --> 00:02.000\nno header at all\n",
    "webvtt\n\n00:01.000 --> 00:02.000\nlower-case header\n",
    "\ufeffWEBVTT\n\n00:01.000 --> 00:02.000\nbyte order mark kept by a decoded string\n",
    "WEBVTT\n\n00:01.000 --> 00:02.000\n\x1fpayload\x1f\n\ufeffbyte order mark\n",
    "\x1fWEBVTT\n\n\ufeffNOTE behind a byte order mark\n00:01.000 --> 00:02.000\nkept\n\n\x1fNOTE\n00:03.000 --> 00:04.000\ndropped\n",
    "WEBVTT",
    "",
]

MD_TEXTS = [
    "# Heading one\n## Heading two\n###### Six\n####### Seven is not a heading\n#hashtag\n# Closed #\n## Closed too ###\nnot # a closer",
    "Title\n=====\n\nSubtitle\n--------\n\nText.",
    "---\n***\n___\n- - -\n* * *\n_ _ _\n--\n-\n**\n*\n==\n=\n= = =\n-*-\n*_*",
    "*em* **strong** ***both*** _em_ __strong__ ~~gone~~ * not em * ** no ** 2*3*4",
    "snake_case_name and __init__ and a_b_ and _a_b and x__y__z",
    "`code` and ``co`de`` and ```three``` and ` spaced ` and `unclosed",
    "[link](http://example.com) ![image](pic.png) [ref][1] [plain] [](empty) ![](x.png) [a](b \"title\")",
    "- one\n* two\n+ three\n1. four\n2) five\n10. ten\n-no space\n1.no space\n  - nested",
    "> quote\n> > nested quote\n>no space\n   > indented",
    "```\ncode kept\n  indented code\n```\n~~~python\nx = 1\n~~~\nafter",
    "```\ninside\n~~~\nstill inside\n```\nout",
    "````\nfour\n```\nclosed by three\nafter",
    "```\nnever closed\nlast line",
    "Escapes: \\* \\_ \\# \\[ \\] \\\\ \\` \\a \\- \\! \\> \\~",
    "<b>html</b> and <span class=\"x\">span</span> and a < b > c",
    "Line one\n\n\n\nLine after blanks\n   \n\t\nend",
    "\u00a0\u00a0# no-break spaces before\n\u3000- ideographic space\n- \u00a0list with no-break",
    "one\x85two\u2028three\x0cfour",
    "* **Bold item** with [a link](x) and `code`",
    "1. **Step**: do *this*\n2. Then ~~that~~ _other_",
    "Caf\u00e9 \u201cquotes\u201d \U0001F600 \u0438\u0432\u0430\u043d",
    # Python's strip() and JavaScript's trim() disagree on these two.
    "\x1f# heading after a unit separator\x1f\n\ufeff# heading after a byte order mark\n\x1f---",
    # Python's . goes past these separators, JavaScript's does not.
    "`code\u2028across` and [li\u2028nk](x) and ![im\u2029age](x) and [re\u2028f][1]",
    "*em\u2029across*",
    "**strong\u2028across**",
    "~~gone\u2028across~~",
    "__strong\u2029across__",
    "_em\u2028across_",
    # Python's \s and JavaScript's \s disagree on these.
    "#\ufeffnot a heading\n-\x1flist item after a unit separator\n1.\x1fnumbered\n>\x1fquote",
    "*\ufeffnot em* and **\ufeffnot strong** and _x\x1f_ and **y\x1f**",
    "# closer after a unit separator\x1f#\n\x1f\x1f***\n\ufeff---",
    # Python's \w knows letters and digits in every script.
    "caf\u00e9_x_ and _y_\u00e9 and \u0438__b__ and \u0663_z_ and \u00bd_w_ and \U0001D7D8_v_",
    "\u00e9*x* and *y*\u00e9 and **z**\u0438",
    "",
]

HTML_FILES = [
    b"<html><body><p>Hello <b>world</b>.</p></body></html>",
    b"<p>One</p><p>Two</p><div>Three<div>Four</div></div><p>Five</p>",
    b"<p>a<br>b<br/>c<br />d</p>",
    b"<ul><li>one</li><li>two</li></ul><ol><li>three</li></ol><dl><dt>t</dt><dd>d</dd></dl>",
    b"<table><tr><th>h1</th><th>h2</th></tr><tr><td>a</td><td>b</td></tr></table>",
    b"<p>  lots   of\n   space\tand\ttabs  </p>\n\n<p>\n  indented\n  source\n</p>",
    b"<pre>  keep\n  my\n    layout</pre>",
    b"<p>&amp; &lt; &gt; &quot; &#39; &copy; &nbsp;x &eacute; &#8220;q&#8221; &unknown;</p>",
    b"<html><head><title>Title</title><meta name=x></head><body><p>Body</p></body></html>",
    b"<p>Before</p><script>var x = '<p>no</p>';</script><style>p { }</style><p>After</p>",
    b"<noscript>No script</noscript><template><p>Template</p></template><p>Kept</p>",
    b"<p>One<!-- a comment -->Two</p><!-- outside -->",
    b"<?xml-stylesheet href='a'?><p>processing instruction</p>",
    b"<p>Unclosed<p>paragraphs<div>and divs",
    b"Text with no tags at all",
    b"<P>Upper</P><BR><DIV>Case</DIV>",
    b"<p>Inline <a href='x'>link</a>, <em>em</em>, <span>span</span> and <code>code</code>.</p>",
    b"<h1>Title</h1><section><article><header>Head</header><p>Body</p><footer>Foot</footer></article></section>",
    b"<nav>Menu</nav><main>Main</main><aside>Aside</aside><figure>Fig<figcaption>Cap</figcaption></figure><hr>end",
    b"<blockquote>Quoted</blockquote><p><![CDATA[cdata]]></p>",
    b"<svg><text>svg text</text></svg><p>after svg</p>",
    b"<!DOCTYPE html><html lang=en><body>Doctype</body></html>",
    # Text right after an element that is dropped. lxml drops it too,
    # because to lxml that text belongs to the element.
    b"<p>a<script>x</script>b</p>",
    b"<div>a<noscript>n</noscript>tail</div><p>c<style>s</style> d <b>e</b></p>",
    b"<p>a<template>t</template>after</p>",
    b"<body><script>x</script>Loose text after a script<p>p</p></body>",
    # Badly nested or misplaced markup, where parsers can build different trees.
    b"<b>bold<p>para</b>after",
    b"<p>x</p><head><title>late head</title></head>y",
    b"<table><tr><td>a<td>b</table>text after",
    b"<p>a<div>b</div>c</p>",
    b"text<p>p</p>tail",
    b"<title>Title only in a fragment</title>body text",
    b"<ul><li>one<li>two</ul><p>a&nbsp;b&#160;c</p>",
    # Every block element on its own, with text on both sides.
] + [
    f"a<{tag}>{tag}</{tag}>b".encode("ascii")
    for tag in ["p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre",
                "section", "article", "header", "footer", "main", "aside", "nav", "figure", "figcaption",
                "dl", "dt", "dd"]
] + [
    b"a<hr>b",
    b"<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>d</td></tr></tbody>"
    b"<tfoot><tr><td>f</td></tr></tfoot></table>after",
    # Spaces that Python and JavaScript count differently.
    "<meta charset=utf-8><p>a\x85d\ufeffe\u00a0f\u3000g</p>".encode("utf-8"),
    # Control characters inside a block: lxml refuses them when the desktop
    # adds its line marks, and the import crashes.
    b"<p>a\x1cb\x1fc</p>",
    b"<p>page one\x0cpage two</p>",
    b"<div>outside a block\x0b<span>ok</span></div>",
    b"<!-- only a comment -->",
    b"<!DOCTYPE html>",
    b"<html></html>",
    b"<html><head><title>Only a title</title></head><body></body></html>",
    b"",
    b"   \n\t",
    # Encodings: the desktop lets lxml find the encoding in the page itself.
    "<meta charset=\"utf-8\"><p>Caf\u00e9 \u201cq\u201d</p>".encode("utf-8"),
    "<meta charset=\"windows-1252\"><p>Caf\u00e9 \u201cq\u201d</p>".encode("cp1252"),
    "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\"><p>Caf\u00e9</p>".encode("utf-8"),
    "<html><body><p>Caf\u00e9 \u201cq\u201d with no charset</p></body></html>".encode("utf-8"),
    "<html><body><p>Caf\u00e9 \u201cq\u201d with no charset</p></body></html>".encode("cp1252"),
    b"\xef\xbb\xbf" + "<p>Caf\u00e9 after a byte order mark</p>".encode("utf-8"),
    "<?xml version=\"1.0\" encoding=\"iso-8859-1\"?><html><body><p>Caf\u00e9</p></body></html>".encode("latin-1"),
    "<meta charset=\"iso-8859-1\"><p>Caf\u00e9</p>".encode("latin-1"),
    "<META CHARSET=UTF-8><p>Caf\u00e9 unquoted, capitals</p>".encode("utf-8"),
    "<meta http-equiv=\"content-type\" content=\"text/html;charset=windows-1252\"><p>\u201cq\u201d</p>".encode("cp1252"),
    "<meta charset=\"utf-8\"><p>Caf\u00e9 with a bad byte</p>".encode("utf-8") + b"\xe9",
    "<meta charset=\"no-such-encoding\"><p>Caf\u00e9</p>".encode("utf-8"),
    "<html><body><p>Plain ASCII, no charset</p></body></html>".encode("utf-8"),
    "<p>Caf\u00e9</p><meta charset=\"windows-1252\">".encode("utf-8"),
]

TEXT_BYTES = [
    b"",
    b"Hello world.\n",
    "Caf\u00e9 r\u00e9sum\u00e9 \u201cquotes\u201d \U0001F600".encode("utf-8"),
    "With a byte order mark".encode("utf-8-sig"),
    b"\xef\xbb\xbf",
    b"\xef\xbb\xbf\xef\xbb\xbftwo byte order marks",
    "Caf\u00e9 in Latin-1".encode("latin-1"),
    "Windows \u201cquotes\u201d \u2013 dash \u2026 \u20ac".encode("cp1252"),
    bytes(range(0x80, 0xA0)),
    bytes(range(256)),
    b"lone continuation \x80 byte",
    b"overlong \xc0\xaf slash",
    b"surrogate \xed\xa0\x80 half",
    b"cut short \xe2\x82",
    b"beyond U+10FFFF \xf4\x90\x80\x80",
    b"five-byte form \xf8\x88\x80\x80\x80",
    b"\xff\xfeU\x00T\x00F\x00-\x001\x006\x00",
    "UTF-8 then a bad byte \u00e9".encode("utf-8") + b"\xe9",
    b"\r\n\r\nline endings\r\n",
] + [text.encode("utf-8") for text in TEXTS[:20]]

# File name, then the bytes. For import_file(): the extension picks the
# importer, and the name shows in the error messages.
IMPORT_FILES = [
    ("plain.txt", b"  First   line.  \r\n\r\n\r\n\r\nSecond\tline.\n"),
    ("stamped.txt", b"[00:00:01] Welcome.\n(1:23) Goodbye."),
    ("empty.txt", b""),
    ("blank.txt", b"   \n\t\r\n"),
    ("only stamps.txt", b"[00:00:01]\n(1:23)\n0:05"),
    ("UPPER.TXT", b"Upper-case extension."),
    ("Mixed.Txt", b"Mixed-case extension."),
    ("windows.txt", "\u201cQuoted\u201d in Windows-1252".encode("cp1252")),
    ("talk.srt", SRT_TEXTS[0].encode("utf-8")),
    ("empty.srt", b"1\n00:00:01,000 --> 00:00:04,000\n\n"),
    ("talk.vtt", VTT_TEXTS[0].encode("utf-8")),
    ("empty.vtt", b"WEBVTT\n\nNOTE nothing else\n"),
    ("notes.md", MD_TEXTS[0].encode("utf-8")),
    ("notes.markdown", b"# Long extension\n\n*text*"),
    ("rules.md", b"---\n***\n"),
    ("page.html", HTML_FILES[0]),
    ("page.htm", HTML_FILES[1]),
    ("PAGE.HTML", HTML_FILES[2]),
    ("title only.html", HTML_FILES[25]),
    ("comment.html", HTML_FILES[22]),
    ("sample.xyz", b"irrelevant"),
    ("README", b"no extension"),
    (".txt", b"a dot file has no extension"),
    (".hidden.md", b"# a dot file with an extension"),
    ("archive.tar.gz", b"only the last extension counts"),
    ("notes.txt.md", b"# the last one"),
    ("notes.md.txt", b"# the last one"),
    ("caf\u00e9 \u201cnotes\u201d.txt", b""),
    ("transcript.doc", b"an old Word file"),
    ("text.text", b"close, but not .txt"),
]

# File names as a browser gives them, with no folders: for Path.suffix,
# which picks the importer, and Path.stem, which the desktop offers as the
# title.
FILE_NAMES = unique(
    [name for name, _ in IMPORT_FILES]
    + [
        "a.txt", "a", "..", "...", ".txt", "..txt", "a.", "a..", "a..txt", "a.b.c",
        "a. txt", "a .txt", " .txt", "a.t", ".a.b", "a.TXT", "a.T\u00ccT", "a.\u0130",
        "notes.MARKDOWN", "caf\u00e9.md", "\U0001F600.srt", "a.\U0001F600", "name with spaces.vtt",
    ]
)

IMPORTER_TEST_FILES = ["test_importers.py", "test_importer_errors.py"]

# Tests that change the desktop code while they run, so what they record
# cannot happen in the web app. A test run with several parameters counts
# by its name without them.
IMPORTER_TESTS_LEFT_OUT = {
    "test_an_html_file_the_parser_fails_on_otherwise_couldnt_be_opened",
    "test_a_page_that_cant_be_read_is_skipped_and_the_rest_kept",
    "test_a_pdf_whose_pages_all_fail_has_no_readable_text",
    "test_a_pdf_that_decrypt_fails_on_is_reported_as_password_protected",
}


def import_answer(function, path):
    """What an importer gives for a file: {"text": ...}, or {"error": ...}
    with the message the desktop shows, or {"crash": ...} with the name of
    an exception the desktop does not catch, so the app shows no message."""
    from core.importers import TranscriptImportError

    try:
        return {"text": function(str(path))}
    except TranscriptImportError as error:
        return {"error": str(error)}
    except Exception as error:
        return {"crash": type(error).__name__}


def without_folder(answer, path):
    """Some library messages name the whole path of the file, such as
    python-docx's "Package not found at '/tmp/.../x.docx'". The temporary
    folder changes on every run, so it is written as FOLDER."""
    if "error" in answer:
        return {"error": answer["error"].replace(str(Path(path).parent), "FOLDER")}
    return answer


def import_from_bytes(function, name, data):
    """Writes the bytes to a file with this name in a new temporary folder,
    and runs the importer on it."""
    import tempfile

    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / name
        path.write_bytes(data)
        return without_folder(import_answer(function, path), path)


def text_case(function, extension, text):
    """A case for an importer that reads text: the text is saved as UTF-8,
    and the argument written down is the text the importer really worked on,
    that is after the desktop decoded the file (it drops a byte order mark
    at the start)."""
    data = text.encode("utf-8")
    seen = data.decode("utf-8-sig")
    return [[seen], import_from_bytes(function, "case" + extension, data)]


def record_importer_tests(importers):
    """Runs the desktop's importer tests with pytest, as they are, and writes
    down every call a test makes to an importer: the file's name and bytes,
    and the answer. Gives three lists: text and HTML, then Word, then PDF.
    A test that fails stops the run.

    An encrypted PDF a test makes is not kept: pypdf encrypts with random
    keys, so the file is different on every run. The encrypted PDFs in
    fixtures/files stand in for those tests."""
    import pytest

    desktop = Path(importers.__file__).resolve().parents[1]
    watched = [
        "import_txt", "import_srt", "import_vtt", "import_md", "import_html", "import_docx", "import_pdf",
        "import_file",
    ]
    text_types = {".txt", ".srt", ".vtt", ".md", ".markdown", ".html", ".htm"}
    recorded = {}
    recorded_docx = {}
    recorded_pdf = {}

    class Recorder:
        @pytest.hookimpl(hookwrapper=True)
        def pytest_runtest_call(self, item):
            calls = recorded.setdefault(item.name, [])

            docx_calls = recorded_docx.setdefault(item.name, [])
            pdf_calls = recorded_pdf.setdefault(item.name, [])

            def note(name, path, data, answer):
                answer = without_folder(answer, path)
                suffix = Path(path).suffix.lower()
                if suffix in text_types or suffix not in importers.SUPPORTED_EXTENSIONS:
                    calls.append([name, Path(path).name, as_byte_string(data), answer])
                elif suffix == ".docx":
                    # A Word file a test made just now has today's date in
                    # its zip, so the dates are fixed. The desktop has to
                    # give the same answer for the fixed file.
                    try:
                        fixed = fixed_zip(data)
                    except Exception:
                        fixed = data  # not a zip at all, so nothing to fix
                    function = getattr(importers, name)
                    if import_from_bytes(function, Path(path).name, fixed) != answer:
                        raise SystemExit(f"fixing the dates in {Path(path).name} changed the answer")
                    docx_calls.append([name, Path(path).name, as_base64(fixed), answer])
                elif suffix == ".pdf" and b"/Encrypt" not in data:
                    pdf_calls.append([name, Path(path).name, as_base64(data), answer])

            def watch(name, real):
                def run(path, *rest):
                    data = Path(path).read_bytes()
                    try:
                        result = real(path, *rest)
                    except importers.TranscriptImportError as error:
                        note(name, path, data, {"error": str(error)})
                        raise
                    note(name, path, data, {"text": result})
                    return result
                return run

            originals = {}
            for name in watched:
                if hasattr(item.module, name):
                    originals[name] = getattr(item.module, name)
                    setattr(item.module, name, watch(name, originals[name]))
            try:
                outcome = yield
            finally:
                for name, original in originals.items():
                    setattr(item.module, name, original)
            if outcome.excinfo is not None:
                raise SystemExit(f"the desktop test {item.name} failed, so it cannot be recorded")

    for test_file in IMPORTER_TEST_FILES:
        status = pytest.main(
            [str(desktop / "tests" / test_file), "-q", "--no-header", "-p", "no:cacheprovider",
             "--noconftest", "--rootdir", str(desktop), "-o", "addopts="],
            plugins=[Recorder()],
        )
        if status != 0:
            raise SystemExit(f"pytest ended with status {status} on the desktop's {test_file}")
    def kept(found):
        return [
            [[name], calls] for name, calls in found.items()
            if calls and name.split("[")[0] not in IMPORTER_TESTS_LEFT_OUT
        ]

    return kept(recorded), kept(recorded_docx), kept(recorded_pdf)


def build_importers(core):
    import core.importers as importers
    from lxml import etree

    EXTRA_META["importers"] = {
        "lxml": ".".join(str(part) for part in etree.LXML_VERSION),
        "libxml2": ".".join(str(part) for part in etree.LIBXML_VERSION),
    }

    md_lines = unique(
        line for text in MD_TEXTS + TEXTS for line in re.split(r"\r\n|\r|\n", text)
    )
    desktop_tests, desktop_tests_docx, desktop_tests_pdf = record_importer_tests(importers)
    # Python's str.splitlines(), which all three text importers use. It
    # breaks lines on more characters than a line feed, so the port needs
    # its own, checked against these: every character that ends a line, and
    # whole texts split.
    splitlines_texts = unique(
        TEXTS + SRT_TEXTS + VTT_TEXTS + MD_TEXTS
        + ["a\r\nb", "a\r\rb", "a\n\rb", "a\n", "a\r\n", "\n", "\r\n", "a\n\n", "\n\na"]
        + ["x" + chr(number) + "y" for number in range(0x3000) if ("x" + chr(number) + "y").splitlines() != ["x" + chr(number) + "y"]]
    )
    return {
        "splitlines_boundaries": [[["all"], ranges(lambda ch: len(("a" + ch + "b").splitlines()) == 2)]],
        "str_splitlines": [call(str.splitlines, text) for text in splitlines_texts],
        "supported_extensions": [[[], sorted(importers.SUPPORTED_EXTENSIONS)]],
        "path_suffix": [call(lambda name: PurePath(name).suffix, name) for name in FILE_NAMES],
        "path_stem": [call(lambda name: PurePath(name).stem, name) for name in FILE_NAMES],
        "suffix_lower": [call(lambda name: PurePath(name).suffix.lower(), name) for name in FILE_NAMES],
        "read_text_with_fallback": [
            [[as_byte_string(data)], import_from_bytes(importers.import_txt, "case.txt", data)]
            for data in unique(TEXT_BYTES)
        ],
        "import_srt": [
            text_case(importers.import_srt, ".srt", text) for text in unique(SRT_TEXTS + TEXTS)
        ],
        "import_vtt": [
            text_case(importers.import_vtt, ".vtt", text) for text in unique(VTT_TEXTS + TEXTS)
        ],
        "import_md": [
            text_case(importers.import_md, ".md", text) for text in unique(MD_TEXTS + TEXTS)
        ],
        "strip_inline_md": [call(importers._strip_inline_md, line) for line in md_lines],
        "import_html": [
            [[as_byte_string(data)], import_from_bytes(importers.import_html, "case.html", data)]
            for data in unique(HTML_FILES)
        ],
        "import_file": [
            [[name, as_byte_string(data)], import_from_bytes(importers.import_file, name, data)]
            for name, data in IMPORT_FILES
        ],
        "desktop_tests": desktop_tests,
        "import_docx": [
            [[name, as_base64(make_docx(body, **(options[0] if options else {})))],
             import_from_bytes(importers.import_docx, name + ".docx",
                               make_docx(body, **(options[0] if options else {})))]
            for name, body, *options in DOCX_CASES
        ] + [
            [["not a zip", as_base64(b"not a real docx file")],
             import_from_bytes(importers.import_docx, "not a zip.docx", b"not a real docx file")],
            [["empty file", ""], import_from_bytes(importers.import_docx, "empty file.docx", b"")],
            [["zip with no document", as_base64(zip_without_document())],
             import_from_bytes(importers.import_docx, "zip with no document.docx", zip_without_document())],
            [["damaged XML", as_base64(broken_xml_docx())],
             import_from_bytes(importers.import_docx, "damaged XML.docx", broken_xml_docx())],
        ],
        "import_docx_files": [
            [[path.name], briefly(import_answer(importers.import_file, path))] for path in test_files("*.docx")
        ],
        "import_pdf_files": [
            [[path.name], briefly(import_answer(importers.import_file, path))] for path in test_files("*.pdf")
        ],
        "desktop_tests_docx": desktop_tests_docx,
        "desktop_tests_pdf": desktop_tests_pdf,
    }


# ---------------------------------------------------------------------------
# Word files, for phase 5 step 6. Kept as base64: a .docx is a zip file, and
# one character per byte would make it six times longer in JSON.
# ---------------------------------------------------------------------------

def as_base64(data):
    import base64

    return base64.b64encode(data).decode("ascii")


def fixed_zip(data):
    """The same zip with every date set to 1980-01-01, so a file made during
    the run gives the same bytes on every run. The contents, the order and
    the compression of each entry stay as they were."""
    import io
    import zipfile

    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as source, zipfile.ZipFile(out, "w") as target:
        for entry in source.infolist():
            fixed = zipfile.ZipInfo(entry.filename, date_time=(1980, 1, 1, 0, 0, 0))
            fixed.compress_type = entry.compress_type
            fixed.external_attr = entry.external_attr
            target.writestr(fixed, source.read(entry.filename))
    return out.getvalue()


WORD_NAMESPACES = (
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
    'xmlns:v="urn:schemas-microsoft-com:vml" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
)
RELATIONSHIPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def make_docx(body, footnotes=None, main="word/document.xml", stored=False):
    """A small but real .docx: the parts a Word file needs to open, with
    this XML as the body of its document."""
    import io
    import zipfile

    main_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
    notes_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"
    folder, _, main_name = main.rpartition("/")
    parts = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            f'<Override PartName="/{main}" ContentType="{main_type}"/>'
            + (f'<Override PartName="/{folder}/footnotes.xml" ContentType="{notes_type}"/>' if footnotes else "")
            + "</Types>"
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rId1" Type="{RELATIONSHIPS}/officeDocument" Target="{main}"/>'
            "</Relationships>"
        ),
        main: (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f"<w:document {WORD_NAMESPACES}><w:body>{body}</w:body></w:document>"
        ),
    }
    if footnotes:
        parts[f"{folder}/_rels/{main_name}.rels"] = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rId9" Type="{RELATIONSHIPS}/footnotes" Target="footnotes.xml"/>'
            "</Relationships>"
        )
        parts[f"{folder}/footnotes.xml"] = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f"<w:footnotes {WORD_NAMESPACES}>{footnotes}</w:footnotes>"
        )
    out = io.BytesIO()
    method = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
    with zipfile.ZipFile(out, "w") as archive:
        for name, text in parts.items():
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = method
            archive.writestr(info, text.encode("utf-8"))
    return out.getvalue()


def p(*runs):
    return "<w:p>" + "".join(runs) + "</w:p>"


def r(*content):
    return "<w:r>" + "".join(content) + "</w:r>"


def t(text):
    return f'<w:t xml:space="preserve">{text}</w:t>'


TEXT_BOX = (
    "<mc:AlternateContent><mc:Choice Requires=\"wps\"><w:drawing><wp:anchor><a:graphic><a:graphicData>"
    "<wps:wsp><wps:txbx><w:txbxContent>" + p(r(t("TEXT BOX inside."))) + "</w:txbxContent></wps:txbx></wps:wsp>"
    "</a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>"
    "<mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent>" + p(r(t("TEXT BOX inside.")))
    + "</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent>"
)

FOOTNOTES = (
    '<w:footnote w:type="separator" w:id="-1">' + p(r("<w:separator/>")) + "</w:footnote>"
    '<w:footnote w:type="continuationSeparator" w:id="0">' + p(r("<w:continuationSeparator/>")) + "</w:footnote>"
    '<w:footnote w:id="1">' + p(r(t("FOOTNOTE one."))) + "</w:footnote>"
    '<w:footnote w:id="2">' + p(r(t("FOOTNOTE two,"))) + p(r(t("second paragraph."))) + "</w:footnote>"
)

# Name, then the body's XML and any options. Each becomes a .docx, and the
# desktop's import_docx() is run on it.
DOCX_CASES = [
    ("paragraphs", p(r(t("First paragraph."))) + p() + p(r(t("   "))) + p(r(t("Second paragraph.")))),
    ("runs", p(r(t("one ")), r(t("wo")), r(t("rd")), r(t(" split")))),
    ("tabs and breaks", p(r(t("a"), "<w:tab/>", t("b"), "<w:br/>", t("c"), "<w:cr/>", t("d"), "<w:ptab/>", t("e")))),
    ("break types", p(r(t("line"), '<w:br w:type="textWrapping"/>', t("page"), '<w:br w:type="page"/>',
                         t("column"), '<w:br w:type="column"/>', t("end")))),
    ("hyphen", p(r(t("non"), "<w:noBreakHyphen/>", t("breaking"), "<w:softHyphen/>", t("soft")))),
    ("hyperlink", p(r(t("Go to ")), '<w:hyperlink r:id="rId5">' + r(t("the site")) + "</w:hyperlink>", r(t(".")))),
    ("tracked changes", p(r(t("kept ")), "<w:del>" + r("<w:delText>deleted </w:delText>") + "</w:del>",
                          "<w:ins>" + r(t("inserted ")) + "</w:ins>", r(t("end")))),
    ("fields and controls", p(r(t("before ")), '<w:fldSimple w:instr="PAGE">' + r(t("7")) + "</w:fldSimple>",
                              "<w:sdt><w:sdtContent>" + r(t("control ")) + "</w:sdtContent></w:sdt>",
                              "<w:smartTag>" + r(t("smart ")) + "</w:smartTag>", r(t("after")))),
    ("unicode", p(r(t("Caf\u00e9 \u201cquotes\u201d \U0001F600 \u0438\u0432\u0430\u043d &amp; &lt;tag&gt;")))),
    ("spaces", p(r(t("  leading and trailing  "))) + p(r(t("\u00a0\u3000"))) + p(r(t("\u2003em space\u2003")))
     + p(r(t("\ufeff"))) + p(r(t("\x85")))),
    ("table", p(r(t("Before the table."))) + "<w:tbl><w:tr><w:tc>" + p(r(t("TABLE cell one"))) + "</w:tc><w:tc>"
     + p(r(t("TABLE cell two"))) + "</w:tc></w:tr></w:tbl>" + p(r(t("After the table.")))),
    ("text box", p(r(t("Anchor paragraph.")), r(TEXT_BOX)) + p(r(t("Next paragraph.")))),
    ("content control", "<w:sdt><w:sdtContent>" + p(r(t("CONTROL paragraph."))) + "</w:sdtContent></w:sdt>"
     + p(r(t("Body paragraph.")))),
    ("footnotes", p(r(t("Body with a note.")), r('<w:footnoteReference w:id="1"/>')) + p(r(t("More body."))),
     {"footnotes": FOOTNOTES}),
    ("stored", p(r(t("Stored without compression."))), {"stored": True}),
    ("another part name", p(r(t("The main part has another name."))), {"main": "word/document2.xml"}),
    ("empty", p()),
]


def zip_without_document():
    """A zip that holds a file, but nothing of a Word document."""
    import io
    import zipfile

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr(zipfile.ZipInfo("notes.txt", date_time=(1980, 1, 1, 0, 0, 0)), b"hello")
    return out.getvalue()


def broken_xml_docx():
    """A Word file whose document is not well-formed XML."""
    return make_docx(p(r(t("unclosed"))) + "<w:p><w:r>")


def briefly(answer):
    """A long text as its SHA-256 and its length in characters, so a file of
    a whole book does not put the book into the fixture."""
    import hashlib

    text = answer.get("text")
    if text is None or len(text) <= 5000:
        return answer
    return {"sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(), "characters": len(text)}


def test_files(pattern):
    """The files of one type that are in the web repository under fixtures/files."""
    folder = Path(__file__).resolve().parents[2] / "fixtures" / "files"
    return sorted(folder.glob(pattern))


# ---------------------------------------------------------------------------
# Phase 6: letter spacing. Only the level table and clamp_level() are ported:
# CSS has letter-spacing, so the gap characters the desktop measures and
# chooses (choose_gap, build_plan, space_text) are not needed.
# ---------------------------------------------------------------------------

def build_letter_spacing(core):
    import core.letter_spacing as spacing

    levels = [
        -100, -2, -1, 0, 1, 2, 3, 4, 5, 99, 2**40, -(2**40),
        True, False, None, "1", "", 1.5, -0.5, 2.25, [], {},
    ]
    return {
        "level_names": [[[], list(spacing.LEVEL_NAMES)]],
        "level_gap_em": [[[], list(spacing.LEVEL_GAP_EM)]],
        "max_level": [[[], spacing.MAX_LEVEL]],
        "word_gap_ratio": [[[], spacing.WORD_GAP_RATIO]],
        "clamp_level": [call(spacing.clamp_level, level) for level in levels],
    }


# ---------------------------------------------------------------------------
# Phase 6: the OpenDyslexic font. Only the strict reading of the switch is
# ported. Tk needs the font files looked up and registered by hand, and the
# Regular and Bold files register as two families; on the web both are one
# family with two weights, and the files are bundled, so none of that is
# needed. What is kept is which set the saved value selects.
# ---------------------------------------------------------------------------

def build_font_choice(core):
    import core.font_choice as fonts

    values = [
        True, False, None, 1, 0, 1.0, "true", "True", "", [], {}, [True], "yes",
    ]
    every_file = fonts.STANDARD_FONTS.files + fonts.DYSLEXIA_FONTS.files
    return {
        "dyslexia_friendly": [
            call(lambda value: fonts.choose_fonts(value, every_file).dyslexia_friendly, value)
            for value in values
        ],
    }


# ---------------------------------------------------------------------------
# Phase 6: bold word starts. Only core/bold_starts.py is ported: which letters
# at the front of each word are bold. core/bold_spans.py turns the answer into
# Tk "line.column" places, which a browser has no use for, so it is left out.
# ---------------------------------------------------------------------------

SOFT_HYPHEN = "\u00ad"
ACUTE = "\u0301"

# The cases of the desktop's tests/test_bold_starts.py, and more of the same
# kind, so each rule of the module has a text that exercises it.
BOLD_TEXTS = [
    "a", "I", "of", "the", "that", "about", "people", "NASA", "iPhone",
    "The quick brown fox.", "reading", "JavaScript", "internationalization",
    "pneumonoultramicroscopicsilicovolcanoconiosis", "a" + "bc" * 40,
    "journey", "audience", "rhythms", "because", "brrrrrrr", "boat", "chair",
    "\u043c\u0430\u043c\u0430\u044a\u043c\u0430\u043c",
    "\u043a\u043a\u043a\u043a\u0439\u0438\u0438\u0438",
    "babbbbbb", "abbbbbbb", "AUDIENCE",
    "\u041c\u0410\u041c\u0410\u042a\u041c\u0410\u041c",
    "well-known", "state-of-the-art", "mother-in-law",
    "word-word", "word\u2010word", "word\u2011word", "word\u2013word",
    "word\u2014word", "word/word", "word_word", "word.word", "word,word",
    "word:word", "word;word", "word(word", "word)word",
    "foo\u200bbar",
    "don't", "don\u2019t", "O'Brien", "I'm", "\u043c\u02bc\u044f\u0441\u043e",
    "dogs'", "'tis", "rock 'n' roll", "'", "'' ' ''", "'tis 5",
    "r\u00ade\u00ada\u00add\u00adi\u00adn\u00adg", "inter\u00adnational",
    "exam\u00ad", "rea\u200cding", "rea\u200dding", "rea\u2060ding",
    "cafe\u0301", "ca\u0301fe", "e\u0301", " \u0301 ", "1\u0301",
    "\u041f\u0440\u0438\u0432\u0435\u0442", "\u043a\u044a\u0449\u0430",
    "\u039a\u03b1\u03bb\u03b7\u03bc\u03ad\u03c1\u03b1", "\u03c4\u03b9\u037e",
    "\u4f60\u597d\u4e16\u754c", "\u3053\u3093\u306b\u3061\u306f",
    "\u0645\u0631\u062d\u0628\u0627", "\u05e9\u05dc\u05d5\u05dd",
    "\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35", "hello\u4f60\u597d",
    "2024", "3.14", "3rd", "2nd", "H2O", "mp3", "x86", "version2", "1990's",
    "m\u00b2", "COVID-19", "3-D", "5 apples",
    # A number written with a character that is numeric but not a digit
    # (str.isnumeric() is true for it, the Unicode category is a letter).
    "hello\u4e09", "\u4e09hello", "hello\u00bd", "hello\u2167", "\u2460hello",
    "see https://example.com/long-path now", "www.example.org is",
    "go (https://x.org/a) now", "mail bob@example.com please",
    "alice.smith+tag@mail.example.co.uk", "http://x", "HTTP://x.org y",
    "foohttp://x.org y", "a@b", "a@b.c d", "bare example.com here",
    # Addresses after an emoji, which counts as two UTF-16 units in a browser.
    "\U0001F600 see https://x.org now", "\U0001F600 bob@example.com ok",
    "\U0001F600\U0001F600 www.x.org end", "a\U0001F600b https://x.org/\U0001F600 tail",
    "", " ", "   \n\t  ", "!!! ... ???", "-- -- --", "12 34 56",
    "hello \U0001F600 world", "ab\ncd", "ab\r\ncd", "ab\u2028cd", "ab\x0bcd",
    "\U0001F600abc", "abc\U0001F600def", "\U0001D7D8abc", "a\U00020000b",
    "The well-known state-of-the-art audience\ndon't read https://example.com/a-b now\n\n"
    "\u041f\u0440\u0438\u0432\u0435\u0442 \u043a\u044a\u0449\u0430 cafe\u0301 3rd\n"
    "inter\u00adnational 1990's",
    "Hello, world! It's a well-known fact (see https://example.com/x) that "
    "internationalization costs 3 times more than don't-care attitudes; "
    "e.g. rock 'n' roll, state_of_the_art, O'Brien\u2014and \u041f\u0440\u0438\u0432\u0435\u0442 "
    "cafe\u0301 \U0001F600 inter\u00adnational 1990's H2O.",
    # Other cases the rules cover: Turkish dotted capital I (lower-cases to two
    # characters), ligatures, the Latin-1 and extended letters, capitals.
    "\u0130stanbul", "\ufb01nancial", "\u00c6ther", "\u0153uvre", "\u00d8resund",
    "\u0131\u0131\u0131\u0131\u0131\u0131\u0131", "\u0259\u0259\u0259\u0259\u0259\u0259\u0259",
    "\u00fcber", "stra\u00dfe", "\u00c9COLE", "na\u00efve", "r\u00e9sum\u00e9",
    "\u0391\u0398\u0397\u039d\u0391\u0399\u039f\u0399", "\u1f08\u03b8\u03ae\u03bd\u03b1",
    "\u0407\u0436\u0430\u043a", "\u0457\u0436\u0430\u043a\u0457\u0436\u0430\u043a",
]


def bold_random_texts():
    """Deterministic made-up texts: words of every length made of vowels and
    consonants of several alphabets, with the things that change a word (an
    apostrophe, a soft hyphen, a combining mark, a digit) dropped in."""
    rng = random.Random(20261124)
    alphabets = [
        ("aeiouy", "bcdfghjklmnpqrstvwxz"),
        ("AEIOUY", "BCDFGHJKLMNPQRSTVWXZ"),
        ("\u00e0\u00e9\u00ee\u00f6\u00fc\u0153", "\u00e7\u00f1\u00df\u0161\u017e"),
        ("\u0430\u0435\u0438\u043e\u0443\u044b\u044f", "\u0431\u0432\u0433\u0434\u0439\u043a\u043b\u043c\u044a\u044c"),
        ("\u03b1\u03b5\u03b7\u03b9\u03bf\u03c5\u03c9", "\u03b2\u03b3\u03b4\u03b6\u03b8\u03bb\u03bc\u03c3\u03c2"),
    ]
    extras = ["'", "\u2019", SOFT_HYPHEN, ACUTE, "1", "-", "\u200c"]
    texts = []
    for _ in range(300):
        words = []
        for _ in range(rng.randint(1, 8)):
            vowels, consonants = rng.choice(alphabets)
            word = "".join(
                rng.choice(vowels if rng.random() < 0.4 else consonants)
                for _ in range(rng.randint(1, 24))
            )
            if rng.random() < 0.25:
                at = rng.randint(0, len(word))
                word = word[:at] + rng.choice(extras) + word[at:]
            words.append(word)
        texts.append(rng.choice([" ", " ", "-", "\n", ", "]).join(words))
    return texts


def build_bold_starts(core):
    import core.bold_starts as bold

    # Every letter the word finder accepts, put in the one place where it
    # decides between a vowel and a consonant. In "bbbbXba" the bold stretch is
    # 4 letters when X is a vowel and 6 when it is not, so the answer for each
    # letter records what _is_vowel() decided.
    letters = [chr(n) for n in range(0x110000) if bold._kind(chr(n)) == "L"]
    vowel_probes = ["bbbb" + letter + "ba" for letter in letters]

    texts = unique(
        BOLD_TEXTS + TEXTS + EXTRA_WORDS + bold_random_texts() + vowel_probes
        + ["b" * n for n in range(1, 40)]
        + ["ab" * n for n in range(1, 25)]
        + ["ba" * n for n in range(1, 25)]
    )

    def kind_ranges(kind):
        return ranges(lambda ch: bold._kind(ch) == kind)

    return {
        "fixation_length": [call(bold.fixation_length, n) for n in list(range(-3, 80)) + [1000, 10**6]],
        "bold_ranges": [call(bold.bold_ranges, text) for text in texts],
        # The word finder's own character classes, as ranges: L a letter it
        # bolds, M a combining mark, A an apostrophe, I invisible glue.
        "kind_ranges": [[[], {kind: kind_ranges(kind) for kind in "LMAI"}]],
        # What str.isnumeric() accepts. Used to look at the character next to a
        # word. It is wider than the Unicode number categories.
        "numeric_ranges": [[[], ranges(str.isnumeric)]],
    }


# ---------------------------------------------------------------------------
# Phase 6: copying with bold. core/rich_copy.py builds Windows' clipboard HTML:
# a header with byte counts around an HTML fragment. A browser writes that
# header itself, so only the fragment is ported. It is cut out of cf_html()'s
# answer at the places its own header names, so the real code is what is
# compared.
# ---------------------------------------------------------------------------

def rich_fragment(core, segments):
    from core.rich_copy import cf_html

    data = cf_html([(text, bold) for text, bold in segments])
    head = data[: data.index(b"<html")].decode("ascii")
    offsets = dict(re.findall(r"(\w+):(\d+)\r\n", head))
    return data[int(offsets["StartFragment"]) : int(offsets["EndFragment"])].decode("utf-8")


# The cases of the desktop's tests/test_rich_copy.py.
RICH_CASES = [
    [],
    [["", True]],
    [["ab", True], ["cd", False]],
    [["ab", True], ["cd", True], ["ef", False], ["gh", False]],
    [["<b>&amp;</b>", False]],
    [["a < b & c > d", True]],
    [["say \"hi\" it's", False]],
    [["one\ntwo", False]],
    [["ab\ncd", True]],
    [["one\n\ntwo", False]],
    [["one\n", False]],
    [["a b c", False]],
    [["a  b", False]],
    [["   a", False]],
    [["a   ", False]],
    [[" ", False]],
    [["a ", False], ["b", True]],
    [["a ", False], [" b", True]],
    [["a\tb", False]],
    [["a \tb", False]],
    [["a\r\nb\x00c\x1bd\x7fe\x85f", False]],
    [["a\u2028b\u2029c", False]],
    [["\u041f\u0440\u0438\u0432\u0435\u0442 \U0001F600", True]],
    [["hello world", True]],
    [["he", True], ["llo ", False], ["wo", True], ["rld", False]],
    [["\u041f\u0440\u0438\u0432", True], ["\u0435\u0442 \u043c\u0438\u0440\n", False], ["\U0001F600 ", True], ["ok", False]],
    [["  indented\n\n\n  tail  ", False], ["\t", True]],
    [["a\n", True], ["\n", False], ["b", True]],
    [["<&>", True], ["\"'", False]],
]


def rich_random_cases():
    """The desktop's own random test, with a seed of this file's."""
    rng = random.Random(20261124)
    alphabet = ["a", "b", "Z", "\u0431", "\u0436", "\U0001F600", "&", "<", ">", '"', "'", " ", " ", " ",
                "\t", "\n", "\n", "\r", "\x00", "\x7f", "\x85", "\u200d", "\u00ad", "-", "\u00e9", "1",
                "\u2028", "\x0b", "\x0c", "\x1f", "\xa0"]
    cases = []
    for _ in range(400):
        cases.append([["".join(rng.choice(alphabet) for _ in range(rng.randint(0, 12))), rng.random() < 0.5]
                      for _ in range(rng.randint(0, 8))])
    return cases


def build_rich_copy(core):
    import core.bold_starts as bold

    # Text cut the way the bold view cuts it, as copying would find it.
    def as_segments(text):
        pieces = []
        last = 0
        for start, end in bold.bold_ranges(text):
            if start > last:
                pieces.append([text[last:start], False])
            pieces.append([text[start:end], True])
            last = end
        if last < len(text):
            pieces.append([text[last:], False])
        return pieces

    from_bold = [as_segments(text) for text in BOLD_TEXTS + TEXTS]
    cases = RICH_CASES + rich_random_cases() + from_bold
    from core.rich_copy import segments_text

    return {
        "html_fragment": [[[segments], rich_fragment(core, segments)] for segments in cases],
        "segments_text": [call(segments_text, segments) for segments in RICH_CASES + rich_random_cases()],
    }


# ---------------------------------------------------------------------------
# Phase 6: reading profiles. core/profiles.py holds the rules: which settings
# a profile holds, what a valid value is, and what makes a good name.
# core/profile_apply.py works out what applying a profile does. Both are pure.
# The store's save, update, rename and delete come from the desktop's own
# store tests, in desktop_tests.json, not from here.
#
# Three things are kept out of the cases on purpose, and checked below:
#
# - A float that is a whole number, such as 10.0. Python says it is not a
#   whole number of a setting, but JSON.parse() reads "10.0" as 10, so the
#   port cannot see the difference. Those cases are in a list of their own,
#   value_is_valid_whole_floats, so the port's test can name the difference
#   instead of hiding it.
# - NaN and the infinities. JSON has no way to write them, and one of them
#   would make the whole file unreadable in JavaScript.
# - Half of a surrogate pair on its own, such as "\ud800". JSON.parse()
#   takes it, but Vite's JSON reader does not, and the tests load every
#   fixture file at once, so one such string stops all of them. What Python
#   says about these is in charsets.json (str_isprintable: none of them can be
#   shown), and the port tests them by hand.
# - A KeyError. build_values(), clamp_value() and plan_profile() raise one
#   when the caller and the module disagree about the keys. In TypeScript the
#   types make that mistake impossible to write, so there is nothing to
#   record. The desktop tests for it are ported as tests of their own.
# ---------------------------------------------------------------------------

SMILE = "\U0001f600"
# Given out in Unicode 16, after Python 3.13's tables (15.1). Python says it
# cannot be shown, a browser with newer tables says it can.
NEWER_EMOJI = "\U0001fae9"

# Names, with the characters Python and JavaScript disagree about: spaces only
# Python splits on, the byte order mark that JavaScript's trim() takes for a
# space, format and private use characters, letters whose case folding is more
# than lower-casing, and characters that are one in Python and two in
# JavaScript.
PROFILE_NAMES = [
    "Fast skim", "fast skim", "FAST SKIM", "Careful read", "careful READ", "Speed run", "A", "B",
    "  Fast   skim \t", "Fast\tskim", "Fast\nskim", "Fast\r\nskim", "\tFast skim\n",
    "", " ", "   ", "\t\n", "\r\n",
    "x" * 29, "x" * 30, "x" * 31, "  " + "x" * 30 + "  ", "x" * 15 + "   " + "x" * 14,
    "x" * 15 + " " + "x" * 15,
    "Fast\x00skim", "Fast\x07skim", "Fast\x7fskim", "Fast\x9fskim",
    "\x1cFast\x1d skim\x1e", "\x1fFast", "\x85Fast\x85", "Fast\x0bskim", "Fast\x0cskim",
    "Fast\xa0skim", "Fast\u2007skim", "Fast\u3000skim", "Fast\u2028skim", "Fast\u2029skim",
    "Fast \xa0 \u3000 skim",
    "\ufeffFast", "Fast\ufeff", "Fast\u200bskim", "Fast\u00adskim", "Fast\u200dskim",
    "Fast\u2060skim", "\u061cFast", "\ue000", "Fast\U000f0000",
    "Fast" + NEWER_EMOJI, NEWER_EMOJI,
    SMILE, SMILE * 29, SMILE * 30, SMILE * 31, "x" * 29 + SMILE, "x" * 30 + SMILE,
    "\U0001f468\u200d\U0001f469\u200d\U0001f467", "\U0001f44d\U0001f3fd",
    "Cafe\u0301", "Caf\u00e9", "CAF\u00c9",
    "\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac",
    "\u039f\u0394\u039f\u03a3", "\u03bf\u03b4\u03bf\u03c2", "\u03bf\u03b4\u03bf\u03c3",
    "\u041a\u0438\u0440\u0438\u043b\u043b\u0438\u0446\u0430",
    "\u043a\u0438\u0440\u0438\u043b\u043b\u0438\u0446\u0430",
    "Stra\u00dfe", "STRASSE", "strasse", "\u1e9e",
    "\ufb01le", "FILE", "file",
    "\u212aelvin", "kelvin", "\u0130stanbul", "istanbul", "i\u0307stanbul", "\u0131stanbul",
    "\u01c5ungla", "\u01c6ungla", "\u01c4UNGLA",
    "\u0663 three", "\uff26ast",
]

PROFILE_NOT_TEXT = [None, 42, 0, True, False, 1.5, [], {}, ["Fast skim"], {"name": "Fast skim"}]

PROFILE_EXISTING = [
    [], ["Fast skim"], ["  Fast   skim "], ["Fast skim", "Careful read"], ["FAST SKIM"],
    [None, 7, True, "Fast skim"], ["", "  "], ["x" * 31], ["Fast\x00skim"],
    ["Stra\u00dfe"], ["\u039f\u0394\u039f\u03a3"], ["\ufb01le"], ["\u212aelvin"],
    ["\u0130stanbul"], [SMILE * 30], ["\ufeffFast"],
]

# Keys that are not profile keys. The last few are names every JavaScript
# object has through its prototype, which a lookup in a plain object would
# find even though no one put them there.
PROFILE_OTHER_KEYS = [
    "window_width", "wpm", "font_size", "dyslexia_font_enabled", "bold_starts_enabled",
    "appearance_mode", "default_font_color", "default_chunk_size", "guide_mark_color_is_default",
    "GUIDE_MARK_COLOR", "", "__proto__", "constructor", "toString", "hasOwnProperty", "valueOf",
]

PROFILE_VALUES = [
    True, False, None, 0, 1, -1, 2, 3, 4, 10, 25, -50, 999, 5000, 2**31, 2**53, -(2**53), 10**20,
    1.5, -0.5, 2.25, "", "10", "true", "None",
    "#3B2E27", "#3b2e27", "#AABBCC", "#aAbB09", "#000000", "#FFFFFF",
    "3B2E27", "#3B2E2", "#3B2E277", "#GGGGGG", "red", "#3B2E27\n", "\n#3B2E27", " #3B2E27",
    "#3B2E27 ", "#\uff13B2E27", "#\u0663B2E27", "#3B2E2\U0001d7d7",
    [], {}, ["#3B2E27"], {"value": 1}, [1],
]

WHOLE_FLOATS = [0.0, -0.0, 1.0, 2.0, 3.0, 10.0, 300.0, -3.0, 1e20]


def profile_check_input(value, where):
    """Stops the script if a case holds something the tests would read
    differently, or could not read: a whole-number float, NaN or an
    infinity, or any surrogate code point. Two halves next to each other are
    two code points in Python, and JSON.parse() joins them into one. One on
    its own stops Vite's JSON reader."""
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            raise SystemExit(f"{where}: NaN or an infinity cannot go into JSON")
        if value.is_integer():
            raise SystemExit(f"{where}: {value!r} is a whole-number float, which JavaScript reads as an int")
    elif isinstance(value, str):
        if any("\ud800" <= character <= "\udfff" for character in value):
            raise SystemExit(f"{where}: {value!r} holds a surrogate code point")
    elif isinstance(value, dict):
        for key, item in value.items():
            profile_check_input(key, where)
            profile_check_input(item, where)
    elif isinstance(value, (list, tuple)):
        for item in value:
            profile_check_input(item, where)


def profile_random_values(rng, current):
    """A dict of the kind a profile's values could be after a hand edit or an
    old version: some profile keys, some other keys, in any order, with right
    and wrong kinds of value."""
    from core.profiles import PROFILE_KEYS

    keys = list(PROFILE_KEYS) + PROFILE_OTHER_KEYS
    chosen = rng.sample(keys, rng.randint(0, 12))
    values = {}
    for key in chosen:
        roll = rng.random()
        if roll < 0.45 and key in current:
            # A value of the right kind, often outside its range.
            value = current[key]
            if isinstance(value, bool):
                value = rng.choice([True, False])
            elif isinstance(value, int):
                value = rng.choice([value, value + rng.randint(-60, 60), -5, 0, 7000])
            elif key == "guide_mark_color":
                value = rng.choice([None, "#112233", "#aabbcc", "#3B2E27"])
            values[key] = value
        else:
            values[key] = rng.choice(PROFILE_VALUES)
    return values


def build_profiles(core):
    import core.profile_apply as apply
    import core.profiles as profiles
    from core.settings_store import AppSettings

    rng = random.Random(1755)
    keys = profiles.PROFILE_KEYS
    defaults = {key: getattr(AppSettings(), key) for key in keys}

    def as_dict(profile):
        return None if profile is None else profile.to_dict()

    def plan(*arguments):
        result = apply.plan_profile(*arguments)
        return {"values": result.values, "guide_mark_follows_theme": result.guide_mark_follows_theme}

    # --- Names ---
    names = PROFILE_NAMES + PROFILE_NOT_TEXT
    name_problem = [call(profiles.name_problem, name, []) for name in names]
    # A clash is only looked for once a name passed the other checks, so
    # only those names are tried against the lists of names already saved.
    usable = [name for name in PROFILE_NAMES if profiles.name_problem(name, []) is None]
    name_problem += [
        call(profiles.name_problem, name, existing)
        for existing in PROFILE_EXISTING[1:]
        for name in usable
    ]
    pair = ["Fast skim", "Careful read"]
    own_names = [None, "Fast skim", "  fast SKIM ", "FAST SKIM", "Careful read", "Nope", "", 42]
    renames = ["Fast skim", "FAST SKIM", "fast  skim", "Careful read", "careful READ", "Speed run", "", None]
    name_problem += [
        call(profiles.name_problem, name, pair, own)
        for own in own_names
        for name in renames
    ]

    # --- Values ---
    every_key = list(keys) + PROFILE_OTHER_KEYS
    value_is_valid = [call(profiles.value_is_valid, key, value) for key in every_key for value in PROFILE_VALUES]
    whole_floats = [
        call(profiles.value_is_valid, key, value)
        for key in ("skip_word_count", "highlight_offset_px", "letter_spacing_level", "default_wpm",
                    "pause_on_skip", "guide_mark_color", "window_width")
        for value in WHOLE_FLOATS
    ]

    in_profile_order = dict(reversed(list(defaults.items())))
    fixed_values = [
        None, [], "text", 5, True, [["skip_word_count", 5]],
        {}, dict(defaults), {**defaults, "guide_mark_color": None}, in_profile_order,
        {"skip_word_count": 10, "window_width": 1000, "made_up": 1, "wpm": 300},
        {"skip_word_count": "many", "pause_on_skip": 1, "guide_mark_color": "red", "resume_rewind_words": 4},
        {"guide_mark_color": None, "skip_word_count": None},
        {"pause_on_skip": True, "highlight_offset_px": 1},
        {"letter_spacing_level": 2, "dyslexia_font_enabled": True, "skip_word_count": 25},
        {"wpm": 600, "font_size": 28, "skip_word_count": 25},
        {"__proto__": {"skip_word_count": 5}, "constructor": 3, "toString": True, "skip_word_count": 7},
        {"valueOf": 1, "hasOwnProperty": "#112233"},
    ]
    random_values = [profile_random_values(rng, defaults) for _ in range(200)]
    sanitize_values = [call(profiles.sanitize_values, values) for values in fixed_values + random_values]

    # build_values copies whatever it is given, and checks nothing but the
    # keys that follow the theme.
    numbered = {key: index for index, key in enumerate(keys)}
    with_extras = {**defaults, "window_width": 1234, "default_font_color": "#112233", "dyslexia_font_enabled": True}
    odd_kinds = {**defaults, "skip_word_count": "many", "pause_on_skip": None, "guide_mark_color": "red"}
    build_values = [call(profiles.build_values, settings) for settings in (defaults, numbered, with_extras, odd_kinds)]
    build_values += [
        call(profiles.build_values, settings, following)
        for settings in (defaults, with_extras, {**defaults, "guide_mark_color": "#112233"})
        for following in ([], ["guide_mark_color"], ["guide_mark_color", "guide_mark_color"],
                          ["skip_word_count"], ["window_width"], ["guide_mark_color", "skip_word_count"], [""])
    ]

    # --- Loading ---
    raw_profiles = [None, "text", 5, True, [], ["Fast", {}], {}]
    raw_profiles += [{"name": name, "values": {"skip_word_count": 25}} for name in names]
    raw_profiles += [
        {"values": {}}, {"name": "A"}, {"NAME": "A", "values": {}}, {"name": "A", "values": {}, "extra": 1},
        {"name": "A", "Values": {}},
    ]
    raw_profiles += [
        {"name": "A", "values": values}
        for values in (None, [], "nope", 5, True, {}, {"skip_word_count": 25, "guide_mark_color": "red"},
                       {"guide_mark_color": None}, in_profile_order,
                       {"__proto__": {"skip_word_count": 5}, "constructor": 3})
    ]
    profile_from_dict = [call(lambda raw: as_dict(profiles.profile_from_dict(raw)), raw) for raw in raw_profiles]

    def entry(name, values=None):
        return {"name": name, "values": {"skip_word_count": 25} if values is None else values}

    fixed_lists = [
        None, {}, "text", 5, entry("A"), [],
        [entry("B", {"skip_word_count": 20}), entry("A", {"skip_word_count": 30})],
        ["junk", None, entry("Good", {"skip_word_count": 30}), {"name": "", "values": {}}],
        [entry("Fast", {"skip_word_count": 40}), entry("FAST", {"skip_word_count": 10})],
        [entry("Old", {"wpm": 600, "font_size": 28, "skip_word_count": 25})],
        [entry("  Fast   skim "), entry("fast skim"), entry("FAST\tSKIM")],
        [entry("Stra\u00dfe"), entry("STRASSE"), entry("strasse")],
        [entry("\u039f\u0394\u039f\u03a3"), entry("\u03bf\u03b4\u03bf\u03c2"), entry("\u03bf\u03b4\u03bf\u03c3")],
        [entry("\ufb01le"), entry("FILE")],
        [entry("\u212aelvin"), entry("kelvin")],
        [entry("\u0130stanbul"), entry("istanbul"), entry("i\u0307stanbul")],
        [entry(""), entry("A"), {"name": "a", "values": "nope"}, entry("a")],
        [{"name": "A", "values": None}, entry("a")],
        [entry("x" * 31), entry("x" * 30)],
        [entry(SMILE * 30), entry(SMILE * 31)],
        [entry("Fast\x00skim"), entry("Fast skim")],
        [entry("\ufeffFast"), entry("Fast")],
        [entry("Fast" + NEWER_EMOJI), entry("Fast")],
    ]
    pool = [item for item in raw_profiles if not isinstance(item, (list, type(None)))]
    pool += [entry(name, profile_random_values(rng, defaults)) for name in rng.sample(PROFILE_NAMES, 30)]
    random_lists = [[rng.choice(pool) for _ in range(rng.randint(0, 7))] for _ in range(150)]
    clean_profile_list = [call(profiles.clean_profile_list, raw) for raw in fixed_lists + random_lists]

    # --- Applying ---
    clamp_value = [
        call(apply.clamp_value, key, value)
        for key, (low, high) in apply.NUMBER_RANGES.items()
        for value in unique([low - 1000, low - 1, low, low + 1, (low + high) // 2, high - 1, high,
                             high + 1, high + 1000, 0, 10**20, -(10**20)])
    ]

    currents = [
        defaults,
        {**defaults, "skip_word_count": 7, "warm_up_enabled": True, "guide_mark_color": "#112233"},
        {**defaults, "skip_word_count": 999, "letter_spacing_level": 3, "default_wpm": 450},
        {**defaults, **{key: not value for key, value in defaults.items() if isinstance(value, bool)}},
        {**defaults, "window_width": 1000, "default_font_color": "#3B2E27"},
    ]
    themes = ["#3B2E27", "#F2E8DC"]
    older = {key: value for key, value in defaults.items()
             if key not in ("default_wpm", "default_font_size", "font_size_step",
                            "split_long_paragraphs_enabled", "scrub_pause_enabled", "letter_spacing_level")}
    fixed_plans = [
        {}, None, [], "text", older,
        {"skip_word_count": 999, "highlight_offset_px": -50, "guide_mark_thickness_px": 1,
         "guide_mark_length_percent": 100, "resume_rewind_words": 0},
        {"default_wpm": 5000, "default_font_size": 4, "font_size_step": 99},
        {"letter_spacing_level": 99}, {"letter_spacing_level": -4}, {"letter_spacing_level": 0},
        {"skip_word_count": "many", "pause_on_skip": 0}, {"skip_word_count": True},
        {"wpm": 600, "font_size": 28, "window_width": 1200, "skip_word_count": 25},
        {"guide_mark_color": None}, {"guide_mark_color": "#AABBCC"}, {"guide_mark_color": "#F2E8DC"},
        {"guide_mark_color": "red"}, {"skip_word_count": 999, "guide_mark_color": None},
        {**defaults, "guide_mark_color": None},
    ]
    # Whether the colour follows the theme matters when the profile has no
    # colour, and the theme's colour when it stores None, so two pairs that
    # differ in both are enough for the fixed cases.
    plan_profile = [
        call(plan, values, current, follows, theme)
        for values in fixed_plans
        for current in currents
        for follows, theme in ((True, themes[0]), (False, themes[1]))
    ]
    plan_profile += [
        call(plan, profile_random_values(rng, defaults), rng.choice(currents), rng.choice([True, False]),
             rng.choice(themes))
        for _ in range(120)
    ]

    functions = {
        "PROFILE_KEYS": [[[], list(keys)]],
        "THEME_COLOR_KEYS": [[[], list(profiles.THEME_COLOR_KEYS)]],
        "MAX_NAME_LENGTH": [[[], profiles.MAX_NAME_LENGTH]],
        "NUMBER_RANGES": [[[], {key: list(limits) for key, limits in apply.NUMBER_RANGES.items()}]],
        "defaults": [[[], defaults]],
        "clean_name": [call(profiles.clean_name, name) for name in names],
        "name_problem": name_problem,
        "value_is_valid": value_is_valid,
        "sanitize_values": sanitize_values,
        "build_values": build_values,
        "profile_from_dict": profile_from_dict,
        "clean_profile_list": clean_profile_list,
        "clamp_value": clamp_value,
        "plan_profile": plan_profile,
    }
    for name, cases in functions.items():
        profile_check_input(cases, f"profiles.{name}")
    for case in whole_floats:
        if case[1] is not False:
            raise SystemExit(f"Python took a whole-number float as valid: {case}")
    functions["value_is_valid_whole_floats"] = whole_floats
    return functions



# ---------------------------------------------------------------------------
# Phase 6: speaker cues. core/chime.py is pure: which notes each speaker
# gets, how long a chime lasts, how close two chimes may be, and the samples
# of each chime. The desktop writes the samples into a WAV file for winsound;
# the web puts the same samples into an AudioBuffer, so only the samples are
# recorded, not the WAV header. A chime has tens of thousands of samples, so
# each one is recorded as its length, its peak, a SHA-256 of the samples as
# little-endian 16-bit numbers (a browser can work that out too), the first
# 64 samples and every 997th one, which say where a difference is.
# ---------------------------------------------------------------------------

CHIME_START_SAMPLES = 64
CHIME_SPACING = 997


def chime_samples(wav):
    """The samples of a WAV file chime_wav() made, checked to be the mono
    16-bit file at the sample rate it promises."""
    import hashlib
    import io
    import wave
    from array import array

    with wave.open(io.BytesIO(wav)) as file:
        shape = (file.getnchannels(), file.getsampwidth(), file.getframerate())
        if shape != (1, 2, 44100):
            raise SystemExit(f"chime_wav made a file of another shape: {shape}")
        data = file.readframes(file.getnframes())
    samples = array("h", data)
    if array("h", [1]).tobytes() != b"\x01\x00":
        samples.byteswap()
    return {
        "frames": len(samples),
        "peak": max(abs(value) for value in samples),
        "sha256": hashlib.sha256(data).hexdigest(),
        "start": list(samples[:CHIME_START_SAMPLES]),
        "spaced": list(samples[::CHIME_SPACING]),
    }


def chime_wav_case(chime, notes, style, volume=None):
    """One chime_wav() case. The volume is left out of the arguments when
    the call leaves it out, so the default is what is checked."""
    arguments = [list(notes), style] + ([] if volume is None else [volume])
    try:
        wav = chime.chime_wav(*arguments)
    except ValueError:
        return [arguments, None, "ValueError"]
    return [arguments, chime_samples(wav)]


def gap_script(chime, steps, min_gap_ms=None):
    """A run of ChimeGap.allow() calls on one new ChimeGap. A step is
    [now_ms, length_ms], or [now_ms] to use the default length."""
    gap = chime.ChimeGap() if min_gap_ms is None else chime.ChimeGap(min_gap_ms)
    answers = [gap.allow(*step) for step in steps]
    return [[min_gap_ms, steps], answers]


def build_chime(core):
    import core.chime as chime

    styles = list(chime.CHIME_STYLES)
    patterns = [list(notes) for notes in chime.SPEAKER_PATTERNS]
    every_pattern = patterns + [list(chime.CHANGE_PATTERN)]

    style_table = [
        [name, [[list(partial) for partial in style.partials], style.decay_ms, style.attack_ms, style.note_ms]]
        for name, style in chime._STYLES.items()
    ]
    if [name for name, _ in style_table] != styles:
        raise SystemExit("The chime styles are not listed in the order of CHIME_STYLES.")

    lengths = []
    for style in styles + ["Bell", "", "chime"]:
        for count in range(7):
            notes = [523.25] * count
            try:
                lengths.append([[notes, style], chime.chime_length_ms(notes, style)])
            except KeyError:
                lengths.append([[notes, style], None, "KeyError"])
    lengths.append([[[523.25, 783.99]], chime.chime_length_ms([523.25, 783.99])])

    wavs = [chime_wav_case(chime, notes, style) for style in styles for notes in every_pattern]
    wavs.append([[[523.25]], chime_samples(chime.chime_wav([523.25]))])
    for volume in [0, 1, 0.5, 0.123, 0.0001]:
        wavs.append(chime_wav_case(chime, [523.25], "bell", volume))
    wavs.append(chime_wav_case(chime, [523.25, 659.25, 783.99], "glass", 1))
    others = [
        ([440], "wood"),
        ([100, 200, 300, 400, 500, 600], "soft"),
        ([20], "bell"),
        ([261.63, 261.63], "bell"),
        ([7349.99], "bell"),
        ([2204.99], "wood"),
        ([4083.33], "glass"),
        ([22049.99], "soft"),
    ]
    wavs += [chime_wav_case(chime, notes, style) for notes, style in others]
    problems = [
        ([523.25], "Bell", None),
        ([523.25], "", None),
        ([523.25], "chime", None),
        ([], "bell", None),
        ([523.25], "bell", -0.01),
        ([523.25], "bell", 1.01),
        ([523.25], "bell", 2),
        ([0], "bell", None),
        ([-440], "soft", None),
        ([523.25, 0], "bell", None),
        ([7350], "bell", None),
        ([2205], "wood", None),
        ([4083.34], "glass", None),
        ([22050], "soft", None),
    ]
    wavs += [chime_wav_case(chime, notes, style, volume) for notes, style, volume in problems]
    for case in wavs:
        if len(case) == 3 and case[2] != "ValueError":
            raise SystemExit(f"chime_wav raised something else: {case}")

    speaker_lists = [
        [],
        ["Ann"],
        ["Ann", "Bob", "Ann"],
        [">>"],
        [">>", "Ann", ">>", "Bob", ">>"],
        ["Ann", "Bob", "Cy", "Di", "Ed"],
        ["Ann", "Bob", "Cy", "Di", "Ed", "Fay"],
        ["Ann", "Bob", "Cy", "Di", "Ed", "Fay", "Gus", "Hal", "Ivy", "Jo", "Kim", "Lu"],
        ["ann", "Ann", "ANN"],
        ["Dr. Smith", "Interviewer", "Dr. Smith", "\u00c9lodie", "\U0001F600 Smile"],
        ["", "Ann"],
    ]
    speaker_pattern_cases = [
        [[speakers], [[name, list(notes)] for name, notes in chime.speaker_patterns(speakers).items()]]
        for speakers in speaker_lists
    ]

    note_cases = []
    pattern_sets = [[], ["Ann", ">>", "Bob"], ["Ann", "Bob", "Cy", "Di", "Ed", "Fay"]]
    for speakers in pattern_sets:
        found = chime.speaker_patterns(speakers)
        pairs = [[name, list(notes)] for name, notes in found.items()]
        for sound in ["off", "change", "per_speaker", "", "Change", "per-speaker", None]:
            for speaker in [None, "Ann", "Bob", "Fay", "Zed", ">>", ""]:
                notes = chime.chime_notes(sound, speaker, found)
                note_cases.append([[sound, speaker, pairs], None if notes is None else list(notes)])

    rng = random.Random(1755)
    chime_lengths = [chime.chime_length_ms(notes, style) for style in styles for notes in every_pattern]
    wander = []
    now = 0
    for _ in range(300):
        now += rng.choice([0, 1, 50, 120, 250, 399, 400, 401, 450, 600, 699, 700, 1000, 2500])
        wander.append([now, rng.choice(chime_lengths + [0])])
    gaps = [
        gap_script(chime, [[0, 450], [100, 450], [399, 450], [449, 450], [450, 450], [500, 0],
                           [850, 0], [899, 0], [900, 0], [1300, 300]]),
        gap_script(chime, [[0], [399], [400], [799.5], [800]]),
        gap_script(chime, [[0, 700], [400, 0], [699.9, 0], [700, 0], [1100, 0]]),
        gap_script(chime, [[1000, 450], [900, 450], [1000, 450], [1349, 0], [1350, 0]]),
        gap_script(chime, [[0.5, 450], [450.4, 450], [450.5, 450]]),
        gap_script(chime, [[0, 0], [0, 0], [0, 10], [5, 0], [10, 0]], 0),
        gap_script(chime, [[0, 450], [450, 0], [999, 0], [1000, 0]], 1000),
        gap_script(chime, [[-500, 450], [-100, 0], [-50, 0]]),
        gap_script(chime, wander),
    ]

    return {
        "sample_rate": [[[], chime.SAMPLE_RATE]],
        "chime_volume": [[[], chime.CHIME_VOLUME]],
        "note_step_ms": [[[], chime.NOTE_STEP_MS]],
        "speaker_patterns_table": [[[], patterns]],
        "change_pattern": [[[], list(chime.CHANGE_PATTERN)]],
        "min_chime_gap_ms": [[[], chime.MIN_CHIME_GAP_MS]],
        "chime_styles": [[[], styles]],
        "styles": [[[], style_table]],
        "end_fade_ms": [[[], chime._END_FADE_MS]],
        "full_scale": [[[], chime._FULL_SCALE]],
        "chime_length_ms": lengths,
        "chime_wav": wavs,
        "speaker_patterns": speaker_pattern_cases,
        "chime_notes": note_cases,
        "chime_gap": gaps,
    }

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
    "settings_search": build_settings_search,
    "theme": build_theme,
    "settings_view": build_settings_view,
    "scroll": build_scroll,
    "case": build_case,
    "storage": build_storage,
    "bundle": build_bundle,
    "library": build_library,
    "settings": build_settings,
    "normalizer": build_normalizer,
    "desktop_tests": build_desktop_tests,
    "colors": build_colors,
    "importers": build_importers,
    "letter_spacing": build_letter_spacing,
    "font_choice": build_font_choice,
    "bold_starts": build_bold_starts,
    "rich_copy": build_rich_copy,
    "profiles": build_profiles,
    "chime": build_chime,
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
        text = to_json({**meta, **EXTRA_META.get(name, {})}, functions)
        (out / f"{name}.json").write_text(text, encoding="ascii", newline="\n")
        total = sum(len(cases) for cases in functions.values())
        print(f"{name}.json: {total} cases, {len(text) // 1024} KB")

    table = here.parents[2] / "src" / "core" / "pythonCasefoldTable.ts"
    table.write_text(casefold_table(), encoding="ascii", newline="\n")
    print(f"{table.name}: written")
    table = table.with_name("pythonLowerTable.ts")
    table.write_text(lower_table(), encoding="ascii", newline="\n")
    print(f"{table.name}: written")
    table = table.with_name("pythonDigitTable.ts")
    table.write_text(digit_table(), encoding="ascii", newline="\n")
    print(f"{table.name}: written")
    table = table.with_name("pythonPrintableTable.ts")
    table.write_text(printable_table(), encoding="ascii", newline="\n")
    print(f"{table.name}: written")


if __name__ == "__main__":
    main()
