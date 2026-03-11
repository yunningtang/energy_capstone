from pathlib import Path


def is_java_file(filename: str) -> bool:
    return Path(filename).suffix.lower() == ".java"
