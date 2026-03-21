import asyncio
import json as _json
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from config import get_settings
from database import engine, init_db
from models import (
    FindingResponse,
    HealthResponse,
    ProjectCreateRequest,
    ProjectResponse,
    RunCreateRequest,
    RunResponse,
)
from task_manager import TaskManager

settings = get_settings()
app = FastAPI(title="Energy Analyzer API", version="0.3.0")
task_manager = TaskManager()

allowed_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
]
if settings.frontend_url:
    allowed_origins.append(settings.frontend_url.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Background worker ---

async def _background_worker() -> None:
    while True:
        task = None
        try:
            task = task_manager.dequeue_pending()
            if not task:
                await asyncio.sleep(2)
                continue
            print(f"[worker] processing run {task.id}")
            await task_manager.process_task(task.id)
            print(f"[worker] run {task.id} done")
        except Exception as exc:
            if task:
                try:
                    task_manager._set_task_status(task.id, "Failed")
                except Exception:
                    pass
            print(f"[worker] error: {exc}")
            await asyncio.sleep(2)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    s = get_settings()
    print(f"[startup] LLM provider: {task_manager.llm_provider} (config: llm_provider={s.llm_provider!r}, gemini_key={'set' if s.gemini_api_key else 'unset'})")
    asyncio.get_event_loop().create_task(_background_worker())


# --- Health ---

@app.get("/")
def read_root():
    return {"message": "Energy Analyzer API is running"}


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    db_status = "healthy"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_status = "unhealthy"
    llm_status = await task_manager.llm.health_check()
    return {
        "api_status": "healthy",
        "db_status": db_status,
        "llm_status": llm_status,
    }


# --- Projects ---

@app.post("/api/projects", response_model=ProjectResponse)
def create_project(payload: ProjectCreateRequest):
    proj = task_manager.create_project(
        name=payload.name,
        repo_url=payload.repo_url,
    )
    return {
        "id": proj.id,
        "name": proj.name,
        "repo_url": proj.repo_url,
        "created_at": proj.created_at,
        "total_runs": 0,
        "total_files": 0,
        "total_issues": 0,
        "last_run_at": None,
    }


@app.get("/api/projects", response_model=list[ProjectResponse])
def list_projects():
    return task_manager.list_projects()


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int):
    projects = task_manager.list_projects()
    for p in projects:
        if p["id"] == project_id:
            return p
    raise HTTPException(status_code=404, detail="Project not found")


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int):
    ok = task_manager.delete_project(project_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


@app.get("/api/projects/{project_id}/pattern-stats")
def get_pattern_stats(project_id: int):
    return task_manager.get_project_pattern_stats(project_id)


@app.get("/api/projects/{project_id}/runs", response_model=list[RunResponse])
def get_project_runs(project_id: int):
    runs = task_manager.get_project_runs(project_id)
    return [_run_dict(r) for r in runs]


# --- Runs (Tasks) ---

@app.post("/api/runs", response_model=RunResponse)
def create_run(payload: RunCreateRequest):
    task = task_manager.create_task(
        description=payload.description,
        source_type=payload.source_type,
        source_url=payload.source_url,
        project_id=payload.project_id,
    )
    return _run_dict(task)


@app.post("/api/runs/upload", response_model=RunResponse)
async def create_run_upload(
    project_id: int = Form(...),
    description: str = Form(""),
    files: list[UploadFile] = File(...),
):
    task = task_manager.create_task(
        description=description,
        source_type="uploaded",
        project_id=project_id,
    )
    file_pairs: list[tuple[str, str]] = []
    for f in files:
        content = (await f.read()).decode("utf-8", errors="ignore")
        file_pairs.append((f.filename or "unknown.java", content))
    task_manager.save_uploaded_files(task, file_pairs)
    return _run_dict(task)


@app.get("/api/runs/{run_id}", response_model=RunResponse)
def get_run(run_id: int):
    task = task_manager.get_task(run_id)
    if not task:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_dict(task)


@app.delete("/api/runs/{run_id}")
def delete_run(run_id: int):
    ok = task_manager.delete_run(run_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"ok": True}


@app.get("/api/runs/{run_id}/findings", response_model=list[FindingResponse])
def get_findings(run_id: int):
    rows = task_manager.get_results(run_id)
    return [_finding_dict(r) for r in rows]


# --- Legacy task endpoints (backward compat) ---

@app.post("/api/tasks", response_model=RunResponse)
def create_task_legacy(payload: RunCreateRequest):
    task = task_manager.create_task(
        description=payload.description,
        source_type=payload.source_type,
        source_url=payload.source_url,
        project_id=payload.project_id,
    )
    return _run_dict(task)


@app.post("/api/tasks/upload", response_model=RunResponse)
async def create_task_upload_legacy(
    project_id: int = Form(0),
    description: str = Form(""),
    files: list[UploadFile] = File(...),
):
    pid = project_id if project_id > 0 else None
    task = task_manager.create_task(
        description=description,
        source_type="uploaded",
        project_id=pid,
    )
    file_pairs: list[tuple[str, str]] = []
    for f in files:
        content = (await f.read()).decode("utf-8", errors="ignore")
        file_pairs.append((f.filename or "unknown.java", content))
    task_manager.save_uploaded_files(task, file_pairs)
    return _run_dict(task)


@app.get("/api/tasks", response_model=list[RunResponse])
def list_tasks(status: str | None = None):
    tasks = task_manager.list_tasks(status_filter=status)
    return [_run_dict(t) for t in tasks]


@app.get("/api/tasks/{task_id}", response_model=RunResponse)
def get_task(task_id: int):
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_dict(task)


@app.get("/api/tasks/{task_id}/results", response_model=list[FindingResponse])
def get_results(task_id: int):
    rows = task_manager.get_results(task_id)
    return [_finding_dict(r) for r in rows]


# --- Serializers ---

def _run_dict(t) -> dict[str, Any]:
    return {
        "id": t.id,
        "project_id": t.project_id,
        "description": t.description,
        "source_type": t.source_type,
        "source_url": t.source_url,
        "download_folder_name": t.download_folder_name,
        "status": t.status,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


def _finding_dict(r) -> dict[str, Any]:
    fb = None
    if r.feedback:
        try:
            fb = _json.loads(r.feedback)
        except Exception:
            fb = None
    return {
        "id": r.id,
        "task_id": r.task_id,
        "folder_name": r.folder_name,
        "file_name": r.file_name,
        "status": r.status,
        "dw": r.dw,
        "hmu": r.hmu,
        "has": r.has,
        "iod": r.iod,
        "nlmr": r.nlmr,
        "feedback": fb,
    }
