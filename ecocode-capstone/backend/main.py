from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from config import get_settings
from database import engine, init_db
from models import AnalysisCreateRequest, HealthResponse, ResultResponse, TaskResponse
from task_manager import TaskManager

settings = get_settings()
app = FastAPI(title="EcoCode API", version="0.1.0")
task_manager = TaskManager()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "EcoCode API is running"}


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
        "ollama_status": {
            "active_provider": task_manager.llm_provider,
            "requested_provider": task_manager.primary_provider,
            "provider_health": llm_status,
        },
    }


@app.post("/api/tasks", response_model=TaskResponse)
def create_task(payload: AnalysisCreateRequest):
    task = task_manager.create_task(
        source_type=payload.source_type,
        source_name=payload.source_name,
        source_value=payload.source_value,
        smell_types=payload.smell_types,
    )
    return _serialize_task(task)


@app.get("/api/tasks", response_model=list[TaskResponse])
def list_tasks() -> list[dict[str, Any]]:
    tasks = task_manager.list_tasks()
    return [_serialize_task(t) for t in tasks]


@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: str):
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _serialize_task(task)


@app.get("/api/results/{task_id}", response_model=ResultResponse)
def get_result(task_id: str):
    result = task_manager.get_result(task_id)
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    return {
        "task_id": result.task_id,
        "summary": result.summary,
        "findings": result.findings,
        "llm_suggestions": result.llm_suggestions,
        "processing_time_ms": result.processing_time_ms,
    }


@app.post("/api/upload-analyze", response_model=TaskResponse)
async def upload_and_analyze(
    file: UploadFile = File(...),
    smell_types: str = Form("DW,HMU,HAS,IOD,NLMR"),
):
    content = (await file.read()).decode("utf-8", errors="ignore")
    task = task_manager.create_task(
        source_type="file",
        source_name=file.filename or "uploaded_file.java",
        source_value=content,
        smell_types=[x.strip() for x in smell_types.split(",") if x.strip()],
    )
    return _serialize_task(task)


@app.post("/api/analyze", response_model=TaskResponse)
def analyze_compat(payload: dict[str, Any]):
    # Compatibility endpoint for form-style frontend submissions.
    source_type = payload.get("source_type", "url")
    source_name = payload.get("source_name") or "input"
    source_value = payload.get("source_value") or payload.get("githubUrl") or payload.get("urlInput")
    if not source_value:
        raise HTTPException(status_code=400, detail="source_value is required")
    smell_types = payload.get("smell_types") or ["DW", "HMU", "HAS", "IOD", "NLMR"]
    task = task_manager.create_task(source_type, source_name, str(source_value), smell_types)
    return _serialize_task(task)


def _serialize_task(task) -> dict[str, Any]:
    return {
        "id": task.id,
        "source_type": task.source_type,
        "source_name": task.source_name,
        "status": task.status,
        "progress": task.progress,
        "created_at": task.created_at,
        "completed_at": task.completed_at,
        "error_message": task.error_message,
    }
