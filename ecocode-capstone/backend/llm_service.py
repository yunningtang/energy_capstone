import json
import re
from typing import Any

import httpx

from config import get_settings

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


def build_smell_prompt(code: str, pattern: str) -> str:
    description = PATTERN_DESCRIPTIONS.get(pattern, f"{pattern} energy anti-pattern")
    return (
        f"You are a system expert and we want to spot {{{pattern}}} issue "
        f"in the following code.\n\n"
        f"Pattern description: [{pattern}] pattern means {description}\n\n"
        f"Expected output: Please answer with y/n if the code contains "
        f"[{pattern} issue] with the reason of having this issue.\n\n"
        f"Here is the code:\n\n{code}\n\n"
        'Return ONLY a JSON object with keys: "answer" ("Yes" or "No"), '
        '"reason" (string explaining why).'
    )


def _safe_json(content: str) -> dict[str, Any]:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        lower = content.lower()
        if "yes" in lower:
            return {"answer": "Yes", "reason": content}
        return {"answer": "No", "reason": content}


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
        prompt = build_smell_prompt(code, pattern)
        body = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.2, "num_predict": 500},
        }
        try:
            async with httpx.AsyncClient(timeout=90.0) as c:
                r = await c.post(f"{self.base_url}/api/generate", json=body)
            r.raise_for_status()
            raw = r.json().get("response", "{}")
            return _safe_json(raw)
        except Exception as exc:
            return {"answer": "No", "reason": f"LLM error: {exc}"}


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
    if provider == "openai" and s.openai_api_key:
        return OpenAIService(), "openai"
    return OllamaService(), "ollama"
