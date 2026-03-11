import io
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select

from config import get_settings
from database import ResultDetail, Task, get_db_session
from llm_service import create_llm_service

PATTERNS = ["DW", "HMU", "HAS", "IOD", "NLMR"]
JAVA_EXTENSIONS = {".java"}


class TaskManager:
    def __init__(self):
        self.llm, self.llm_provider = create_llm_service()
        settings = get_settings()
        self.files_root = Path(settings.temp_repo_dir).resolve()
        self.files_root.mkdir(parents=True, exist_ok=True)

    # ── Task CRUD ──────────────────────────────────────────────

    def create_task(
        self,
        description: str,
        source_type: str,
        source_url: str | None = None,
    ) -> Task:
        with get_db_session() as db:
            task = Task(
                description=description,
                source_type=source_type,
                source_url=source_url,
                status="Pending",
            )
            db.add(task)
            db.commit()
            db.refresh(task)
            folder = f"Task_{task.id}_Downloaded_Files"
            task.download_folder_name = folder
            db.commit()
            db.refresh(task)
            return task

    def list_tasks(self, status_filter: str | None = None) -> list[Task]:
        with get_db_session() as db:
            stmt = select(Task).order_by(Task.created_at.desc())
            if status_filter and status_filter != "All":
                stmt = stmt.where(Task.status == status_filter)
            return list(db.scalars(stmt))

    def get_task(self, task_id: int) -> Task | None:
        with get_db_session() as db:
            return db.get(Task, task_id)

    def get_results(self, task_id: int) -> list[ResultDetail]:
        with get_db_session() as db:
            stmt = (
                select(ResultDetail)
                .where(ResultDetail.task_id == task_id)
                .order_by(ResultDetail.id)
            )
            return list(db.scalars(stmt))

    def dequeue_pending(self) -> Task | None:
        with get_db_session() as db:
            stmt = (
                select(Task)
                .where(Task.status == "Pending")
                .order_by(Task.created_at.asc())
                .limit(1)
            )
            task = db.scalars(stmt).first()
            if not task:
                return None
            task.status = "In-Progress"
            db.commit()
            db.refresh(task)
            return task

    # ── File ingestion ─────────────────────────────────────────

    def save_uploaded_files(
        self, task: Task, files: list[tuple[str, str]]
    ) -> None:
        """files = [(filename, content), ...]"""
        folder = self.files_root / task.download_folder_name
        folder.mkdir(parents=True, exist_ok=True)
        with get_db_session() as db:
            for name, content in files:
                fpath = folder / name
                fpath.write_text(content, encoding="utf-8")
                db.add(
                    ResultDetail(
                        task_id=task.id,
                        folder_name=task.download_folder_name,
                        file_name=name,
                        file_content=content,
                        status="Pending",
                    )
                )
            db.commit()

    async def download_repo(self, task: Task) -> None:
        url = task.source_url or ""
        folder = self.files_root / task.download_folder_name
        folder.mkdir(parents=True, exist_ok=True)

        try:
            await self._clone_repo(url, folder)
        except Exception:
            await self._download_zip(url, folder)

        java_files = self._collect_java_files(folder)
        with get_db_session() as db:
            for fpath in java_files:
                rel = fpath.relative_to(folder)
                content = fpath.read_text(encoding="utf-8", errors="ignore")
                db.add(
                    ResultDetail(
                        task_id=task.id,
                        folder_name=task.download_folder_name,
                        file_name=str(rel),
                        file_content=content,
                        status="Pending",
                    )
                )
            db.commit()

    async def _clone_repo(self, url: str, dest: Path) -> None:
        proc = subprocess.run(
            ["git", "clone", "--depth", "1", url, str(dest / "_repo")],
            capture_output=True,
            timeout=120,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.decode(errors="ignore"))

    async def _download_zip(self, url: str, dest: Path) -> None:
        parts = url.rstrip("/").split("/")
        if "github.com" in url and len(parts) >= 5:
            owner, repo = parts[-2], parts[-1]
            zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/main.zip"
        else:
            zip_url = url

        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as c:
            r = await c.get(zip_url)
            r.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            zf.extractall(dest / "_repo")

    def _collect_java_files(self, folder: Path) -> list[Path]:
        results: list[Path] = []
        for root, _, filenames in os.walk(folder):
            for fn in filenames:
                if Path(fn).suffix in JAVA_EXTENSIONS:
                    results.append(Path(root) / fn)
        return results

    # ── Task processing ────────────────────────────────────────

    async def process_task(self, task_id: int) -> None:
        with get_db_session() as db:
            task = db.get(Task, task_id)
            if not task:
                return
            source_type = task.source_type
            source_url = task.source_url

        if source_type == "repo":
            t = self.get_task(task_id)
            if t:
                await self.download_repo(t)

        results = self.get_results(task_id)
        if not results:
            self._set_task_status(task_id, "Done")
            return

        for rd in results:
            await self._process_file(rd.id, rd.file_content or "")

        self._set_task_status(task_id, "Done")
        self._cleanup_folder(task_id)

    async def _process_file(self, result_id: int, code: str) -> None:
        self._update_result_status(result_id, "Analyzing")

        for pattern in PATTERNS:
            try:
                resp = await self.llm.check_pattern(code, pattern)
                answer_raw = str(resp.get("answer", "No")).strip().lower()
                answer = "Yes" if answer_raw in ("yes", "y", "true") else "No"
            except Exception:
                answer = "No"
            self._update_result_pattern(result_id, pattern, answer)

        self._update_result_status(result_id, "Done")

    # ── Helpers ────────────────────────────────────────────────

    def _set_task_status(self, task_id: int, status: str) -> None:
        with get_db_session() as db:
            task = db.get(Task, task_id)
            if task:
                task.status = status
                db.commit()

    def _update_result_status(self, result_id: int, status: str) -> None:
        with get_db_session() as db:
            rd = db.get(ResultDetail, result_id)
            if rd:
                rd.status = status
                db.commit()

    def _update_result_pattern(
        self, result_id: int, pattern: str, value: str
    ) -> None:
        col = pattern.lower()
        with get_db_session() as db:
            rd = db.get(ResultDetail, result_id)
            if rd and hasattr(rd, col):
                setattr(rd, col, value)
                db.commit()

    def _cleanup_folder(self, task_id: int) -> None:
        task = self.get_task(task_id)
        if not task:
            return
        folder = self.files_root / task.download_folder_name
        if folder.exists():
            shutil.rmtree(folder, ignore_errors=True)
