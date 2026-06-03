import hashlib
from typing import List
from backend.models.schema import TestCaseResponse


def compute_hash(title: str, steps_text: str) -> str:
    key = (title.lower().strip() + steps_text.lower().strip())
    return hashlib.md5(key.encode()).hexdigest()


def _steps_to_text(steps: list) -> str:
    if not steps:
        return ""
    parts = []
    for s in steps:
        if isinstance(s, dict):
            parts.append(f"{s.get('keyword','')} {s.get('text','')}")
        else:
            parts.append(str(s))
    return " ".join(parts)


def _jaccard(a: str, b: str) -> float:
    sa = set(a.lower().split())
    sb = set(b.lower().split())
    if not sa and not sb:
        return 1.0
    intersection = sa & sb
    union = sa | sb
    return len(intersection) / len(union)


def deduplicate(
    new_cases: list,         # list of raw dicts from agent output
    existing_hashes: set,    # hashes already in DB
    similarity_threshold: float = 0.82,
) -> list:
    """
    Returns only unique test cases from new_cases.
    Filters against existing_hashes (DB) and within the batch itself.
    """
    seen_hashes: set = set(existing_hashes)
    seen_titles: list = []
    unique = []

    for tc in new_cases:
        steps_text = _steps_to_text(tc.get("gherkin_steps", []))
        h = compute_hash(tc.get("title", ""), steps_text)

        # exact duplicate via hash
        if h in seen_hashes:
            continue

        # fuzzy duplicate within this batch
        title = tc.get("title", "").lower()
        is_similar = any(
            _jaccard(title, t) >= similarity_threshold
            for t in seen_titles
        )
        if is_similar:
            continue

        seen_hashes.add(h)
        seen_titles.append(title)
        tc["hash_key"] = h
        unique.append(tc)

    return unique