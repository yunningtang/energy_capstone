import json
import os
import re
from pathlib import Path
from typing import Any

import httpx

from config import get_settings

DEBUG_LLM = os.environ.get("DEBUG_LLM", "").lower() in ("1", "true", "yes")

# Path to few-shot examples (test-samples + ground_truth.json)
_FEW_SHOT_DIR = Path(__file__).resolve().parent.parent / "data" / "test-samples"

PATTERN_DESCRIPTIONS = {
    "DW": (
        "Durable Wakelock — acquiring a WakeLock (e.g. wakeLock.acquire()) without "
        "a corresponding release (wakeLock.release()), which prevents the device "
        "from entering sleep mode and drains the battery."
    ),
    "HMU": (
        "HashMap Usage — using java.util.HashMap for small collections on Android "
        "where ArrayMap or SparseArray would be more memory-efficient and reduce "
        "garbage-collection pressure."
    ),
    "HAS": (
        "Heavy AsyncTask/Start — performing heavy or blocking operations (e.g. "
        "Thread.sleep, network I/O, large computation) inside UI-thread callbacks "
        "such as onPostExecute, onPreExecute, or onProgressUpdate."
    ),
    "IOD": (
        "Init OnDraw — allocating objects (new Paint(), new Rect(), etc.) inside "
        "View.onDraw(), which is called every frame and causes excessive garbage "
        "collection and UI jank."
    ),
    "NLMR": (
        "No Low Memory Resolver — an Activity or Service that does not override "
        "onLowMemory() or onTrimMemory() to release caches and non-critical "
        "resources when the system is low on memory."
    ),
}

# Explicit detection rules - help smaller models (Ollama) follow checklist
PATTERN_RULES = {
    "DW": "CHECKLIST: (1) Has .acquire() or acquireWakeLock? (2) No .release() in same method? BOTH → Yes.",
    "HMU": "CHECKLIST: Uses HashMap or HashMap<> ? → Yes (use ArrayMap on Android instead).",
    "HAS": "CHECKLIST: Thread.sleep or blocking I/O inside onPostExecute/onPreExecute/doInBackground? → Yes.",
    "IOD": "CHECKLIST: new Paint() or new Rect() or new Bitmap() inside onDraw()? → Yes.",
    "NLMR": "CHECKLIST: Activity/Service without onLowMemory/onTrimMemory override? → Yes.",
}


def _load_few_shot_examples(pattern: str) -> list[tuple[str, str]]:
    """Load (code, answer) pairs from test-samples for few-shot. Returns [] if missing."""
    if not _FEW_SHOT_DIR.exists():
        return []
    gt_path = _FEW_SHOT_DIR / "ground_truth.json"
    if not gt_path.exists():
        return []
    try:
        gt = json.loads(gt_path.read_text(encoding="utf-8"))
    except Exception:
        return []
    examples: list[tuple[str, str]] = []
    for fname, labels in gt.items():
        if pattern not in labels:
            continue
        code_path = _FEW_SHOT_DIR / fname
        if not code_path.exists():
            continue
        code = code_path.read_text(encoding="utf-8")
        answer = str(labels.get(pattern, "No"))
        examples.append((code[:1200], answer))
    return examples[:2]  # Max 2 examples per pattern


# Checklist-style prompts for local models (shorter, harder, more deterministic)
PATTERN_CHECKLIST = {
    "DW": "CHECK: Does code call .acquire() or acquireWakeLock WITHOUT .release() in same method?",
    "HMU": "CHECK: Does code use HashMap<> for small collections on Android?",
    "HAS": "CHECK: Does code have Thread.sleep or blocking I/O in onPostExecute/onPreExecute?",
    "IOD": "CHECK: Does code use new Paint(), new Rect(), or new Bitmap() inside onDraw()?",
    "NLMR": "CHECK: Is this Activity/Service missing onLowMemory() or onTrimMemory()?",
}


def build_smell_prompt(code: str, pattern: str, use_few_shot: bool = True, checklist_style: bool = False) -> str:
    """Build prompt. Use checklist_style=True for local models (Ollama) - shorter, harder rules."""
    if checklist_style:
        check = PATTERN_CHECKLIST.get(pattern, f"Does code contain {pattern} pattern?")
        base = f"{check}\n\nCode:\n```java\n{code}\n```\n\n"
        if use_few_shot:
            examples = _load_few_shot_examples(pattern)
            if examples:
                base = ""
                for i, (ex_code, ans) in enumerate(examples, 1):
                    base += f"Example {i} (Answer={ans}):\n```java\n{ex_code}\n```\n\n"
                base += f"{check}\n\nCode to analyze:\n```java\n{code}\n```\n\n"
        base += 'JSON only: {"answer":"Yes" or "No","reason":"..."}'
        return base
    # Original style for OpenAI / stronger models
    description = PATTERN_DESCRIPTIONS.get(pattern, f"{pattern} energy anti-pattern")
    rule = PATTERN_RULES.get(pattern, "")
    base = (
        f"You are an Android code expert. Detect [{pattern}]. {description}\n\n"
        f"{rule}\n\n"
    )
    if use_few_shot:
        examples = _load_few_shot_examples(pattern)
        if examples:
            base += "Examples:\n"
            for i, (ex_code, ans) in enumerate(examples, 1):
                base += f"\nExample {i}:\n```java\n{ex_code}\n```\nAnswer: {ans}\n"
            base += "\n"
    base += (
        f"Analyze for [{pattern}]. Yes if pattern exists, No otherwise.\n\n"
        f"Code:\n```java\n{code}\n```\n\n"
        'JSON only: {"answer":"Yes" or "No","reason":"brief explanation",'
        '"line_range":"e.g. 42-47 or null","suggested_fix":"how to fix, or null if clean"}'
    )
    return base


def _normalize_answer(val: Any) -> str:
    """Normalize model output to Yes/No. Avoid parser swallowing valid Yes."""
    if val is None:
        return "No"
    s = str(val).strip().lower()
    if s in ("yes", "y", "true", "1", "contains", "has", "detected"):
        return "Yes"
    if s in ("no", "n", "false", "0"):
        return "No"
    if "yes" in s or "contains the" in s or "has the" in s or "has this" in s:
        return "Yes"
    return "No"


def _safe_json(content: str) -> dict[str, Any]:
    """Parse LLM JSON. Be generous with Yes detection to avoid swallowing valid positives."""
    if not content or not content.strip():
        return {"answer": "No", "reason": "empty response"}
    text = content.strip()
    # Strip markdown code block (Ollama sometimes wraps JSON)
    if "```" in text:
        m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if m:
            text = m.group(1)
    def _extract(obj: dict) -> dict:
        ans = _normalize_answer(obj.get("answer"))
        result = {"answer": ans, "reason": str(obj.get("reason", ""))[:300]}
        if obj.get("line_range"):
            result["line_range"] = str(obj["line_range"])
        if obj.get("suggested_fix"):
            result["suggested_fix"] = str(obj["suggested_fix"])[:500]
        return result

    try:
        obj = json.loads(text)
        return _extract(obj)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL) or re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            obj = json.loads(match.group())
            return _extract(obj)
        except json.JSONDecodeError:
            pass
    # Fallback: check raw text for positive signals (avoid swallowing Yes)
    lower = content.lower()
    yes_patterns = ('"answer":"yes"', '"answer": "yes"', "'answer':'yes'", "answer: yes", "answer is yes", "answer:yes")
    no_negation = "not" not in lower[:lower.find("yes") + 10] if "yes" in lower else True
    if any(p in lower for p in yes_patterns) or ("yes" in lower and no_negation and "no" not in lower[max(0, lower.rfind("yes") - 20):lower.rfind("yes")]):
        return {"answer": "Yes", "reason": content[:200]}
    return {"answer": "No", "reason": content[:200] if content else "parse failed"}


class LLMService:
    async def health_check(self) -> dict[str, Any]:
        raise NotImplementedError

    async def check_pattern(self, code: str, pattern: str) -> dict[str, Any]:
        """Return {"answer": "Yes"/"No", "reason": "..."}."""
        raise NotImplementedError


class OllamaService(LLMService):
    def __init__(self):
        s = get_settings()
        self.base_url = s.ollama_base_url.rstrip("/")
        self.model = s.ollama_model

    async def health_check(self) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(f"{self.base_url}/api/tags")
            r.raise_for_status()
            return {"status": "healthy", "provider": "ollama"}
        except Exception as exc:
            return {"status": "unhealthy", "provider": "ollama", "error": str(exc)}

    async def check_pattern(self, code: str, pattern: str) -> dict[str, Any]:
        prompt = build_smell_prompt(code, pattern, checklist_style=True)
        # Use /api/chat (messages format) - works better for qwen2.5/llama etc.
        body = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are an Android code expert. You MUST respond with ONLY a valid JSON object "
                        'with keys "answer" (value "Yes" or "No") and "reason". No markdown, no explanation outside JSON.'
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 600},
        }
        try:
            async with httpx.AsyncClient(timeout=90.0) as c:
                r = await c.post(f"{self.base_url}/api/chat", json=body)
            r.raise_for_status()
            raw = r.json().get("message", {}).get("content", "{}")
            result = _safe_json(raw)
            if DEBUG_LLM:
                print(f"[ollama] {pattern} raw={raw[:300]}... -> answer={result.get('answer')}")
            return result
        except Exception as exc:
            return {"answer": "No", "reason": f"LLM error: {exc}"}


class GeminiService(LLMService):
    """Google Gemini API (Google AI Studio). Better instruction-following than local Ollama."""
    def __init__(self):
        s = get_settings()
        self.api_key = s.gemini_api_key or ""
        self.model = s.gemini_model
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"

    async def health_check(self) -> dict[str, Any]:
        if not self.api_key:
            return {"status": "unhealthy", "provider": "gemini", "error": "No API key"}
        try:
            async with httpx.AsyncClient(timeout=15.0) as c:
                r = await c.post(
                    f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}",
                    json={
                        "contents": [{"parts": [{"text": "Say OK"}]}],
                        "generationConfig": {"maxOutputTokens": 10},
                    },
                )
            r.raise_for_status()
            return {"status": "healthy", "provider": "gemini", "model": self.model}
        except Exception as exc:
            return {"status": "unhealthy", "provider": "gemini", "error": str(exc)}

    async def check_pattern(self, code: str, pattern: str) -> dict[str, Any]:
        if not self.api_key:
            return {"answer": "No", "reason": "GEMINI_API_KEY not set"}
        prompt = build_smell_prompt(code, pattern)
        url = f"{self.base_url}/models/{self.model}:generateContent?key={self.api_key}"
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "systemInstruction": {
                "parts": [{
                    "text": "You are an Android energy expert. Return ONLY valid JSON with keys 'answer' (Yes/No) and 'reason'. No markdown."
                }]
            },
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 500,
                "responseMimeType": "application/json",
            },
        }
        try:
            async with httpx.AsyncClient(timeout=90.0) as c:
                r = await c.post(url, json=body)
            r.raise_for_status()
            data = r.json()
            raw = ""
            for c in data.get("candidates", []):
                for p in c.get("content", {}).get("parts", []):
                    raw = p.get("text", "")
                    break
                if raw:
                    break
            result = _safe_json(raw)
            if DEBUG_LLM:
                print(f"[gemini] {pattern} raw={raw[:300]}... -> answer={result.get('answer')}")
            return result
        except Exception as exc:
            return {"answer": "No", "reason": f"Gemini error: {exc}"}


class OpenAIService(LLMService):
    def __init__(self):
        s = get_settings()
        self.api_key = s.openai_api_key or ""
        self.model = s.openai_model
        self.base_url = "https://api.openai.com/v1"

    async def health_check(self) -> dict[str, Any]:
        if not self.api_key:
            return {"status": "unhealthy", "provider": "openai", "error": "No API key"}
        try:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.get(f"{self.base_url}/models", headers=headers)
            r.raise_for_status()
            return {"status": "healthy", "provider": "openai", "model": self.model}
        except Exception as exc:
            return {"status": "unhealthy", "provider": "openai", "error": str(exc)}

    async def check_pattern(self, code: str, pattern: str) -> dict[str, Any]:
        if not self.api_key:
            return {"answer": "No", "reason": "OPENAI_API_KEY not set"}
        prompt = build_smell_prompt(code, pattern)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are an Android energy optimization expert. "
                        "Return strict JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }
        try:
            async with httpx.AsyncClient(timeout=90.0) as c:
                r = await c.post(
                    f"{self.base_url}/chat/completions", headers=headers, json=body,
                )
            r.raise_for_status()
            raw = (
                r.json()
                .get("choices", [{}])[0]
                .get("message", {})
                .get("content", "{}")
            )
            return _safe_json(raw)
        except Exception as exc:
            return {"answer": "No", "reason": f"OpenAI error: {exc}"}


def create_llm_service() -> tuple[LLMService, str]:
    s = get_settings()
    provider = (s.llm_provider or "openai").strip().lower()
    if provider == "gemini" and s.gemini_api_key:
        return GeminiService(), "gemini"
    if provider == "openai" and s.openai_api_key:
        return OpenAIService(), "openai"
    return OllamaService(), "ollama"
