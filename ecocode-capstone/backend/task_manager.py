import time
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select

from config import get_settings
from database import AnalysisResult, AnalysisTask, get_db_session
from llm_service import OllamaService, create_llm_service
from utils import fallback_detect_smell, load_few_shot_examples, new_task_id


STATUS_QUEUED = "QUEUED"
STATUS_IN_PROGRESS = "IN_PROGRESS"
STATUS_FINISHED = "FINISHED"
STATUS_FAILED = "FAILED"


class TaskManager:
    def __init__(self):
        settings = get_settings()
        self.llm, self.llm_provider = create_llm_service()
        self.fallback_llm = OllamaService() if self.llm_provider != "ollama" else None
        # Keep compatibility with existing health endpoint naming.
        self.ollama = self.llm
        self.primary_provider = (settings.llm_provider or "openai").strip().lower()
        self.few_shot_dir = (
            Path(__file__).resolve().parent.parent / "data" / "few-shot-examples"
        )

    def create_task(
        self,
        source_type: str,
        source_name: str,
        source_value: str,
        smell_types: list[str],
    ) -> AnalysisTask:
        task_id = new_task_id()
        with get_db_session() as db:
            task = AnalysisTask(
                id=task_id,
                source_type=source_type,
                source_name=source_name or "unnamed_input",
                source_value=source_value,
                selected_smells=smell_types,
                status=STATUS_QUEUED,
                progress=0,
            )
            db.add(task)
            db.commit()
            db.refresh(task)
            return task

    def list_tasks(self, limit: int = 50) -> list[AnalysisTask]:
        with get_db_session() as db:
            stmt = select(AnalysisTask).order_by(AnalysisTask.created_at.desc()).limit(limit)
            return list(db.scalars(stmt))

    def get_task(self, task_id: str) -> AnalysisTask | None:
        with get_db_session() as db:
            return db.get(AnalysisTask, task_id)

    def get_result(self, task_id: str) -> AnalysisResult | None:
        with get_db_session() as db:
            stmt = select(AnalysisResult).where(AnalysisResult.task_id == task_id)
            return db.scalars(stmt).first()

    def dequeue_task(self) -> AnalysisTask | None:
        with get_db_session() as db:
            stmt = (
                select(AnalysisTask)
                .where(AnalysisTask.status == STATUS_QUEUED)
                .order_by(AnalysisTask.created_at.asc())
                .limit(1)
            )
            task = db.scalars(stmt).first()
            if not task:
                return None
            task.status = STATUS_IN_PROGRESS
            task.progress = 10
            db.commit()
            db.refresh(task)
            return task

    def update_task_status(
        self,
        task_id: str,
        status: str,
        progress: int | None = None,
        error_message: str | None = None,
    ) -> None:
        with get_db_session() as db:
            task = db.get(AnalysisTask, task_id)
            if not task:
                return
            task.status = status
            if progress is not None:
                task.progress = progress
            task.error_message = error_message
            if status in (STATUS_FINISHED, STATUS_FAILED):
                task.completed_at = datetime.utcnow()
            db.commit()

    async def process_task(self, task_id: str) -> None:
        with get_db_session() as db:
            task = db.get(AnalysisTask, task_id)
            if not task:
                return
            source_type = task.source_type
            source_value = task.source_value
            selected_smells = task.selected_smells or ["DW", "HMU", "HAS", "IOD", "NLMR"]

        self.update_task_status(task_id, STATUS_IN_PROGRESS, progress=30)

        start = time.time()
        code_payload = self._build_code_payload(source_type, source_value)
        findings = await self._analyze_code(code_payload, selected_smells)
        summary = {
            "total_findings": len(findings),
            "smell_hits": len([f for f in findings if f.get("has_smell")]),
            "critical_count": len([f for f in findings if f.get("severity") == "critical"]),
            "major_count": len([f for f in findings if f.get("severity") == "major"]),
            "minor_count": len([f for f in findings if f.get("severity") == "minor"]),
        }
        elapsed = int((time.time() - start) * 1000)

        self.update_task_status(task_id, STATUS_IN_PROGRESS, progress=90)

        with get_db_session() as db:
            existing = db.scalars(
                select(AnalysisResult).where(AnalysisResult.task_id == task_id)
            ).first()
            if existing:
                existing.summary = summary
                existing.findings = findings
                existing.processing_time_ms = elapsed
            else:
                db.add(
                    AnalysisResult(
                        task_id=task_id,
                        summary=summary,
                        findings=findings,
                        llm_suggestions=self._compose_suggestion(findings),
                        processing_time_ms=elapsed,
                    )
                )
            db.commit()

        self.update_task_status(task_id, STATUS_FINISHED, progress=100)

    async def _analyze_code(self, code: str, smell_types: list[str]) -> list[dict[str, Any]]:
        findings: list[dict[str, Any]] = []
        for smell in smell_types:
            try:
                examples = load_few_shot_examples(self.few_shot_dir, smell)
                llm_result = await self.llm.analyze_smell(
                    code=code, smell_type=smell, few_shot_examples=examples
                )
                normalized = self._normalize_result(llm_result, smell)
                if normalized["confidence"] == 0 and self.fallback_llm:
                    fallback_result = await self.fallback_llm.analyze_smell(
                        code=code, smell_type=smell, few_shot_examples=examples
                    )
                    normalized = self._normalize_result(fallback_result, smell)
                if normalized["confidence"] == 0:
                    normalized = fallback_detect_smell(code, smell)
            except Exception as exc:
                normalized = fallback_detect_smell(code, smell)
                normalized["explanation"] = (
                    f"{normalized.get('explanation', '')} "
                    f"(fallback due to analysis error: {exc})"
                ).strip()
            findings.append(normalized)
        return findings

    def _normalize_result(self, payload: dict[str, Any], smell_type: str) -> dict[str, Any]:
        has_smell = bool(payload.get("has_smell", False))
        confidence = self._safe_int(payload.get("confidence", 0), default=0)
        severity = payload.get("severity", "minor")
        if severity not in ("critical", "major", "minor"):
            severity = "minor"
        return {
            "smell_type": payload.get("smell_type", smell_type),
            "has_smell": has_smell,
            "confidence": max(0, min(confidence, 100)),
            "severity": severity,
            "explanation": str(payload.get("explanation", "")),
            "location": payload.get("location", {"line": 1, "method": "unknown"}),
            "suggestion": payload.get("suggestion"),
            "refactored_code": payload.get("refactored_code"),
        }

    def _safe_int(self, value: Any, default: int = 0) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            try:
                return int(float(value))
            except (TypeError, ValueError):
                return default

    def _build_code_payload(self, source_type: str, source_value: str) -> str:
        if source_type in ("file", "snippet"):
            return source_value
        return (
            "// URL mode placeholder for MVP\n"
            f"// Target repository: {source_value}\n"
            "// Clone-based deep analysis can be enabled in phase-2.\n"
        )

    def _compose_suggestion(self, findings: list[dict[str, Any]]) -> str:
        hit_findings = [f for f in findings if f.get("has_smell")]
        if not hit_findings:
            return "No major energy smells detected in this run."
        lines = ["Prioritized recommendations:"]
        for f in hit_findings:
            lines.append(
                f"- [{f.get('smell_type')}] {f.get('explanation')} "
                f"Fix: {f.get('suggestion') or 'Review and refactor control flow.'}"
            )
        return "\n".join(lines)
