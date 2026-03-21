#!/usr/bin/env python3
"""
Check and fix development environment. Run from ecocode-capstone root.

  python scripts/check_env.py
  py -3 scripts/check_env.py
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
VENV = BACKEND / "venv"


def run(cmd: list[str], timeout: int = 10) -> tuple[int, str]:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=str(ROOT))
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except Exception as e:
        return -1, str(e)


def main() -> None:
    print("=== EcoCode Environment Check ===\n")

    # 1. Python
    print("1. Python:")
    for cmd in (["py", "-3"], ["python"], ["python3"]):
        code, out = run(cmd + ["--version"])
        if code == 0:
            print(f"   OK: {' '.join(cmd)} -> {out.strip()}")
            break
    else:
        print("   FAIL: No working Python. Install from https://www.python.org/downloads/")
        print("         (Check 'Add Python to PATH' during install)")
        sys.exit(1)

    # 2. venv
    print("\n2. Virtual environment:")
    if VENV.exists():
        venv_py = VENV / "Scripts" / "python.exe" if os.name == "nt" else VENV / "bin" / "python"
        if venv_py.exists():
            code, out = run([str(venv_py), "--version"])
            if code == 0:
                print(f"   OK: {VENV}")
            else:
                print(f"   BROKEN: {VENV} (python313.dll?)")
                print("   Fix: Remove backend/venv and run: py -3 -m venv backend/venv")
        else:
            print(f"   INCOMPLETE: {VENV}")
    else:
        print(f"   Not found: {VENV}")
        print("   Create: py -3 -m venv backend/venv")

    # 3. jadx
    print("\n3. jadx:")
    jadx_path = os.environ.get("JADX_PATH")
    if jadx_path and Path(jadx_path).exists():
        print(f"   OK: JADX_PATH={jadx_path}")
    else:
        candidates = [
            Path("C:/jadx/bin/jadx.bat"),
            Path.home() / "jadx" / "bin" / "jadx.bat",
        ]
        found = None
        for c in candidates:
            if c.exists():
                found = c
                break
        if found:
            print(f"   OK: {found}")
            print(f"   Tip: set JADX_PATH={found.parent.parent} for scripts")
        else:
            code, _ = run(["jadx", "--version"])
            if code == 0:
                print("   OK: jadx in PATH")
            else:
                print("   Not found. Download: https://github.com/skylot/jadx/releases")
                print("   Extract to C:\\jadx or set JADX_PATH")

    # 4. Backend deps
    print("\n4. Backend dependencies:")
    pip = VENV / "Scripts" / "pip.exe" if os.name == "nt" else VENV / "bin" / "pip"
    if pip.exists():
        code, out = run([str(pip), "show", "fastapi"])
        if code == 0:
            print("   OK: requirements installed")
        else:
            print("   Run: scripts\\fix_venv.bat  or  backend\\venv\\Scripts\\pip install -r backend/requirements.txt")
    else:
        print("   Run: scripts\\fix_venv.bat")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
