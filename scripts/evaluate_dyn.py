#!/usr/bin/env python3
"""
Evaluate LLM against Dyn_Validation ground truth.

Reads dyn_validation from DB, finds Java source by class_name, runs LLM analysis,
and compares with ground truth. Reports Precision, Recall, F1 per pattern.

Prerequisites:
  1. Import Dyn_Validation: python scripts/import_dyn_data.py --validation
  2. Have Java source code in a folder (decompiled app or repo)

Usage (from repo root):
  python scripts/evaluate_dyn.py --source-dir "C:/path/to/java/source"
  python scripts/evaluate_dyn.py --source-dir ./dyn_source --pattern DW --limit 20
"""
import asyncio
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from database import DynValidation, get_db_session, init_db
from sqlalchemy import select
from task_manager import TaskManager


def find_java_file(class_name: str, source_dir: Path) -> Path | None:
    """Find Java file for class_name under source_dir."""
    if not source_dir.exists():
        return None
    # Try qualified path first
    if "." in class_name:
        rel = class_name.replace(".", "/") + ".java"
        p = source_dir / rel
        if p.exists():
            return p
    # Search by simple class name
    simple = class_name.split(".")[-1] + ".java"
    for p in source_dir.rglob(simple):
        return p
    return None


async def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate LLM vs Dyn_Validation")
    parser.add_argument(
        "--source-dir",
        type=Path,
        required=True,
        help="Root folder containing Java source (e.g. decompiled app or repo)",
    )
    parser.add_argument(
        "--pattern",
        type=str,
        help="Only evaluate this pattern (DW, HMU, HAS, IOD, NLMR)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max entries per pattern (0 = no limit)",
    )
    args = parser.parse_args()

    source_dir = args.source_dir.resolve()
    if not source_dir.exists():
        print(f"Error: source dir not found: {source_dir}")
        sys.exit(1)

    init_db()
    manager = TaskManager()

    with get_db_session() as db:
        stmt = select(DynValidation).order_by(DynValidation.pattern, DynValidation.class_name)
        if args.pattern:
            stmt = stmt.where(DynValidation.pattern == args.pattern.upper())
        rows = list(db.scalars(stmt))

    if not rows:
        print("No dyn_validation data. Run: python scripts/import_dyn_data.py --validation")
        sys.exit(1)

    per_pattern: dict[str, dict[str, int]] = {}
    per_pattern_seen: dict[str, int] = {}
    skipped = 0

    for v in rows:
        if args.limit:
            n = per_pattern_seen.get(v.pattern, 0)
            if n >= args.limit:
                continue
            per_pattern_seen[v.pattern] = n + 1

        fpath = find_java_file(v.class_name, source_dir)
        if not fpath or not fpath.exists():
            skipped += 1
            continue

        try:
            code = fpath.read_text(encoding="utf-8", errors="replace")
        except Exception:
            skipped += 1
            continue

        findings = await manager.analyze_code(code, patterns=[v.pattern])
        pred = "No"
        for r in findings:
            if r["smell_type"] == v.pattern:
                pred = "Yes" if r["has_smell"] else "No"
                break

        true_val = str(v.code_smell or "No").strip()
        if true_val.lower() in ("yes", "y", "1", "true"):
            true_val = "Yes"
        else:
            true_val = "No"

        if v.pattern not in per_pattern:
            per_pattern[v.pattern] = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}

        c = per_pattern[v.pattern]
        if pred == "Yes" and true_val == "Yes":
            c["tp"] += 1
        elif pred == "Yes" and true_val == "No":
            c["fp"] += 1
        elif pred == "No" and true_val == "Yes":
            c["fn"] += 1
        else:
            c["tn"] += 1

    def safe_div(a: float, b: float) -> float:
        return a / b if b > 0 else 0.0

    print(f"Evaluated against dyn_validation. Skipped (file not found): {skipped}\n")
    print("Per-pattern metrics:")
    for pat in sorted(per_pattern.keys()):
        c = per_pattern[pat]
        tp, fp, fn = c["tp"], c["fp"], c["fn"]
        prec = safe_div(tp, tp + fp)
        rec = safe_div(tp, tp + fn)
        f1 = safe_div(2 * prec * rec, prec + rec) if (prec + rec) > 0 else 0
        print(f"  {pat}: P={prec:.2f} R={rec:.2f} F1={f1:.2f} (tp={tp} fp={fp} fn={fn})")

    total_tp = sum(c["tp"] for c in per_pattern.values())
    total_fp = sum(c["fp"] for c in per_pattern.values())
    total_fn = sum(c["fn"] for c in per_pattern.values())
    prec = safe_div(total_tp, total_tp + total_fp)
    rec = safe_div(total_tp, total_tp + total_fn)
    f1 = safe_div(2 * prec * rec, prec + rec) if (prec + rec) > 0 else 0
    print(f"\nOverall: P={prec:.2f} R={rec:.2f} F1={f1:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
