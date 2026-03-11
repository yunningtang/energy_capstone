from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


TaskStatus = Literal["QUEUED", "IN_PROGRESS", "FINISHED", "FAILED"]
Severity = Literal["critical", "major", "minor"]


class AnalysisCreateRequest(BaseModel):
    source_type: Literal["url", "file", "snippet"] = "url"
    source_name: str = ""
    source_value: str = Field(..., min_length=1)
    smell_types: list[str] = Field(default_factory=lambda: ["DW", "HMU", "HAS", "IOD", "NLMR"])


class TaskResponse(BaseModel):
    id: str
    source_type: str
    source_name: str
    status: TaskStatus
    progress: int
    created_at: datetime
    completed_at: datetime | None
    error_message: str | None


class Finding(BaseModel):
    smell_type: str
    has_smell: bool
    confidence: int
    severity: Severity
    explanation: str
    suggestion: str | None = None
    location: dict[str, Any] = Field(default_factory=dict)
    refactored_code: str | None = None


class ResultResponse(BaseModel):
    task_id: str
    summary: dict[str, Any]
    findings: list[Finding]
    llm_suggestions: str | None
    processing_time_ms: int


class HealthResponse(BaseModel):
    api_status: str
    db_status: str
    ollama_status: dict[str, Any]
