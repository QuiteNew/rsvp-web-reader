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

To add a module: write a build_<module>() function that returns
{function name: [cases]}, and add it to MODULES at the bottom. A case is
[[arguments], result], or [[arguments], None, "ValueError"] when the call
is expected to raise.
"""

import sys

sys.dont_write_bytecode = True

import argparse
import json
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
    return {
        "str_isspace": ranges(str.isspace),
        "re_space": ranges(lambda ch: space.fullmatch(ch) is not None),
        "re_digit": ranges(lambda ch: digit.fullmatch(ch) is not None),
        "str_isalnum": ranges(str.isalnum),
        "unassigned": ranges(lambda ch: unicodedata.category(ch) == "Cn"),
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


MODULES = {
    "charsets": build_charsets,
    "tokenizer": build_tokenizer,
    "parser": build_parser,
    "punctuation": build_punctuation,
    "orp": build_orp,
    "timing": build_timing,
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


if __name__ == "__main__":
    main()
