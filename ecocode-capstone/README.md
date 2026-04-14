# EcoCode (capstone app)

Local-first web app: **FastAPI** backend + **React** frontend.
Detects five Android energy anti-patterns — **DW · HMU · HAS · IOD · NLMR** — in Java source, using **Ollama**, **Google Gemini**, or **OpenAI**.

The analysis worker is an **async loop inside `main.py`** — no separate `worker.py` process to manage.

---

## Prerequisites

- Python **3.11+** (3.12 fine)
- Node **18+**
- `git` CLI on PATH (used by repo-URL runs via `subprocess.run(["git", "clone", ...])`)
- One LLM provider:
  - **Gemini API key** (recommended for quickstart — fast, free tier)
  - **Ollama** running locally on `http://localhost:11434`
  - **OpenAI API key**

---

## 1. Environment

From this folder (`ecocode-capstone`):

```powershell
copy backend\.env.example backend\.env
```

Edit `backend/.env`:

| Variable                                    | When to set                                                       |
|---------------------------------------------|-------------------------------------------------------------------|
| `DATABASE_URL=sqlite:///ecocode.db`         | Default — local SQLite (no setup needed)                          |
| `DATABASE_URL=postgresql://...`             | Postgres (Docker / production)                                    |
| `LLM_PROVIDER=gemini` + `GEMINI_API_KEY`    | Google AI Studio key (free tier OK)                               |
| `LLM_PROVIDER=ollama` + `OLLAMA_BASE_URL` + `OLLAMA_MODEL` | Local llama / qwen / etc.                          |
| `LLM_PROVIDER=openai` + `OPENAI_API_KEY`    | OpenAI                                                            |
| `FRONTEND_URL=http://example:3001`          | Only if frontend isn't on `http://localhost:3000` (CORS allow-list) |

> **Settings is read from env, not from the UI.** The Settings page in the
> frontend lets users *test* connectivity and *store API keys in their
> browser* for convenience, but the backend always uses `backend/.env`.
> If you want to change provider, edit `.env` and restart `uvicorn`.

---

## 2. Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

- API:     **http://localhost:8000**
- Swagger: **http://localhost:8000/docs**
- Health:  **http://localhost:8000/api/health**

Database file is auto-created on first run at `backend/ecocode.db`.

---

## 3. Frontend

```powershell
cd frontend
npm install
npm start
```

Open **http://localhost:3000**.

To point at a different API host (e.g. backend on a remote server):

```powershell
$env:REACT_APP_API_BASE_URL="http://example.com:8000"; npm start
```

The Settings page also lets each browser override this at runtime — useful when
demoing without rebuilding.

---

## 4. Docker Compose (optional, Postgres)

```powershell
copy .env.example .env
copy backend\.env.example backend\.env
# edit both .envs
docker compose up --build
```

`database/init.sql` is **PostgreSQL-only** (used only by the Docker init hook).
Local SQLite uses SQLAlchemy `init_db()` from `backend/database.py` — no SQL file.

---

## 5. CLI scripts (run from `ecocode-capstone/`)

| Script                                | Purpose                                                                |
|---------------------------------------|------------------------------------------------------------------------|
| `scripts/import_dyn_data.py`          | Import `Dyn_Events` / `Dyn_Results` / `Dyn_Validation` CSVs into the DB |
| `scripts/run_dataset_eval.py`         | Evaluate the LLM pipeline against `dyn_validation` ground truth         |
| `scripts/evaluate.py`                 | Quick eval against `data/test-samples/` + `ground_truth.json`           |
| `scripts/evaluate_dyn.py`             | Per-pattern eval CLI (P / R / F1 reporting)                             |
| `scripts/compute_eval_metrics.py`     | Aggregate per-pattern metrics across runs                                |
| `scripts/decompile_apks.py`           | APK → Java sources via [jadx](https://github.com/skylot/jadx)           |
| `scripts/migrate.py`                  | Bootstrap / re-init the schema                                          |
| `scripts/check_env.py`                | Sanity check (Python / .env / DB / LLM reachable)                       |
| `scripts/query_dyn_data.py`           | Ad-hoc query helper for `dyn_*` tables                                  |
| `scripts/setup.ps1` / `setup.sh`      | One-shot venv + npm install                                             |

By default scripts look for `Dyn_*` folders at the repo root (`../Dyn_Events`, …).
Pass `--dyn-root <path>` to override.

---

## 6. Project layout

```
ecocode-capstone/
├── backend/                   FastAPI app
│   ├── main.py                Routes + background worker
│   ├── task_manager.py        Project / Run / file processing
│   ├── llm_service.py         Ollama / Gemini / OpenAI HTTPX clients
│   ├── ast_slicer.py          Java method-scope extraction (no javalang dep)
│   ├── database.py            SQLAlchemy engine, models, init_db
│   ├── models.py              Pydantic request/response models
│   ├── config.py              pydantic-settings env loader
│   ├── docs/DATABASE_GUIDE.md SQLite schema reference
│   └── requirements.txt
├── frontend/                  React + TypeScript (CRA)
│   ├── src/pages/             ProjectsList · ProjectDetail · NewRun · RunDetail · Rules · Settings
│   ├── src/components/        CodeBlock · InlineFindingCard · DiffView · SeverityBadge · …
│   └── src/services/api.ts    Single fetch wrapper
├── database/                  Postgres bootstrap (Docker only)
├── docs/                      User-facing documentation
├── scripts/                   CLI tools
└── docker-compose.yml
```

For deeper docs see [docs/README.md](docs/README.md).

---

## 7. What runs where

| Concern                  | Where                                                       |
|--------------------------|-------------------------------------------------------------|
| HTTP routes              | `backend/main.py`                                           |
| Background worker        | `backend/main.py` `_background_worker()` — async task       |
| Per-file analysis        | `backend/task_manager.py` `_process_file()`                  |
| LLM call                 | `backend/llm_service.py` (provider classes)                  |
| AST slicing              | `backend/ast_slicer.py`                                     |
| Schema migrations        | `backend/database.py` (`init_db` + `_migrate_column`)         |

For the request flow end-to-end, see [docs/architecture.md](docs/architecture.md).
