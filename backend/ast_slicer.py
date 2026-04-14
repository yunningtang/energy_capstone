"""
Tree-sitter based Java source-code slicer.

The LLM quality degrades when we paste a whole 2000-line file into the prompt.
For each energy pattern we only need a *relevant slice* of the file — the
methods / classes that touch the APIs tied to that pattern.

This module walks a Java parse tree and extracts those slices. It is resilient
to malformed source (returns the original text when parsing fails).

Used by `task_manager._process_file` before invoking the LLM. Pure Python,
no project imports, safe to test in isolation.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable

try:
    import tree_sitter
    import tree_sitter_java
    _HAS_TS = True
except Exception:  # pragma: no cover — optional dep
    _HAS_TS = False


# API-name hints per energy pattern. A method/class is kept in the slice
# when any of these substrings appears in its body text.
PATTERN_HINTS: dict[str, tuple[str, ...]] = {
    "DW":   ("WakeLock", "wakeLock", "acquire", "release", "PARTIAL_WAKE_LOCK", "newWakeLock"),
    "HMU":  ("HashMap", "java.util.HashMap"),
    "HAS":  ("AsyncTask", "doInBackground", "onPostExecute", "onPreExecute", "onProgressUpdate", "Thread.sleep"),
    "IOD":  ("onDraw", "Canvas", "new Paint", "new Rect", "new Bitmap"),
    "NLMR": ("extends Activity", "extends Service", "extends AppCompatActivity",
             "extends FragmentActivity", "onLowMemory", "onTrimMemory"),
}


@dataclass
class Slice:
    """A contiguous source-code slice with 1-indexed line bounds."""
    text: str
    start_line: int
    end_line: int


@lru_cache(maxsize=1)
def _parser() -> "tree_sitter.Parser | None":
    if not _HAS_TS:
        return None
    lang = tree_sitter.Language(tree_sitter_java.language())
    p = tree_sitter.Parser(lang)
    return p


def _node_text(node, src_bytes: bytes) -> str:
    return src_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _walk(node) -> Iterable:
    yield node
    for child in node.children:
        yield from _walk(child)


def slice_for_pattern(source: str, pattern: str, context_lines: int = 2) -> Slice | None:
    """
    Return a slice containing only the methods / class declarations that
    reference any keyword for `pattern`. Slice preserves original line numbers.
    Returns None if nothing relevant is found.
    """
    parser = _parser()
    if parser is None or not source:
        return None

    hints = PATTERN_HINTS.get(pattern.upper())
    if not hints:
        return None

    src_bytes = source.encode("utf-8")
    tree = parser.parse(src_bytes)
    root = tree.root_node

    # Collect candidate nodes: method declarations, class declarations, constructor decls.
    KEEP_TYPES = {"method_declaration", "constructor_declaration", "class_declaration"}
    kept_ranges: list[tuple[int, int]] = []  # (start_line, end_line) — 1-indexed inclusive
    source_lines = source.splitlines()
    n_lines = len(source_lines)

    def _matches(text: str) -> bool:
        return any(h in text for h in hints)

    for node in _walk(root):
        if node.type not in KEEP_TYPES:
            continue
        text = _node_text(node, src_bytes)
        if not _matches(text):
            continue
        start = max(1, node.start_point[0] + 1 - context_lines)
        end = min(n_lines, node.end_point[0] + 1 + context_lines)
        kept_ranges.append((start, end))

    # Also keep the package + imports header — the LLM needs context about
    # which APIs the file uses.
    import_end = 0
    for node in root.children:
        if node.type in ("package_declaration", "import_declaration"):
            import_end = max(import_end, node.end_point[0] + 1)
    header_range = (1, import_end) if import_end > 0 else None

    if not kept_ranges:
        return None

    # Merge overlapping / adjacent ranges.
    all_ranges = ([header_range] if header_range else []) + sorted(kept_ranges)
    merged: list[list[int]] = []
    for start, end in all_ranges:
        if merged and start <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])

    # Build the sliced text with "// ... N lines omitted ..." markers between gaps.
    out_parts: list[str] = []
    prev_end = 0
    for start, end in merged:
        if prev_end > 0 and start > prev_end + 1:
            omitted = start - prev_end - 1
            out_parts.append(f"    // ... {omitted} lines omitted ...")
        out_parts.extend(source_lines[start - 1:end])
        prev_end = end

    if prev_end < n_lines:
        out_parts.append(f"    // ... {n_lines - prev_end} lines omitted ...")

    return Slice(
        text="\n".join(out_parts),
        start_line=merged[0][0],
        end_line=merged[-1][1],
    )


def build_sliced_prompt_code(source: str, patterns: Iterable[str], max_chars: int = 12000) -> str:
    """
    Build a condensed representation of `source` that retains only regions
    relevant to the requested patterns. Falls back to truncated full source
    when slicing is unavailable or finds nothing.
    """
    if _parser() is None:
        return source[:max_chars]

    unique_ranges: list[tuple[int, int]] = []
    for p in patterns:
        sl = slice_for_pattern(source, p)
        if sl is not None:
            unique_ranges.append((sl.start_line, sl.end_line))

    if not unique_ranges:
        return source[:max_chars]

    # Merge ranges across all patterns and emit a single combined slice.
    unique_ranges.sort()
    merged: list[list[int]] = []
    for start, end in unique_ranges:
        if merged and start <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])

    source_lines = source.splitlines()
    n_lines = len(source_lines)

    # Keep imports header
    header = ""
    parser = _parser()
    if parser is not None:
        tree = parser.parse(source.encode("utf-8"))
        import_end = 0
        for node in tree.root_node.children:
            if node.type in ("package_declaration", "import_declaration"):
                import_end = max(import_end, node.end_point[0] + 1)
        if import_end > 0 and merged and merged[0][0] > import_end:
            header = "\n".join(source_lines[:import_end]) + "\n    // ... imports end ...\n"

    parts: list[str] = []
    prev_end = 0
    for start, end in merged:
        if prev_end > 0 and start > prev_end + 1:
            parts.append(f"    // ... {start - prev_end - 1} lines omitted ...")
        parts.extend(source_lines[start - 1:end])
        prev_end = end
    if prev_end < n_lines:
        parts.append(f"    // ... {n_lines - prev_end} lines omitted ...")

    sliced = header + "\n".join(parts)
    return sliced[:max_chars] if len(sliced) > max_chars else sliced
