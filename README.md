# Energy Capstone

Android **energy anti-pattern** detection capstone.
Pairs the **DynAMICS** research dataset (events, results, manual validation) with a full-stack web app that uses an LLM to detect five Android energy patterns in Java source.

**Repo:** [github.com/yunningtang/energy_capstone](https://github.com/yunningtang/energy_capstone)

---

## What this project does

Given a Java file (or a whole GitHub repo), the app tells the user — per file, per pattern — whether the file contains an Android energy anti-pattern, why it matters, and how to fix it.

The five patterns come from the **TQRG taxonomy** used by the DynAMICS paper:

| Code | Full name              | What it is                                                                                | Severity tier |
|------|------------------------|-------------------------------------------------------------------------------------------|---------------|
| DW   | Durable Wakelock       | `WakeLock.acquire()` without matching `release()` on every code path                       | Critical      |
| HMU  | HashMap Usage          | `java.util.HashMap` where `ArrayMap` / `SparseArray` would be more memory-efficient        | Minor         |
| HAS  | Heavy AsyncTask        | Blocking I/O / CPU work inside `onPreExecute` / `onPostExecute` / `onProgressUpdate`        | Major         |
| IOD  | Init OnDraw            | Object allocations (`new Paint()`, `new Rect()`) inside `View.onDraw()`                    | Major         |
| NLMR | No Low-Memory Resolver | `Activity` / `Service` missing `onLowMemory()` / `onTrimMemory()` overrides                | Minor         |

Reference paper:
*A Tool-Based Method for the Specification and Dynamic Detection of Android Behavioral Code Smells* (TSE 2024) — PDF in repo root.

---

## Repo layout

```
energy_capstone/
├── backend/                   FastAPI app (analysis worker runs in-process)
│   ├── main.py                Routes + _background_worker async loop
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
├── database/                  PostgreSQL bootstrap (Docker only — local uses SQLAlchemy init_db)
├── docs/                      User-facing documentation (architecture, API, user manual)
├── scripts/                   CLI tools (dataset import, evaluation, decompile)
├── Dyn_Events/                DynAMICS instrumentation event CSVs (gitignored — Figshare download)
├── Dyn_Results/               Per-tool detection CSVs (gitignored)
├── Dyn_Validation/            Manual ground-truth labels (gitignored)
├── docker-compose.yml         Postgres + backend + frontend
├── render.yaml                Render.com deploy template
└── reset.html                 One-page localStorage reset for the frontend
```

The three `Dyn_*` folders are NOT included in the git repo by default (they're large
research artifacts). Download from the
[DynAMICS Figshare collection](https://doi.org/10.6084/m9.figshare.c.6349562.v1) and
place them next to `backend/`, `frontend/` etc.

---

## App at a glance

A **single-binary FastAPI backend** (no separate worker process — the analysis loop runs inside `main.py`) plus a **React + TypeScript frontend**.

### Backend
- **FastAPI** + **SQLAlchemy** + **SQLite** (default) or **PostgreSQL** (Docker)
- Three pluggable LLM providers, all called via `httpx` (no SDK lock-in):
  - **Ollama** — local, private (recommended for sensitive code)
  - **Google Gemini** — fast, cheap (recommended for quickstart)
  - **OpenAI** — GPT-4 family
- Per-file pipeline: **keyword pre-filter** → **AST slicer** (Java method/class isolation) → **single batched LLM call** for the 5 patterns → structured JSON response (diagnosis · severity · location · example fix).

### Frontend
- React + react-router + framer-motion (no Redux — local state only)
- Code view styled after **GitHub PR reviews**: line numbers + inline finding cards directly under the offending line, theme-aware syntax highlighting (light/dark)
- Two views: **Table view** (matrix of files × patterns) and **Code view** (inline cards)
- Issue navigator bar, gutter dots on issue lines, click-to-flash line targeting
- Export to **CSV / JSON / Markdown**

See **screenshots and a walkthrough** in [docs/user-manual.md](docs/user-manual.md).

---

## Quick start (local, ~5 minutes)

### Prerequisites
- Python **3.11+** (3.12 fine)
- Node **18+**
- `git` CLI on PATH (used by repo-URL runs via `subprocess.run(["git", "clone", ...])`)
- One LLM provider:
  - **Gemini API key** (recommended — fast, free tier)
  - **Ollama** running locally on `http://localhost:11434`
  - **OpenAI API key**

### 1. Clone

```bash
git clone https://github.com/yunningtang/energy_capstone.git
cd energy_capstone
```

### 2. Backend env

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

> **Settings UI is read-only with respect to the backend.** The frontend Settings
> page lets users *test* connectivity and *store API keys in their browser* for
> convenience, but the backend always uses `backend/.env`. To change provider,
> edit `.env` and restart `uvicorn`.

### 3. Backend

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

### 4. Frontend (new terminal)

```powershell
cd frontend
npm install
npm start
```

Open **http://localhost:3000**. Create a project → **New Run** → upload `.java` files or a `.zip`, or paste a public GitHub URL.

To point at a different API host:

```powershell
$env:REACT_APP_API_BASE_URL="http://example.com:8000"; npm start
```

> **SQLite gotcha:** if `ecocode.db` is open in DB Browser when the backend starts, you may get `database is locked`. Close it first.

---

## Docker Compose (optional, Postgres)

```powershell
copy .env.example .env
copy backend\.env.example backend\.env
# edit both .envs
docker compose up --build
```

`database/init.sql` is **PostgreSQL-only** (used only by the Docker init hook).
Local SQLite uses SQLAlchemy `init_db()` from `backend/database.py` — no SQL file.

---

## Dataset evaluation (optional)

For reproducing the DynAMICS-style evaluation:

```powershell
# 1. Import all three Dyn_* CSV folders into the local DB (they live at repo root)
python scripts/import_dyn_data.py

# 2. (optional) Decompile APKs to Java sources via jadx
python scripts/decompile_apks.py --apk-dir C:\path\to\apks --output-dir C:\dyn_decompiled --limit 10

# 3. Run the LLM against decompiled sources, comparing to ground truth
python scripts/run_dataset_eval.py --source-dir C:\dyn_decompiled --limit 20

# 4. Compute precision / recall / F1
python scripts/compute_eval_metrics.py
```

Result CSVs land in `eval_*.csv` (one per run). See [docs/USAGE_GUIDE.md](docs/USAGE_GUIDE.md) for full options.

### CLI scripts

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

By default scripts look for `Dyn_*` folders at the repo root. Pass `--dyn-root <path>` to override.

---

## What runs where

| Concern                  | Where                                                       |
|--------------------------|-------------------------------------------------------------|
| HTTP routes              | `backend/main.py`                                           |
| Background worker        | `backend/main.py` `_background_worker()` — async task       |
| Per-file analysis        | `backend/task_manager.py` `_process_file()`                  |
| LLM call                 | `backend/llm_service.py` (provider classes)                  |
| AST slicing              | `backend/ast_slicer.py`                                     |
| Schema migrations        | `backend/database.py` (`init_db` + `_migrate_column`)         |

---

## Documentation index

| File                                                                          | Topic                                                              |
|-------------------------------------------------------------------------------|--------------------------------------------------------------------|
| [docs/architecture.md](docs/architecture.md)                                  | System layout, request flow, data model, LLM pipeline              |
| [docs/api-documentation.md](docs/api-documentation.md)                        | Every REST endpoint with example request/response                  |
| [docs/user-manual.md](docs/user-manual.md)                                    | End-user walkthrough (project → run → review → export)             |
| [docs/USAGE_GUIDE.md](docs/USAGE_GUIDE.md)                                    | Dataset import, evaluation scripts, DB inspection                  |
| [docs/DYNAMICS_DATASET.md](docs/DYNAMICS_DATASET.md)                          | DynAMICS Figshare workflow                                         |
| [docs/DYN_DATASETS_GUIDE.md](docs/DYN_DATASETS_GUIDE.md)                      | Dataset structure & CSV columns                                    |
| [docs/deployment-guide.md](docs/deployment-guide.md)                          | Docker Compose deploy notes                                        |
| [backend/docs/DATABASE_GUIDE.md](backend/docs/DATABASE_GUIDE.md)              | SQLite schema + viewing the DB                                     |
| [database/README.md](database/README.md)                                      | PostgreSQL bootstrap (Docker only)                                 |
| [render.yaml](render.yaml)                                                    | Render.com deploy template                                         |

---

## License / course use

Capstone project — use per your institution's policy. Third-party dataset (DynAMICS) is governed by its original Figshare licence.
