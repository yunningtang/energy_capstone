"""
Database module for EcoCode backend.

Defines SQLAlchemy ORM models, engine, session factory, and initialization logic.
Supports SQLite (default) and PostgreSQL via DATABASE_URL.
"""

from contextlib import contextmanager
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from config import get_settings


# -----------------------------------------------------------------------------
# Base class for all ORM models. All table models inherit from this.
# -----------------------------------------------------------------------------
class Base(DeclarativeBase):
    pass


# -----------------------------------------------------------------------------
# Project: represents an energy analysis project (e.g. an Android app to analyze).
# One project can have many tasks (runs).
# -----------------------------------------------------------------------------
class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(512), default="")
    repo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# -----------------------------------------------------------------------------
# Task: represents a single analysis run (e.g. clone repo + analyze, or upload files).
# Belongs to a project. Has many ResultDetail rows (one per analyzed file).
# -----------------------------------------------------------------------------
class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("projects.id"), nullable=True
    )
    description: Mapped[str] = mapped_column(Text, default="")
    source_type: Mapped[str] = mapped_column(String(20))  # "repo" or "uploaded"
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    download_folder_name: Mapped[str] = mapped_column(String(512), default="")
    status: Mapped[str] = mapped_column(String(20), default="Pending")  # Pending / In-Progress / Done / Failed / Partial / Cancelled
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


# -----------------------------------------------------------------------------
# ResultDetail: per-file detection result for one task.
# Stores LLM detection outcome for each energy anti-pattern (DW, HMU, HAS, IOD, NLMR).
# -----------------------------------------------------------------------------
class ResultDetail(Base):
    __tablename__ = "results_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey("tasks.id"))
    folder_name: Mapped[str] = mapped_column(String(512), default="")
    file_name: Mapped[str] = mapped_column(String(512))
    file_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="Pending")
    # Energy anti-pattern detection results: "Yes" or "No" for each pattern
    dw: Mapped[str] = mapped_column(String(10), default="")   # Data Waste
    hmu: Mapped[str] = mapped_column(String(10), default="")  # Heavy Method Use
    has: Mapped[str] = mapped_column(String(10), default="")  # Heavy Async Start
    iod: Mapped[str] = mapped_column(String(10), default="")   # Inefficient Data Structure
    nlmr: Mapped[str] = mapped_column(String(10), default="")  # No Low Memory Resolution
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


# -----------------------------------------------------------------------------
# Dyn_* tables: imported from Dyn_Events, Dyn_Results, Dyn_Validation CSV datasets.
# Used for evaluation and few-shot learning (see scripts/import_dyn_data.py).
# -----------------------------------------------------------------------------

class DynEvent(Base):
    """From Dyn_Events/*.csv: instrumentation events (apk_path, package, java_file, method)."""
    __tablename__ = "dyn_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_file: Mapped[str] = mapped_column(String(256))  # e.g. DW_acquire, HMU_instantiation
    apk_path: Mapped[str] = mapped_column(String(1024))
    package: Mapped[str] = mapped_column(String(512))
    java_file: Mapped[str] = mapped_column(String(512))
    method: Mapped[str] = mapped_column(String(256))
    is_true_positive: Mapped[str | None] = mapped_column(String(10), nullable=True)


class DynResult(Base):
    """From Dyn_Results/*.csv: detected/potential code smells."""
    __tablename__ = "dyn_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_file: Mapped[str] = mapped_column(String(256))
    pattern: Mapped[str] = mapped_column(String(20))  # DW, HMU, HAS, IOD, NLMR
    raw_data: Mapped[str] = mapped_column(Text)  # JSON or CSV row for flexibility


class DynValidation(Base):
    """From Dyn_Validation/*_Pos.csv, *_Neg.csv: ground truth (class, label, comments)."""
    __tablename__ = "dyn_validation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_file: Mapped[str] = mapped_column(String(256))
    pattern: Mapped[str] = mapped_column(String(20))
    class_name: Mapped[str] = mapped_column(String(512))
    code_smell: Mapped[str] = mapped_column(String(10))  # Yes / No
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_tool: Mapped[str | None] = mapped_column(String(64), nullable=True)  # aDoctor, DynAMICS


# -----------------------------------------------------------------------------
# Evaluation run: Safwat-style dataset evaluation (decompiled APKs + Dyn_Validation).
# Stores per-sample results for reproducibility and analysis.
# -----------------------------------------------------------------------------
class EvalRun(Base):
    __tablename__ = "eval_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_dir: Mapped[str] = mapped_column(String(1024))
    total_compared: Mapped[int] = mapped_column(Integer, default=0)
    total_skipped: Mapped[int] = mapped_column(Integer, default=0)
    precision: Mapped[float] = mapped_column(Float, default=0.0)
    recall: Mapped[float] = mapped_column(Float, default=0.0)
    f1: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class EvalResult(Base):
    """Per-sample evaluation result: class_name, pattern, ground_truth, prediction."""
    __tablename__ = "eval_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    eval_run_id: Mapped[int] = mapped_column(Integer, ForeignKey("eval_runs.id"))
    class_name: Mapped[str] = mapped_column(String(512))
    pattern: Mapped[str] = mapped_column(String(20))
    ground_truth: Mapped[str] = mapped_column(String(10))  # Yes / No
    prediction: Mapped[str] = mapped_column(String(10))  # Yes / No
    source_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# -----------------------------------------------------------------------------
# Engine and session setup. Load DATABASE_URL from config (e.g. sqlite:///ecocode.db).
# -----------------------------------------------------------------------------
settings = get_settings()

_db_url = settings.database_url
# Fix legacy postgres:// URL (SQLAlchemy expects postgresql://)
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)

_engine_kwargs: dict = {"pool_pre_ping": True}
if _db_url.startswith("sqlite"):
    _engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 5}

engine = create_engine(_db_url, **_engine_kwargs)

if _db_url.startswith("sqlite"):
    from sqlalchemy import event as _sa_event

    @_sa_event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        try:
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()
        except Exception:
            pass
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


# -----------------------------------------------------------------------------
# Migration helper: add a column to a table if it does not exist.
# Used for backward compatibility when schema evolves (e.g. adding feedback column).
# -----------------------------------------------------------------------------
def _migrate_column(conn, table: str, column: str, col_type: str = "TEXT") -> None:
    """Add column to table if missing. Try SELECT first; if it fails, run ALTER TABLE."""
    try:
        conn.execute(text(f"SELECT {column} FROM {table} LIMIT 1"))
    except Exception:
        try:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            conn.commit()
        except Exception:
            pass


# -----------------------------------------------------------------------------
# Initialize database: create tables, run migrations, ensure default project exists.
# Called on app startup (main.py on_startup).
# -----------------------------------------------------------------------------
def init_db() -> None:
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        print(f"[init_db] Warning: create_all failed ({exc}). "
              "If DB Browser is open, close it and restart.")

    try:
        with engine.connect() as conn:
            _migrate_column(conn, "results_details", "feedback", "TEXT")
            _migrate_column(conn, "tasks", "project_id", "INTEGER")
            _migrate_column(conn, "tasks", "error_message", "TEXT")

            try:
                row = conn.execute(
                    text("SELECT id FROM projects LIMIT 1")
                ).fetchone()
            except Exception:
                row = None

            if row is None:
                conn.execute(
                    text("INSERT INTO projects (name) VALUES ('Default Project')")
                )
                conn.commit()

            conn.execute(
                text(
                    "UPDATE tasks SET project_id = (SELECT MIN(id) FROM projects) "
                    "WHERE project_id IS NULL"
                )
            )
            conn.commit()
    except Exception as exc:
        print(f"[init_db] Warning: migration failed ({exc}). "
              "Close DB Browser for SQLite if open.")


# -----------------------------------------------------------------------------
# Context manager for database sessions. Use: with get_db_session() as db: ...
# Ensures session is closed even when an exception occurs.
# -----------------------------------------------------------------------------
@contextmanager
def get_db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
