import json
import re
import uuid
from pathlib import Path
from typing import Any


def new_task_id() -> str:
    return f"task_{uuid.uuid4().hex[:10]}"


def load_few_shot_examples(base_dir: Path, smell_type: str) -> list[dict[str, Any]]:
    file_name = f"{smell_type.lower()}_examples.json"
    path = base_dir / file_name
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception:
        return []
    return payload.get("examples", [])


def fallback_detect_smell(code: str, smell_type: str) -> dict[str, Any]:
    code_lower = code.lower()
    smell = smell_type.upper()

    if smell == "DW":
        has = "wakelock.acquire" in code_lower and "wakelock.release" not in code_lower
        return build_fallback_result(
            smell, has, "WakeLock acquire without release in control flow.", "Use try/finally and call wakeLock.release()."
        )
    if smell == "HMU":
        has = "new hashmap" in code_lower and ("put(" in code_lower)
        return build_fallback_result(
            smell, has, "Small HashMap usage may be replaced with ArrayMap on Android.", "Use ArrayMap for small maps."
        )
    if smell == "HAS":
        has = "onpostexecute" in code_lower and "thread.sleep" in code_lower
        return build_fallback_result(
            smell, has, "Blocking operation found in UI callback.", "Move blocking operation to background thread."
        )
    if smell == "IOD":
        has = "ondraw(" in code_lower and re.search(r"new\s+[A-Za-z_]+\(", code) is not None
        return build_fallback_result(
            smell, has, "Object allocation detected in onDraw.", "Pre-allocate objects outside drawing lifecycle."
        )
    if smell == "NLMR":
        has = ("extends activity" in code_lower) and ("onlowmemory" not in code_lower)
        return build_fallback_result(
            smell, has, "Activity does not implement onLowMemory handling.", "Add onLowMemory and release caches/resources."
        )
    return build_fallback_result(smell, False, "No fallback rule matched.", None)


def build_fallback_result(smell_type: str, has_smell: bool, explanation: str, suggestion: str | None) -> dict[str, Any]:
    return {
        "has_smell": has_smell,
        "confidence": 78 if has_smell else 65,
        "smell_type": smell_type,
        "severity": "major" if has_smell else "minor",
        "explanation": explanation,
        "location": {"line": 1, "method": "unknown"},
        "suggestion": suggestion,
        "refactored_code": None,
    }
