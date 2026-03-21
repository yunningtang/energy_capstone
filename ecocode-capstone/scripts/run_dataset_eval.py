#!/usr/bin/env python3
"""
Safwat-style dataset evaluation: decompile APKs, run LLM, compare with Dyn_Validation, store in DB.

Pipeline:
  1. (Optional) Decompile APKs with jadx
  2. Import Dyn_Validation if not in DB
  3. For each dyn_validation entry, find Java source in decompiled dirs
  4. Run LLM analysis, store result in eval_results
  5. Compute P/R/F1, store in eval_runs

Usage (from ecocode-capstone root):
  # Full pipeline: decompile + evaluate + store
  py -3 scripts/run_dataset_eval.py --apk-dir C:/apks --output-dir C:/dyn_decompiled --limit 3

  # Evaluate existing decompiled (skip decompile)
  py -3 scripts/run_dataset_eval.py --source-dir C:/dyn_decompiled --limit 20

  # Evaluate single app
  py -3 scripts/run_dataset_eval.py --source-dir "C:/dyn_decompiled/com.github.gotify_22/sources" --limit 10
"""
import asyncio
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from database import (
    DynValidation,
    EvalResult,
    EvalRun,
    get_db_session,
    init_db,
)
from sqlalchemy import select
from task_manager import TaskManager


def find_java_file(class_name: str, search_dirs: list[Path]) -> Path | None:
    """Find Java file in one or more source directories."""
    for base in search_dirs:
        if not base.exists():
            continue
        if "." in class_name:
            rel = class_name.replace(".", "/") + ".java"
            p = base / rel
            if p.exists():
                return p
        simple = class_name.split(".")[-1] + ".java"
        for p in base.rglob(simple):
            return p
    return None


def collect_source_dirs(root: Path) -> list[Path]:
    """Collect .../sources (jadx) or .../app/src/main/java (FDROID source) dirs."""
    out: list[Path] = []
    if (root / "sources").exists():
        out.append(root / "sources")
    java_src = root / "app" / "src" / "main" / "java"
    if java_src.exists():
        out.append(java_src)
    for sub in root.iterdir():
        if sub.is_dir():
            src = sub / "sources"
            if src.exists():
                out.append(src)
            else:
                js = sub / "app" / "src" / "main" / "java"
                if js.exists():
                    out.append(js)
                else:
                    out.extend(collect_source_dirs(sub))
    return out


def run_decompile(apk_dir: Path, output_dir: Path, limit: int) -> bool:
    """Run decompile_apks.py. Returns True on success."""
    try:
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "decompile_apks.py"),
             "--apk-dir", str(apk_dir),
             "--output-dir", str(output_dir),
             "--limit", str(limit)],
            check=True,
            capture_output=True,
            text=True,
            timeout=3600,
            cwd=str(ROOT),
        )
        return True
    except Exception as e:
        print(f"Decompile failed: {e}")
        return False


async def main() -> None:
    parser = argparse.ArgumentParser(description="Safwat-style dataset evaluation")
    parser.add_argument("--apk-dir", type=Path, help="Folder with APKs (triggers decompile)")
    parser.add_argument("--output-dir", type=Path, help="Output for decompiled source (with --apk-dir)")
    parser.add_argument("--source-dir", type=Path, help="Existing decompiled root or app/sources path")
    parser.add_argument("--pattern", type=str, help="Only evaluate this pattern")
    parser.add_argument("--limit", type=int, default=0, help="Max entries per pattern (0=all)")
    parser.add_argument("--decompile-limit", type=int, default=5, help="APKs to decompile (with --apk-dir)")
    args = parser.parse_args()

    source_dirs: list[Path] = []
    if args.apk_dir and args.output_dir:
        print("Step 1: Decompiling APKs...")
        if not run_decompile(args.apk_dir, args.output_dir, args.decompile_limit):
            sys.exit(1)
        source_dirs = collect_source_dirs(args.output_dir.resolve())
        print(f"  Found {len(source_dirs)} app source dirs")
    elif args.source_dir:
        sd = args.source_dir.resolve()
        if (sd / "sources").exists():
            source_dirs = [sd / "sources"]
        else:
            source_dirs = collect_source_dirs(sd)
        if not source_dirs:
            source_dirs = [sd]
        print(f"Using {len(source_dirs)} source dir(s)")
    else:
        print("Error: provide --apk-dir + --output-dir, or --source-dir")
        sys.exit(1)

    init_db()

    # Ensure Dyn_Validation imported
    with get_db_session() as db:
        rows = list(db.scalars(select(DynValidation).limit(1)))
    if not rows:
        print("Importing Dyn_Validation...")
        try:
            subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "import_dyn_data.py"), "--validation"],
                check=True,
                capture_output=True,
                cwd=str(ROOT),
            )
        except Exception as e:
            print(f"Import failed: {e}")
        with get_db_session() as db:
            rows = list(db.scalars(select(DynValidation).limit(1)))
    if not rows:
        print("No dyn_validation. Put Dyn_Validation CSV in capstone_project/Dyn_Validation/")
        print("Then: py -3 scripts/import_dyn_data.py --validation")
        sys.exit(1)

    print("Step 2: Running LLM evaluation...")
    manager = TaskManager()

    with get_db_session() as db:
        stmt = select(DynValidation).order_by(DynValidation.pattern, DynValidation.class_name)
        if args.pattern:
            stmt = stmt.where(DynValidation.pattern == args.pattern.upper())
        all_rows = list(db.scalars(stmt))

    per_pattern_seen: dict[str, int] = {}
    results: list[tuple[str, str, str, str, str | None]] = []

    for v in all_rows:
        if args.limit:
            n = per_pattern_seen.get(v.pattern, 0)
            if n >= args.limit:
                continue
            per_pattern_seen[v.pattern] = n + 1

        fpath = find_java_file(v.class_name, source_dirs)
        if not fpath or not fpath.exists():
            continue

        try:
            code = fpath.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

        findings = await manager.analyze_code(code, patterns=[v.pattern])
        pred = "No"
        for r in findings:
            if r["smell_type"] == v.pattern:
                pred = "Yes" if r["has_smell"] else "No"
                break

        true_val = str(v.code_smell or "No").strip()
        true_val = "Yes" if true_val.lower() in ("yes", "y", "1", "true") else "No"

        results.append((v.class_name, v.pattern, true_val, pred, str(fpath)))

    # Compute metrics and store in DB
    per_pattern: dict[str, dict[str, int]] = {}
    for _, pattern, gt, pred, path in results:
        if pattern not in per_pattern:
            per_pattern[pattern] = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
        c = per_pattern[pattern]
        if pred == "Yes" and gt == "Yes":
            c["tp"] += 1
        elif pred == "Yes" and gt == "No":
            c["fp"] += 1
        elif pred == "No" and gt == "Yes":
            c["fn"] += 1
        else:
            c["tn"] += 1

    def safe_div(a: float, b: float) -> float:
        return a / b if b > 0 else 0.0

    total_tp = sum(c["tp"] for c in per_pattern.values())
    total_fp = sum(c["fp"] for c in per_pattern.values())
    total_fn = sum(c["fn"] for c in per_pattern.values())
    prec = safe_div(total_tp, total_tp + total_fp)
    rec = safe_div(total_tp, total_tp + total_fn)
    f1 = safe_div(2 * prec * rec, prec + rec) if (prec + rec) > 0 else 0.0

    # Store in DB
    source_dir_str = str(source_dirs[0].parent) if source_dirs else ""
    skipped = len(all_rows) - len(results)
    run_id = 0
    with get_db_session() as db:
        run = EvalRun(
            source_dir=source_dir_str,
            total_compared=len(results),
            total_skipped=skipped,
            precision=prec,
            recall=rec,
            f1=f1,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        run_id = run.id
        for cn, pat, gt, pred, path in results:
            db.add(EvalResult(
                eval_run_id=run.id,
                class_name=cn,
                pattern=pat,
                ground_truth=gt,
                prediction=pred,
                source_path=path,
            ))
        db.commit()

    print(f"\nStored in DB: eval_runs.id={run_id}, eval_results={len(results)} rows")
    print(f"Skipped (file not found): {skipped}\n")
    print("Per-pattern metrics:")
    for pat in sorted(per_pattern.keys()):
        c = per_pattern[pat]
        tp, fp, fn = c["tp"], c["fp"], c["fn"]
        p = safe_div(tp, tp + fp)
        r = safe_div(tp, tp + fn)
        f = safe_div(2 * p * r, p + r) if (p + r) > 0 else 0
        print(f"  {pat}: P={p:.2f} R={r:.2f} F1={f:.2f} (tp={tp} fp={fp} fn={fn})")
    print(f"\nOverall: P={prec:.2f} R={rec:.2f} F1={f1:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
