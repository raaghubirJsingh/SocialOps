#!/usr/bin/env python3
import re
import sys

# Dictionary of hand-verified Merriam-Webster/CMU dictionary syllable counts:
TABLE = {
    "software": 2,     # soft-ware
    "fails": 1,        # fails
    "softly": 2,       # soft-ly
    "recovers": 3,     # re-cov-ers
    "swiftly": 2,      # swift-ly
    "from": 1,         # from
    "shock": 1,        # shock
    "never": 2,        # nev-er
    "trust": 1,        # trust
    "the": 1,          # the
    "code": 1,         # code
}

SUBJECT = {"code", "software", "system", "reliability", "stable", "bug", "fail",
           "fault", "deploy", "build", "test", "lint", "ship", "ops", "engineer",
           "graceful", "degrade", "recover", "recovers"}

def words_of(line):
    return re.findall(r"[A-Za-z']+", line)

def check(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    lines = raw.splitlines()
    failures = []

    if len(lines) != 1:
        failures.append(f"FAIL line count: expected exactly 1 line, got {len(lines)}")
    line = lines[0].strip() if lines else ""

    if line.startswith("#") or line.startswith("##"):
        failures.append("FAIL: looks like a markdown title")
    if line.startswith('"') and line.endswith('"'):
        failures.append("FAIL: wrapped in quotes (looks like commentary)")

    toks = [w.lower() for w in words_of(line)]
    unknown = [w for w in toks if w not in TABLE]
    if unknown:
        failures.append(f"FAIL unknown words (need hand-verified counts): {unknown}")
        return failures, line, []

    counts = [TABLE[w] for w in toks]
    total = sum(counts)

    phrases = [p.strip() for p in re.split(r"[,;\-]| and ", line) if p.strip()]
    if len(phrases) != 3:
        failures.append(f"FAIL phrase count: expected 3 phrases, got {len(phrases)}: {phrases}")
        pcounts = []
    else:
        pcounts = []
        for p in phrases:
            pw = [w.lower() for w in words_of(p)]
            pcounts.append(sum(TABLE[w] for w in pw))
        if pcounts != [5, 7, 5]:
            failures.append(f"FAIL phrase syllables: {pcounts} (need [5,7,5]) phrases={phrases}")

    if total != 17:
        failures.append(f"FAIL total syllables: {total} (need 17)")

    if not (set(toks) & SUBJECT):
        failures.append("FAIL subject: no software-reliability vocabulary found")

    return failures, line, list(zip(toks, counts))

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "C:/SocialOps/.arena/run-20261027-085332-s344654/r0/a006.md"
    fails, line, detail = check(path)
    print(f"LINE: {line!r}")
    print(f"PER-WORD: {detail} -> total {sum(c for _, c in detail) if detail else 'N/A'}")
    if fails:
        for f in fails:
            print(f)
        sys.exit(1)
    print("PASS: all acceptance checks")