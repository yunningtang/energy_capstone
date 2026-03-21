#!/usr/bin/env python3
"""
Decompile APK files to Java source using jadx.

Prerequisites:
  1. Install jadx: https://github.com/skylot/jadx/releases
     - Download jadx-*-zip, extract, add bin/ to PATH
     - Or set JADX_PATH env var to jadx.bat / jadx
  2. Java JRE installed (unless using jadx-with-jre build)

Usage (from ecocode-capstone root):
  python scripts/decompile_apks.py --apk-dir "C:/path/to/apks" --output-dir "C:/dyn_decompiled"
  python scripts/decompile_apks.py --apk-dir ./apks --output-dir ./decompiled --limit 5
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def find_jadx() -> str | None:
    """Find jadx executable. Check JADX_PATH, PATH, then common Windows locations."""
    jadx_path = os.environ.get("JADX_PATH")
    if jadx_path:
        p = Path(jadx_path)
        if p.exists():
            return str(p)
        p = Path(jadx_path) / "bin" / "jadx.bat"
        if p.exists():
            return str(p)
    for name in ("jadx", "jadx.bat"):
        try:
            r = subprocess.run(
                [name, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if r.returncode == 0:
                return name
        except FileNotFoundError:
            continue
    # Common Windows install locations
    user_home = Path.home()
    candidates = [
        Path("C:/jadx/bin/jadx.bat"),
        Path("C:/jadx/bin/jadx"),
        user_home / "jadx" / "bin" / "jadx.bat",
        user_home / "Downloads" / "jadx" / "bin" / "jadx.bat",
        ROOT.parent / "jadx" / "bin" / "jadx.bat",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    return None


def decompile_apk(jadx_cmd: str, apk_path: Path, output_dir: Path) -> bool:
    """Decompile one APK. Returns True on success."""
    out_folder = output_dir / apk_path.stem
    out_folder.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [jadx_cmd, "-d", str(out_folder), str(apk_path.resolve())],
            check=True,
            capture_output=True,
            text=True,
            timeout=300,
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"  Error: {e.stderr or e}")
        return False
    except subprocess.TimeoutExpired:
        print("  Timeout (5min)")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Decompile APKs with jadx")
    parser.add_argument(
        "--apk-dir",
        type=Path,
        required=True,
        help="Folder containing .apk files",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Output folder for decompiled Java source",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max APKs to decompile (0 = all)",
    )
    parser.add_argument(
        "--jadx",
        type=str,
        help="Path to jadx executable (or set JADX_PATH)",
    )
    args = parser.parse_args()

    apk_dir = args.apk_dir.resolve()
    output_dir = args.output_dir.resolve()

    if not apk_dir.exists():
        print(f"Error: APK dir not found: {apk_dir}")
        sys.exit(1)

    jadx_cmd = args.jadx or find_jadx()
    if not jadx_cmd:
        print(
            "Error: jadx not found. Install from https://github.com/skylot/jadx/releases\n"
            "  - Extract jadx-*.zip, add bin/ to PATH\n"
            "  - Or set JADX_PATH to jadx.bat path"
        )
        sys.exit(1)

    apks = sorted(apk_dir.glob("*.apk"))
    if not apks:
        print(f"No .apk files in {apk_dir}")
        sys.exit(0)

    if args.limit:
        apks = apks[: args.limit]

    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Decompiling {len(apks)} APKs to {output_dir}\n")

    ok = 0
    for i, apk in enumerate(apks, 1):
        print(f"[{i}/{len(apks)}] {apk.name} ...", end=" ", flush=True)
        if decompile_apk(jadx_cmd, apk, output_dir):
            print("OK")
            ok += 1
        else:
            print("FAILED")

    print(f"\nDone. {ok}/{len(apks)} succeeded.")
    print(f"Java source in: {output_dir}/<apk_name>/sources/")
    print("\nFor evaluate_dyn, point to the 'sources' folder of an app:")
    print(f'  python scripts/evaluate_dyn.py --source-dir "{output_dir}/com.github.gotify_22/sources" --limit 10')


if __name__ == "__main__":
    main()
