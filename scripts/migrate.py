from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from database import init_db  # noqa: E402


def main() -> None:
    init_db()
    print("Database migration/bootstrap completed.")


if __name__ == "__main__":
    main()
