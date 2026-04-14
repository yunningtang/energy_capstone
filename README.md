# Energy Capstone

Android **energy anti-pattern** detection capstone.
Pairs the **DynAMICS** research dataset (events, results, manual validation) with **EcoCode**, a full-stack web app that uses an LLM to detect five Android energy patterns in Java source.

**Repo:** [github.com/yunningtang/energy_capstone](https://github.com/yunningtang/energy_capstone)

---

## What this project does

Given a Java file (or a whole GitHub repo), EcoCode tells the user — per file, per pattern — whether the file contains an Android energy anti-pattern, why it matters, and how to fix it.

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

| Path                         | Purpose                                                                  |
|------------------------------|--------------------------------------------------------------------------|
| **`ecocode-capstone/`**      | The full-stack app (backend + frontend + scripts + per-component docs)   |
| **`Dyn_Events/`**            | DynAMICS instrumentation event CSVs (per-pattern observations)           |
| **`Dyn_Results/`**           | Per-tool detection CSVs (DynAMICS / aDoctor / Paprika)                    |
| **`Dyn_Validation/`**        | Manual ground-truth labels (Class · Code Smell? · Comments)              |
| **`render.yaml`**            | Render.com deploy template                                               |
| **`reset.html`**             | One-page localStorage reset for the frontend (clears theme / hero state) |

The three `Dyn_*` folders are NOT included in the git repo by default (they're large
research artifacts). Download from the
[DynAMICS Figshare collection](https://doi.org/10.6084/m9.figshare.c.6349562.v1) and
place them next to `ecocode-capstone/`.

---

## App at a glance

EcoCode is a **single-binary FastAPI backend** (no separate worker process — the analysis loop runs inside `main.py`) plus a **React + TypeScript frontend**.

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

See **screenshots and a walkthrough** in [ecocode-capstone/docs/user-manual.md](ecocode-capstone/docs/user-manual.md).

---

## Quick start (local, ~5 minutes)

```bash
git clone https://github.com/yunningtang/energy_capstone.git
cd energy_capstone/ecocode-capstone
```

### 1. Backend (Python 3.11+)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edit .env — at minimum set LLM_PROVIDER and the matching API key
python -m uvicorn main:app --reload --port 8000
```

Backend at **http://localhost:8000** (Swagger at `/docs`).

### 2. Frontend (Node 18+)

In a second terminal:

```powershell
cd ecocode-capstone\frontend
npm install
npm start
```

Frontend at **http://localhost:3000**. Create a project → **New Run** → upload `.java` files or a `.zip`, or paste a public GitHub URL.

> **`git` CLI must be on PATH.** Repo runs are cloned via `subprocess` (not GitPython), so `git --version` must work in the backend's shell.

> **SQLite gotcha:** if `ecocode.db` is open in DB Browser when the backend starts, you may get `database is locked`. Close it first.

---

## Documentation index

| File                                                                          | Topic                                                              |
|-------------------------------------------------------------------------------|--------------------------------------------------------------------|
| [ecocode-capstone/README.md](ecocode-capstone/README.md)                       | App-level setup, env vars, ports, scripts                          |
| [ecocode-capstone/docs/architecture.md](ecocode-capstone/docs/architecture.md) | System layout, request flow, data model, LLM pipeline              |
| [ecocode-capstone/docs/api-documentation.md](ecocode-capstone/docs/api-documentation.md) | Every REST endpoint with example request/response          |
| [ecocode-capstone/docs/user-manual.md](ecocode-capstone/docs/user-manual.md)   | End-user walkthrough (project → run → review → export)             |
| [ecocode-capstone/docs/USAGE_GUIDE.md](ecocode-capstone/docs/USAGE_GUIDE.md)   | Dataset import, evaluation scripts, DB inspection                  |
| [ecocode-capstone/docs/DYNAMICS_DATASET.md](ecocode-capstone/docs/DYNAMICS_DATASET.md) | DynAMICS Figshare workflow                                  |
| [ecocode-capstone/docs/DYN_DATASETS_GUIDE.md](ecocode-capstone/docs/DYN_DATASETS_GUIDE.md) | Dataset structure & CSV columns                            |
| [ecocode-capstone/docs/deployment-guide.md](ecocode-capstone/docs/deployment-guide.md) | Docker Compose deploy notes                                    |
| [ecocode-capstone/backend/docs/DATABASE_GUIDE.md](ecocode-capstone/backend/docs/DATABASE_GUIDE.md) | SQLite schema + viewing the DB                       |
| [ecocode-capstone/database/README.md](ecocode-capstone/database/README.md)     | PostgreSQL bootstrap (Docker only)                                 |
| [render.yaml](render.yaml)                                                    | Render.com deploy template                                         |

---

## Dataset evaluation (optional)

For reproducing the DynAMICS-style evaluation:

```powershell
cd ecocode-capstone

# 1. Import all three Dyn_* CSV folders into the local DB
python scripts/import_dyn_data.py --dyn-root "../"

# 2. (optional) Decompile APKs to Java sources via jadx
python scripts/decompile_apks.py --apk-dir C:\path\to\apks --output-dir C:\dyn_decompiled --limit 10

# 3. Run the LLM against decompiled sources, comparing to ground truth
python scripts/run_dataset_eval.py --source-dir C:\dyn_decompiled --limit 20

# 4. Compute precision / recall / F1
python scripts/compute_eval_metrics.py
```

Result CSVs land in `ecocode-capstone/eval_*.csv` (one per run). See [USAGE_GUIDE.md](ecocode-capstone/docs/USAGE_GUIDE.md) for full options.

---

## License / course use

Capstone project — use per your institution's policy. Third-party dataset (DynAMICS) is governed by its original Figshare licence.
