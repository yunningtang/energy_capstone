#!/usr/bin/env python3
"""
Import Dyn_Events, Dyn_Results, Dyn_Validation CSV datasets into SQLite/PostgreSQL.

Usage (from ecocode-capstone root):
  python scripts/import_dyn_data.py [--dyn-root PATH]

Dyn_* folders should be at project root (../Dyn_Events, ../Dyn_Results, ../Dyn_Validation)
or pass --dyn-root to specify.
"""
import argparse
import csv
import re
import sys
from pathlib import Path

# Add backend to path
ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from database import DynEvent, DynResult, DynValidation, get_db_session, init_db


def parse_dyn_events(path: Path) -> list[dict]:
    """Parse Dyn_Events CSV: apk_path, package, java_file, method [, is_true_positive]"""
    rows = []
    name = path.stem  # e.g. DW_acquire
    with open(path, encoding="utf-8", errors="replace") as f:
        for i, row in enumerate(csv.reader(f)):
            if len(row) < 4:
                continue
            apk_path = row[0].strip()
            package = row[1].strip() if len(row) > 1 else ""
            java_file = row[2].strip() if len(row) > 2 else ""
            method = row[3].strip() if len(row) > 3 else ""
            is_tp = row[4].strip() if len(row) > 4 else None
            if not apk_path or apk_path in ("apk_path", "path"):
                continue  # skip headers
            rows.append({
                "source_file": name,
                "apk_path": apk_path[:1024] if apk_path else "",
                "package": package[:512] if package else "",
                "java_file": java_file[:512] if java_file else "",
                "method": method[:256] if method else "",
                "is_true_positive": is_tp[:10] if is_tp else None,
            })
    return rows


def parse_dyn_results(path: Path) -> list[dict]:
    """Parse Dyn_Results CSV. Format varies - store raw row as JSON-like string."""
    rows = []
    name = path.stem
    # Infer pattern from filename: DW, HMU, HAS, IOD, NLMR
    match = re.search(r"(DW|HMU|HAS|IOD|NLMR)", name, re.I)
    pattern = match.group(1).upper() if match else ""

    with open(path, encoding="utf-8", errors="replace") as f:
        for i, row in enumerate(csv.reader(f)):
            if not row or (len(row) == 1 and "," in str(row[0])):
                continue
            raw = "|".join(str(c).strip()[:200] for c in row[:10])
            if raw and not raw.startswith("Code Smell") and not raw.startswith("Potential"):
                rows.append({
                    "source_file": name,
                    "pattern": pattern or "?",
                    "raw_data": raw[:4000],
                })
    return rows


def parse_dyn_validation(path: Path) -> list[dict]:
    """Parse Dyn_Validation * _Pos / _Neg / etc. Format: Class, Code Smell ?, Comments"""
    rows = []
    name = path.stem
    match = re.search(r"(DW|HMU|HAS|IOD|NLMR)_(Pos|Neg)", name, re.I)
    if match:
        pattern = match.group(1).upper()
    else:
        pattern = ""

    with open(path, encoding="utf-8", errors="replace") as f:
        content = f.read()

    current_tool = None
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        # Block header e.g. "aDoctor,," or "DynAMICS,,"
        if line.endswith(",,") and len(line) < 30:
            current_tool = line.split(",")[0].strip() or current_tool
            continue
        if "Class" in line and "Code Smell" in line:
            continue  # Column header
        parts = [p.strip() for p in line.split(",", 2)]
        if len(parts) < 2:
            continue
        class_name = parts[0]
        code_smell = parts[1] if len(parts) > 1 else ""
        comments = parts[2] if len(parts) > 2 else None
        if not class_name or class_name in ("Class", "Code Smell ?"):
            continue
        rows.append({
            "source_file": name,
            "pattern": pattern,
            "class_name": class_name[:512],
            "code_smell": code_smell[:10] if code_smell else "",
            "comments": comments[:4000] if comments else None,
            "source_tool": current_tool,
        })

    return rows


def _resolve_dir(root: Path, *candidates: str) -> Path | None:
    """Return first existing path, or None."""
    for name in candidates:
        p = root / name
        if p.exists():
            return p
    return None


def main():
    parser = argparse.ArgumentParser(description="Import Dyn_* / DynAMICS CSV data into database")
    parser.add_argument(
        "--dyn-root",
        type=Path,
        default=ROOT.parent,
        help="Root folder (Dyn_Events/Results/Validation or DynAMICS dataset)",
    )
    parser.add_argument(
        "--dynamics",
        action="store_true",
        help="Use DynAMICS folder names: DynAMICS Events, Results, Manual Validation",
    )
    parser.add_argument("--events", action="store_true", help="Import only events")
    parser.add_argument("--results", action="store_true", help="Import only results")
    parser.add_argument("--validation", action="store_true", help="Import only validation")
    args = parser.parse_args()

    dyn_root = args.dyn_root.resolve()
    if args.dynamics:
        events_dir = _resolve_dir(dyn_root, "DynAMICS Events", "DynAMICS_Events")
        results_dir = _resolve_dir(dyn_root, "Results")
        validation_dir = _resolve_dir(dyn_root, "Manual Validation", "Manual_Validation")
    else:
        events_dir = _resolve_dir(dyn_root, "Dyn_Events", "DynAMICS Events", "DynAMICS_Events")
        results_dir = _resolve_dir(dyn_root, "Dyn_Results", "Results")
        validation_dir = _resolve_dir(dyn_root, "Dyn_Validation", "Manual Validation", "Manual_Validation")

    init_db()
    do_all = not (args.events or args.results or args.validation)

    with get_db_session() as db:
        if do_all or args.events:
            if events_dir:
                count = 0
                for csv_path in sorted(events_dir.glob("*.csv")):
                    for r in parse_dyn_events(csv_path):
                        db.add(DynEvent(**r))
                        count += 1
                db.commit()
                print(f"Imported Dyn_Events: {count} rows")
            else:
                print(f"Dyn_Events not found (try: Dyn_Events, DynAMICS Events)")

        if do_all or args.results:
            if results_dir:
                count = 0
                for csv_path in sorted(results_dir.glob("*.csv")):
                    for r in parse_dyn_results(csv_path):
                        db.add(DynResult(**r))
                        count += 1
                db.commit()
                print(f"Imported Dyn_Results: {count} rows")
            else:
                print(f"Dyn_Results not found (try: Dyn_Results, Results)")

        if do_all or args.validation:
            if validation_dir:
                count = 0
                for csv_path in sorted(validation_dir.glob("*.csv")):
                    for r in parse_dyn_validation(csv_path):
                        db.add(DynValidation(**r))
                        count += 1
                db.commit()
                print(f"Imported Dyn_Validation: {count} rows")
            else:
                print(f"Dyn_Validation not found (try: Dyn_Validation, Manual Validation)")

    print("Done.")


if __name__ == "__main__":
    main()
