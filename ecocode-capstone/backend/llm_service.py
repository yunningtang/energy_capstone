import json
import re
from typing import Any

import httpx

from config import get_settings


class LLMService:
    async def health_check(self) -> dict[str, Any]:
        raise NotImplementedError

    async def analyze_smell(
        self, code: str, smell_type: str, few_shot_examples: list[dict[str, Any]]
    ) -> dict[str, Any]:
        raise NotImplementedError


class OllamaService:
    def __init__(self):
        settings = get_settings()
        self.base_url = settings.ollama_base_url.rstrip("/")
        self.model = settings.ollama_model

    async def health_check(self) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            payload = response.json()
            return {
                "status": "healthy",
                "models": [m.get("name", "") for m in payload.get("models", [])],
            }
        except Exception as exc:
            return {"status": "unhealthy", "error": str(exc)}

    async def analyze_smell(
        self, code: str, smell_type: str, few_shot_examples: list[dict[str, Any]]
    ) -> dict[str, Any]:
        prompt = self._build_prompt(code=code, smell_type=smell_type, examples=few_shot_examples)
        body = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.2,
                "top_p": 0.9,
                "num_predict": 700,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(f"{self.base_url}/api/generate", json=body)
            response.raise_for_status()
            raw = response.json().get("response", "{}")
            return self._safe_json(raw)
        except Exception as exc:
            return {
                "has_smell": False,
                "confidence": 0,
                "smell_type": smell_type,
                "severity": "minor",
                "explanation": f"LLM request failed: {exc}",
            }

    def _safe_json(self, content: str) -> dict[str, Any]:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", content, re.DOTALL)
            if not match:
                return {"has_smell": False, "confidence": 0, "severity": "minor", "explanation": content}
            return json.loads(match.group())

    def _build_prompt(self, code: str, smell_type: str, examples: list[dict[str, Any]]) -> str:
        parts = [
            "You are an Android energy optimization expert.",
            f"Analyze code for smell type: {smell_type}.",
            "Use strict JSON response only.",
        ]
        if examples:
            parts.append("Examples:")
            for idx, ex in enumerate(examples, start=1):
                parts.append(
                    "\n".join(
                        [
                            f"Example {idx}",
                            f"Label: {ex.get('label', 'unknown')}",
                            f"Code:\n{ex.get('code', '')}",
                            f"Issue: {ex.get('issue', '')}",
                            f"Fix: {ex.get('fix', '')}",
                        ]
                    )
                )
        parts.append("Code to analyze:")
        parts.append(code)
        parts.append(
            (
                'Return JSON with keys: has_smell(bool), confidence(int 0-100), smell_type(str), '
                'severity("critical"|"major"|"minor"), explanation(str), '
                'location(object with line/method), suggestion(str), refactored_code(str).'
            )
        )
        return "\n\n".join(parts)


class OpenAIService(LLMService):
    def __init__(self):
        settings = get_settings()
        self.api_key = settings.openai_api_key or ""
        self.model = settings.openai_model
        self.base_url = "https://api.openai.com/v1"

    async def health_check(self) -> dict[str, Any]:
        if not self.api_key:
            return {"status": "unhealthy", "error": "OPENAI_API_KEY is missing"}
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/models", headers=headers)
            response.raise_for_status()
            models = response.json().get("data", [])
            model_ids = [m.get("id", "") for m in models]
            return {
                "status": "healthy",
                "provider": "openai",
                "configured_model": self.model,
                "model_available": self.model in model_ids,
            }
        except Exception as exc:
            return {"status": "unhealthy", "provider": "openai", "error": str(exc)}

    async def analyze_smell(
        self, code: str, smell_type: str, few_shot_examples: list[dict[str, Any]]
    ) -> dict[str, Any]:
        if not self.api_key:
            return {
                "has_smell": False,
                "confidence": 0,
                "smell_type": smell_type,
                "severity": "minor",
                "explanation": "OPENAI_API_KEY is missing.",
            }
        prompt = self._build_prompt(code=code, smell_type=smell_type, examples=few_shot_examples)
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        body = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are an Android energy optimization expert. Return strict JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=body,
                )
            response.raise_for_status()
            raw = (
                response.json()
                .get("choices", [{}])[0]
                .get("message", {})
                .get("content", "{}")
            )
            return self._safe_json(raw)
        except Exception as exc:
            return {
                "has_smell": False,
                "confidence": 0,
                "smell_type": smell_type,
                "severity": "minor",
                "explanation": f"OpenAI request failed: {exc}",
            }

    def _safe_json(self, content: str) -> dict[str, Any]:
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", content, re.DOTALL)
            if not match:
                return {
                    "has_smell": False,
                    "confidence": 0,
                    "severity": "minor",
                    "explanation": content,
                }
            return json.loads(match.group())

    def _build_prompt(self, code: str, smell_type: str, examples: list[dict[str, Any]]) -> str:
        parts = [
            "Analyze Android code smell and provide practical fix advice in natural language.",
            f"Smell type to detect: {smell_type}",
            "Use strict JSON response only.",
        ]
        if examples:
            parts.append("Examples:")
            for idx, ex in enumerate(examples, start=1):
                parts.append(
                    "\n".join(
                        [
                            f"Example {idx}",
                            f"Label: {ex.get('label', 'unknown')}",
                            f"Code:\n{ex.get('code', '')}",
                            f"Issue: {ex.get('issue', '')}",
                            f"Fix: {ex.get('fix', '')}",
                        ]
                    )
                )
        parts.append("Code to analyze:")
        parts.append(code)
        parts.append(
            (
                'Return JSON with keys: has_smell(bool), confidence(int 0-100), smell_type(str), '
                'severity("critical"|"major"|"minor"), explanation(str, natural language), '
                'location(object with line/method), suggestion(str, natural language), '
                "refactored_code(str)."
            )
        )
        return "\n\n".join(parts)


def create_llm_service() -> tuple[LLMService, str]:
    settings = get_settings()
    provider = (settings.llm_provider or "openai").strip().lower()
    if provider == "openai":
        if settings.openai_api_key:
            return OpenAIService(), "openai"
        return OllamaService(), "ollama"
    return OllamaService(), "ollama"
