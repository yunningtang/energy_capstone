#!/usr/bin/env python3
"""
Query Dyn_* tables in the database. Quick way to inspect imported data.

Usage (from ecocode-capstone root):
  python scripts/query_dyn_data.py
  python scripts/query_dyn_data.py --events
  python scripts/query_dyn_data.py --validation --pattern DW
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from database import DynEvent, DynResult, DynValidation, EvalRun, get_db_session, init_db
from sqlalchemy import func, select


def main():
    parser = argparse.ArgumentParser(description="Query Dyn_* tables")
    parser.add_argument("--events", action="store_true", help="Show dyn_events summary")
    parser.add_argument("--results", action="store_true", help="Show dyn_results summary")
    parser.add_argument("--validation", action="store_true", help="Show dyn_validation summary")
    parser.add_argument("--eval-runs", action="store_true", help="Show eval_runs (dataset evaluation)")
    parser.add_argument("--pattern", type=str, help="Filter by pattern (DW, HMU, HAS, IOD, NLMR)")
    args = parser.parse_args()

    do_all = not (args.events or args.results or args.validation or args.eval_runs)

    init_db()
    with get_db_session() as db:
        if do_all or args.events:
            count = db.scalar(select(func.count()).select_from(DynEvent))
            print(f"dyn_events: {count} rows")
            if count > 0:
                rows = db.execute(
                    select(DynEvent.source_file, func.count())
                    .group_by(DynEvent.source_file)
                    .limit(10)
                ).all()
                for r in rows:
                    print(f"  {r[0]}: {r[1]}")

        if do_all or args.results:
            count = db.scalar(select(func.count()).select_from(DynResult))
            print(f"dyn_results: {count} rows")
            if count > 0:
                rows = db.execute(
                    select(DynResult.pattern, func.count())
                    .group_by(DynResult.pattern)
                    .limit(10)
                ).all()
                for r in rows:
                    print(f"  {r[0]}: {r[1]}")

        if do_all or args.validation:
            stmt = select(func.count()).select_from(DynValidation)
            if args.pattern:
                stmt = stmt.where(DynValidation.pattern == args.pattern.upper())
            count = db.scalar(stmt)
            print(f"dyn_validation: {count} rows" + (f" (pattern={args.pattern})" if args.pattern else ""))
            if count > 0:
                stmt = (
                    select(DynValidation.pattern, DynValidation.code_smell, func.count())
                    .group_by(DynValidation.pattern, DynValidation.code_smell)
                )
                if args.pattern:
                    stmt = stmt.where(DynValidation.pattern == args.pattern.upper())
                rows = db.execute(stmt).all()
                for r in rows:
                    print(f"  {r[0]} | {r[1]}: {r[2]}")

        if do_all or args.eval_runs:
            runs = list(db.scalars(select(EvalRun).order_by(EvalRun.created_at.desc()).limit(10)))
            print(f"eval_runs: {len(runs)} recent")
            for r in runs:
                print(f"  id={r.id} P={r.precision:.2f} R={r.recall:.2f} F1={r.f1:.2f} n={r.total_compared} {r.created_at}")


if __name__ == "__main__":
    main()
