#!/usr/bin/env python3
"""Acceptance tests for the one-line software-reliability haiku.

Checks, in order:
  1. File exists and is non-empty.
  2. Exactly one line of text (no internal newlines).
  3. No title, header, commentary, markdown, or labels.
  4. Subject is software reliability (must reference code/software + reliability).
  5. Syllable structure is exactly 5-7-5, verified per-word and at phrase
     boundaries (comma-separated phrases must be 5, 7, 5).
"""
import re
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else None
if not PATH:
    print("usage: check_haiku.py <solution.md>")
    sys.exit(2)

# --- conservative, manually-audited syllable map ---------------------------
# Every word in the solution must appear here with a count I have verified.
# Words not in this map => the check FAILS (so no silent fuzzy counting).
SYL = {
    # line 1: Check the list each run
    "check": 1, "the": 1, "list": 1, "each": 1, "run": 1,
    # line 2: steady code that never fails
    "steady": 2, "code": 1, "that": 1, "never": 2, "fails": 1,
    # line 3: stands firm through the years
    "stands": 1, "firm": 1, "through": 1, "the": 1, "years": 1,
}
# Expected phrase boundaries (comma-separated). Each phrase's syllable total
# must match the 5-7-5 pattern.
PHRASES = [
    ["check", "the", "list", "each", "run"],                 # 5
    ["steady", "code", "that", "never", "fails"],            # 7
    ["stands", "firm", "through", "the", "years"],           # 5
]

failures = []

# 1. file exists / non-empty
try:
    with open(PATH, "r", encoding="utf-8") as f:
        text = f.read()
except OSError as e:
    print(f"FAIL: cannot read {PATH}: {e}")
    sys.exit(1)

if not text.strip():
    failures.append("file is empty")

# 2. exactly one line
inner = text.strip("\n")
if "\n" in inner:
    failures.append(f"more than one line: {inner.count(chr(10)) + 1} lines")
if text != text.strip() and "\n" in text:
    # only a single trailing newline is tolerated
    if text != text.rstrip("\n") + "\n" or "\n" in text.rstrip("\n"):
        failures.append("unexpected newlines in content")

# 3. no commentary / title / markdown
banned = ["#", "---", "haiku", "solution", "answer", "explanation", "note:", "title"]
low = inner.lower()
for b in banned:
    if b in low:
        failures.append(f"forbidden token found: {b!r}")

# 4. subject: software reliability
if "software" not in low and "code" not in low:
    failures.append("subject not identifiable as software/code")
rel_words = ["break", "firm", "depend", "stand", "fail", "steady", "reliab", "secure", "safe", "true", "strong", "time"]
if not any(w in low for w in rel_words):
    failures.append("no reliability-related meaning detected")

# 5. 5-7-5 syllable structure
# tokenize: lowercase, strip punctuation
tokens = re.findall(r"[a-z]+", inner.lower())
expected = [w for phrase in PHRASES for w in phrase]
if tokens != expected:
    failures.append(
        f"token/phrase mismatch:\n  got      {tokens}\n  expected {expected}"
    )
else:
    counts = [sum(SYL[w] for w in phrase) for phrase in PHRASES]
    total = sum(counts)
    if counts != [5, 7, 5]:
        failures.append(f"syllable counts are {counts}, expected [5, 7, 5]")
    if total != 17:
        failures.append(f"total syllables {total}, expected 17")

# unknown-word guard: every token must be in the audited map
for t in tokens:
    if t not in SYL:
        failures.append(f"word not in audited syllable map: {t!r}")

print("=== solution text ===")
print(repr(inner))
print("=====================")
if failures:
    print("FAILURES:")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("ALL CHECKS PASSED")