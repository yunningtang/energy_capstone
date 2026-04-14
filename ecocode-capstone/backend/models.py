from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ProjectCreateRequest(BaseModel):
    name: str
    repo_url: str | None = None


class ProjectUpdateRequest(BaseModel):
    name: str | None = None
    repo_url: str | None = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    repo_url: str | None
    created_at: datetime
    total_runs: int = 0
    total_files: int = 0
    total_issues: int = 0
    last_run_at: datetime | None = None


class RunCreateRequest(BaseModel):
    project_id: int
    description: str = ""
    source_type: Literal["repo", "uploaded"] = "repo"
    source_url: str | None = None


class RunResponse(BaseModel):
    id: int
    project_id: int | None
    description: str
    source_type: str
    source_url: str | None
    download_folder_name: str
    status: str
    created_at: datetime
    updated_at: datetime
    file_count: int | None = None
    issue_count: int | None = None


class FindingResponse(BaseModel):
    id: int
    task_id: int
    folder_name: str
    file_name: str
    file_content: str | None = None
    status: str
    dw: str
    hmu: str
    has: str
    iod: str
    nlmr: str
    feedback: dict | None = None


class HealthResponse(BaseModel):
    api_status: str
    db_status: str
    llm_status: dict
