#!/usr/bin/env python3
"""
Evaluate analysis pipeline on test-samples using ground_truth.json.
Computes precision, recall, F1 per pattern and overall.

Usage (from repo root):
  python scripts/evaluate.py
"""
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from task_manager import TaskManager


async def main() -> None:
    samples_dir = ROOT / "data" / "test-samples"
    gt_path = samples_dir / "ground_truth.json"
    if not gt_path.exists():
        print(f"Missing {gt_path}. Add ground truth for files to evaluate.")
        return

    gt = json.loads(gt_path.read_text(encoding="utf-8"))
    manager = TaskManager()

    all_tp = all_fp = all_fn = all_tn = 0
    per_pattern: dict[str, dict[str, int]] = {}

    for filename, labels in gt.items():
        fpath = samples_dir / filename
        if not fpath.exists():
            print(f"Skip {filename}: file not found")
            continue

        code = fpath.read_text(encoding="utf-8")
        findings = await manager.analyze_code(code)

        for r in findings:
            pat = r["smell_type"]
            pred = "Yes" if r["has_smell"] else "No"
            true_val = labels.get(pat, "No")

            if pat not in per_pattern:
                per_pattern[pat] = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}

            if pred == "Yes" and true_val == "Yes":
                per_pattern[pat]["tp"] += 1
                all_tp += 1
            elif pred == "Yes" and true_val == "No":
                per_pattern[pat]["fp"] += 1
                all_fp += 1
            elif pred == "No" and true_val == "Yes":
                per_pattern[pat]["fn"] += 1
                all_fn += 1
            else:
                per_pattern[pat]["tn"] += 1
                all_tn += 1

    # Metrics
    def safe_div(a: float, b: float) -> float:
        return a / b if b > 0 else 0.0

    print("Per-pattern metrics:")
    for pat, c in per_pattern.items():
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
