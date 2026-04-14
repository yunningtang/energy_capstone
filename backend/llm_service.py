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


# ═══════════════════════════════════════════════════════════
# Keyword prefilter — skip LLM call for patterns that can't apply
# ═══════════════════════════════════════════════════════════
PATTERN_KEYWORDS = {
    "DW":   ["wakelock", "acquire", "wake_lock", "newwakelock"],
    "HMU":  ["hashmap", "hashmap<", "import java.util.hashmap"],
    "HAS":  ["asynctask", "onpostexecute", "onpreexecute", "doinbackground", "onprogressupdate"],
    "IOD":  ["ondraw", "@override\n    public void ondraw", "canvas"],
    "NLMR": ["extends activity", "extends service", "extends appcompatactivity",
             "extends fragmentactivity", "extends broadcastreceiver"],
}


def prefilter_patterns(code: str) -> tuple[list[str], dict[str, str]]:
    """
    Return (patterns_to_check_with_llm, patterns_auto_no).
    patterns_auto_no contains patterns that the file doesn't trigger based on keyword scan.
    """
    code_lower = code.lower()
    to_check = []
    auto_no: dict[str, str] = {}
    for pattern in PATTERNS_ALL:
        keywords = PATTERN_KEYWORDS.get(pattern, [])
        if not keywords:
            to_check.append(pattern)
            continue
        # If no keyword found, the pattern can't possibly apply
        hit = any(kw in code_lower for kw in keywords)
        if hit:
            to_check.append(pattern)
        else:
            auto_no[pattern] = f"No {pattern} indicators found in source (keyword prefilter)."
    return to_check, auto_no


PATTERNS_ALL = ["DW", "HMU", "HAS", "IOD", "NLMR"]


# ═══════════════════════════════════════════════════════════
# Batch prompt — check all patterns in one LLM call.
# Emits a richer schema (diagnosis + structured fix card) so the UI can
# render a descriptive finding card instead of a synthetic before/after diff.
# ═══════════════════════════════════════════════════════════
def build_batch_prompt(code: str, patterns: list[str]) -> str:
    """One prompt, all patterns, structured JSON response for finding-card UI."""
    descriptions = "\n".join(
        f"- {p}: {PATTERN_DESCRIPTIONS.get(p, p)}" for p in patterns
    )
    schema_lines = ",\n    ".join(
        f'"{p}": {{\n'
        f'      "answer": "Yes" or "No",\n'
        f'      "reason": "1-3 sentence diagnosis explaining WHY this is a problem (null if No)",\n'
        f'      "diagnosis_summary": "≤100 char one-sentence headline (null if No)",\n'
        f'      "severity": "minor" | "major" | "critical" (null if No),\n'
        f'      "confidence": "high" | "medium" | "low" (null if No),\n'
        f'      "line_range": "e.g. 42-47, or single line like 42, or null",\n'
        f'      "anchor_line": integer line number where the fix should be placed, or null,\n'
        f'      "operation": "insert" | "replace" | "wrap" (null if No),\n'
        f'      "location_hint": "where to make the change — cite SPECIFIC class/method names or line numbers from the file",\n'
        f'      "suggested_fix": "≤150 char sentence describing the fix action",\n'
        f'      "fix_explanation": "≤150 char sentence describing what example_code does",\n'
        f'      "example_code": "COMPLETE compilable {patterns and ("Java" or "Java")} snippet the user can copy-paste verbatim — no ellipsis, no TODOs, no placeholders",\n'
        f'      "original_snippet": "EXACT verbatim excerpt from the source (~3-8 lines) showing the violation, or null",\n'
        f'      "fixed_snippet": "the same excerpt rewritten to fix it (kept for legacy diff UI), or null"\n'
        f'    }}'
        for p in patterns
    )
    return (
        f"You are a static code analyzer for Android energy/performance anti-patterns. "
        f"Analyze ONE Java file against each of these patterns:\n\n{descriptions}\n\n"
        f"HARD RULES:\n"
        f"1. NEVER hallucinate code from outside the file. Only reference classes, methods, "
        f"and variables that actually exist in the source below.\n"
        f"2. example_code MUST be COMPLETE and compilable — no placeholders, no '...', "
        f"no '/* implement here */'. User must be able to copy-paste with zero edits.\n"
        f"3. location_hint MUST cite SPECIFIC class/method names or line numbers. "
        f"Forbidden vague phrases: 'the relevant component', 'your service', 'where applicable'.\n"
        f"4. If a pattern does not apply to this file (e.g. NLMR on a non-Activity/Service), "
        f"set answer='No' and briefly say why in reason. Do NOT force-find an issue.\n"
        f"5. Match the file's existing style: same indentation width, same brace placement.\n"
        f"6. severity scale: 'critical'=data loss/crash/security, 'major'=noticeable perf or "
        f"battery drain, 'minor'=best-practice violation.\n"
        f"7. confidence: 'high'=clear violation + straightforward fix; 'medium'=violation but "
        f"fix may need adaptation; 'low'=ambiguous, user should review.\n\n"
        f"For each pattern return answer='Yes' if the pattern IS present (= bug), 'No' otherwise.\n"
        f"If 'No', all other fields may be null.\n\n"
        f"Source code:\n```java\n{code}\n```\n\n"
        f"Respond with JSON only, no prose, no markdown fences:\n"
        f"{{\n    {schema_lines}\n}}"
    )


def _parse_batch_response(content: str, patterns: list[str]) -> dict[str, dict]:
    """Parse a batch response. Return dict {pattern: {answer, reason, line_range?, suggested_fix?}}."""
    if not content:
        return {p: {"answer": "No", "reason": "empty response"} for p in patterns}
    text = content.strip()
    if "```" in text:
        m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
        if m:
            text = m.group(1)
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return {p: {"answer": "No", "reason": "parse failed"} for p in patterns}
        try:
            obj = json.loads(match.group())
        except json.JSONDecodeError:
            return {p: {"answer": "No", "reason": "parse failed"} for p in patterns}

    result: dict[str, dict] = {}
    for p in patterns:
        entry = obj.get(p) or obj.get(p.upper()) or obj.get(p.lower()) or {}
        if not isinstance(entry, dict):
            entry = {"answer": str(entry), "reason": ""}
        ans = _normalize_answer(entry.get("answer"))
        out: dict[str, Any] = {"answer": ans, "reason": str(entry.get("reason", ""))[:300]}
        # String fields: clip length, drop "null"/"none" strings.
        string_fields = (
            ("line_range", 40),
            ("suggested_fix", 500),
            ("original_snippet", 2000),
            ("fixed_snippet", 2000),
            ("diagnosis_summary", 120),
            ("location_hint", 300),
            ("operation", 20),
            ("example_code", 2000),
            ("fix_explanation", 200),
            ("severity", 20),
            ("confidence", 20),
        )
        for field, max_len in string_fields:
            val = entry.get(field)
            if val is None:
                continue
            sv = str(val).strip()
            if sv.lower() in ("null", "none", "n/a", ""):
                continue
            out[field] = sv[:max_len]
        # Integer fields
        if "anchor_line" in entry and entry["anchor_line"] is not None:
            try:
                out["anchor_line"] = int(entry["anchor_line"])
            except (TypeError, ValueError):
                pass
        # Normalise enums
        if "severity" in out:
            sv = out["severity"].lower()
            out["severity"] = sv if sv in ("minor", "major", "critical") else "minor"
        if "confidence" in out:
            cv = out["confidence"].lower()
            out["confidence"] = cv if cv in ("high", "medium", "low") else "medium"
        if "operation" in out:
            op = out["operation"].lower()
            out["operation"] = op if op in ("insert", "replace", "wrap") else "insert"
        result[p] = out
    return result


class LLMService:
    async def health_check(self) -> dict[str, Any]:
        raise NotImplementedError

    async def check_pattern(self, code: str, pattern: str) -> dict[str, Any]:
        """Return {"answer": "Yes"/"No", "reason": "..."}."""
        raise NotImplementedError

    async def check_all_patterns(self, code: str, patterns: list[str]) -> dict[str, dict]:
        """Batch check — default falls back to per-pattern calls. Override for efficiency."""
        result: dict[str, dict] = {}
        for p in patterns:
            result[p] = await self.check_pattern(code, p)
        return result


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

    async def check_all_patterns(self, code: str, patterns: list[str]) -> dict[str, dict]:
        """Single-call batch check for OpenAI. Uses structured JSON mode."""
        if not self.api_key:
            return {p: {"answer": "No", "reason": "OPENAI_API_KEY not set"} for p in patterns}
        if not patterns:
            return {}
        prompt = build_batch_prompt(code, patterns)
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
                        "Return strict JSON only with one entry per requested pattern."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }
        try:
            async with httpx.AsyncClient(timeout=120.0) as c:
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
            return _parse_batch_response(raw, patterns)
        except Exception as exc:
            return {p: {"answer": "No", "reason": f"OpenAI error: {exc}"} for p in patterns}


def create_llm_service() -> tuple[LLMService, str]:
    s = get_settings()
    provider = (s.llm_provider or "openai").strip().lower()
    if provider == "gemini" and s.gemini_api_key:
        return GeminiService(), "gemini"
    if provider == "openai" and s.openai_api_key:
        return OpenAIService(), "openai"
    return OllamaService(), "ollama"
