import asyncio
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from config import get_settings
from database import engine, init_db
from models import HealthResponse, ResultDetailResponse, TaskCreateRequest, TaskResponse
from task_manager import TaskManager

settings = get_settings()
app = FastAPI(title="EcoCode API", version="0.2.0")
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


# ── Background worker ─────────────────────────────────────────

async def _background_worker() -> None:
    while True:
        task = None
        try:
            task = task_manager.dequeue_pending()
            if not task:
                await asyncio.sleep(2)
                continue
            print(f"[worker] processing task {task.id}")
            await task_manager.process_task(task.id)
            print(f"[worker] task {task.id} done")
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
    asyncio.get_event_loop().create_task(_background_worker())


# ── Health ─────────────────────────────────────────────────────

@app.get("/")
def read_root():
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
        "llm_status": llm_status,
    }


# ── Tasks ──────────────────────────────────────────────────────

@app.post("/api/tasks", response_model=TaskResponse)
def create_task_from_url(payload: TaskCreateRequest):
    task = task_manager.create_task(
        description=payload.description,
        source_type=payload.source_type,
        source_url=payload.source_url,
    )
    return _task_dict(task)


@app.post("/api/tasks/upload", response_model=TaskResponse)
async def create_task_upload(
    description: str = Form(""),
    files: list[UploadFile] = File(...),
):
    task = task_manager.create_task(
        description=description,
        source_type="uploaded",
    )
    file_pairs: list[tuple[str, str]] = []
    for f in files:
        content = (await f.read()).decode("utf-8", errors="ignore")
        file_pairs.append((f.filename or "unknown.java", content))
    task_manager.save_uploaded_files(task, file_pairs)
    return _task_dict(task)


@app.get("/api/tasks", response_model=list[TaskResponse])
def list_tasks(status: str | None = None):
    tasks = task_manager.list_tasks(status_filter=status)
    return [_task_dict(t) for t in tasks]


@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: int):
    task = task_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_dict(task)


# ── Results ────────────────────────────────────────────────────

@app.get("/api/tasks/{task_id}/results", response_model=list[ResultDetailResponse])
def get_results(task_id: int):
    rows = task_manager.get_results(task_id)
    return [_result_dict(r) for r in rows]


# ── Serializers ────────────────────────────────────────────────

def _task_dict(t) -> dict[str, Any]:
    return {
        "id": t.id,
        "description": t.description,
        "source_type": t.source_type,
        "source_url": t.source_url,
        "download_folder_name": t.download_folder_name,
        "status": t.status,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


def _result_dict(r) -> dict[str, Any]:
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
    }
