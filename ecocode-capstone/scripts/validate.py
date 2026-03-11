import asyncio
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from task_manager import TaskManager  # noqa: E402


async def main() -> None:
    manager = TaskManager()
    sample = ROOT / "data" / "test-samples" / "DW_example.java"
    if not sample.exists():
        print("Missing sample file:", sample)
        return
    code = sample.read_text(encoding="utf-8")
    findings = await manager._analyze_code(code, ["DW", "HMU", "HAS", "IOD", "NLMR"])
    print("Validation findings:")
    for row in findings:
        print(f"- {row['smell_type']}: has_smell={row['has_smell']} confidence={row['confidence']}")


if __name__ == "__main__":
    asyncio.run(main())
