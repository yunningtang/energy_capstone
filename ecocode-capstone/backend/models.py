from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TaskCreateRequest(BaseModel):
    description: str = ""
    source_type: Literal["repo", "uploaded"] = "repo"
    source_url: str | None = None


class TaskResponse(BaseModel):
    id: int
    description: str
    source_type: str
    source_url: str | None
    download_folder_name: str
    status: str
    created_at: datetime
    updated_at: datetime


class ResultDetailResponse(BaseModel):
    id: int
    task_id: int
    folder_name: str
    file_name: str
    status: str
    dw: str
    hmu: str
    has: str
    iod: str
    nlmr: str


class HealthResponse(BaseModel):
    api_status: str
    db_status: str
    llm_status: dict
