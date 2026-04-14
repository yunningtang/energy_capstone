# Architecture

EcoCode is intentionally a **single backend process + a SPA frontend**. There is
no separate worker, no message broker, no scheduler. Background analysis is an
asyncio loop that lives inside `main.py` and shares the FastAPI process.

```
┌──────────────────────┐                ┌──────────────────────────────┐
│                      │  HTTP / JSON   │                              │
│   React frontend     │ ─────────────► │   FastAPI backend            │
│  (CRA, port 3000)    │                │   uvicorn, port 8000         │
│                      │ ◄───────────── │                              │
└──────────────────────┘                │   ┌────────────────────────┐ │
                                        │   │ _background_worker     │ │
                                        │   │  (async loop)          │ │
                                        │   │   dequeue_pending →    │ │
                                        │   │   download / save →    │ │
                                        │   │   _process_file × N    │ │
                                        │   └─────────┬──────────────┘ │
                                        │             │                │
                                        │             ▼                │
                                        │   ┌────────────────────────┐ │
                                        │   │ task_manager           │ │
                                        │   │  ├─ AST slicer         │ │
                                        │   │  ├─ keyword prefilter  │ │
                                        │   │  └─ LLMService.batch   │ │
                                        │   └─────────┬──────────────┘ │
                                        │             │                │
                                        └─────────────┼────────────────┘
                                                      │
                                          ┌───────────┴───────────┐
                                          ▼                       ▼
                            ┌───────────────────┐     ┌───────────────────────┐
                            │  SQLite or Postgres│     │  LLM provider          │
                            │  (default: SQLite) │     │   ├─ Ollama (httpx)    │
                            │                    │     │   ├─ Gemini (httpx)    │
                            │  ecocode.db        │     │   └─ OpenAI (httpx)    │
                            └───────────────────┘     └───────────────────────┘
```

---

## Components

### Backend — `backend/`

| File | Responsibility |
|------|----------------|
| `main.py`         | FastAPI app, route handlers, CORS, `_background_worker()` (async loop that polls for Pending tasks every 2s) |
| `task_manager.py` | Project / Run / file CRUD, background `process_task`, AST slicing wiring, retry, cancel |
| `llm_service.py`  | Three provider classes (`OllamaService`, `GeminiService`, `OpenAIService`); all call their HTTP API directly via `httpx` — no SDKs. Includes `build_batch_prompt`, `_parse_batch_response`, keyword prefilter |
| `ast_slicer.py`   | Java method/class scope extraction. Pattern-aware (e.g. for IOD it isolates `onDraw` bodies). Falls back to raw source on parse error |
| `database.py`     | SQLAlchemy engine, ORM models (`Project`, `Task`, `ResultDetail`, `DynEvent`, `DynResult`, `DynValidation`, `EvalRun`, `EvalResult`), `init_db()`, ad-hoc `_migrate_column` for additive ALTERs |
| `models.py`       | Pydantic request/response schemas |
| `config.py`       | `pydantic_settings.BaseSettings` — loads `.env` |

### Frontend — `frontend/`

CRA + React 18 + TypeScript + react-router + framer-motion. No state library — just `useState` + `useEffect`.

| File | Responsibility |
|------|----------------|
| `pages/ProjectsList.tsx` | Dashboard: hero banner, stats tiles, recent runs, project cards |
| `pages/ProjectDetail.tsx`| Run history table for one project, status filters |
| `pages/NewRun.tsx`       | Repo URL or file/zip upload form |
| `pages/RunDetail.tsx`    | Two views: Table (matrix) and Code (files panel + code + inline finding cards). Polls `/api/runs/{id}` and `/api/runs/{id}/findings` every 3s while In-Progress |
| `pages/Rules.tsx`        | Pattern reference + Getting Started guide |
| `pages/Settings.tsx`     | Read-only LLM provider status + localStorage prefs |
| `components/CodeBlock.tsx`        | Theme-aware Java syntax highlighter, gutter dots, line slots, flash animation |
| `components/InlineFindingCard.tsx`| Copilot-style inline card (diagnosis, location, suggested change mini-diff) |
| `components/DiffView.tsx`         | Side-by-side LCS diff viewer (used in legacy paths) |
| `services/api.ts`        | Single `fetch` wrapper, base URL from env or localStorage |
| `lib/severity.ts`        | Pattern → severity tier mapping; Energy Grade computation (A–F) |

---

## Request flow — uploading files for analysis

```
Browser                 FastAPI                       LLM                    DB
   │                       │                            │                     │
   │  POST /api/runs/upload│                            │                     │
   │ ───────────────────► │                            │                     │
   │                       │  _expand_uploaded_files()   │                     │
   │                       │  (extracts .zip if any)     │                     │
   │                       │                             │                     │
   │                       │  task_manager.create_task   │                     │
   │                       │ ───────────────────────────►│  INSERT tasks       │
   │                       │  task_manager.save_files    │                     │
   │                       │ ───────────────────────────►│  INSERT result_details (status=Pending) │
   │ ◄───────── 200 OK ────│                             │                     │
   │                       │                             │                     │
   │ (asynchronously, in background loop)                │                     │
   │                       │  dequeue_pending()          │                     │
   │                       │ ◄───────────────────────────│  SELECT … WHERE status='Pending' LIMIT 1 │
   │                       │                             │                     │
   │                       │  for each file (≤ 5 in parallel via Semaphore):     │
   │                       │    keyword prefilter         │                     │
   │                       │    AST slice                 │                     │
   │                       │    LLM batch call ─────────► one call per file      │
   │                       │ ◄────────────────────────── structured JSON         │
   │                       │  _update_result_pattern + feedback ────────────►  UPDATE result_details │
   │                       │                                                                          │
   │ GET /api/runs/{id}/findings (every 3s polling)                                                    │
   │ ──────────────────────►│ ◄──────────────────────────────────────────────────────────────────────►│
   │ ◄── findings JSON ─────│                                                                          │
```

Cancel and retry are wired the same way:

- **Cancel** → flag in `_cancelled` set + flip task status; the worker checks the flag between files (not mid-LLM-call).
- **Retry** → reset failed file rows to `Pending` + flip task status to `Pending`; the worker picks it up in the next poll.

---

## Pattern detection pipeline

For each Java file:

1. **Keyword pre-filter** (`prefilter_patterns` in `llm_service.py`)
   Cheap regex over the source. If a pattern's keyword set is absent (e.g. file has no
   `WakeLock` literal), mark that pattern `NA` immediately and skip it from the LLM call.
   Cuts LLM cost when the obvious patterns aren't present.

2. **AST slice** (`build_sliced_prompt_code` in `ast_slicer.py`)
   Extract methods / classes that matter for the remaining patterns:
   - IOD → `onDraw(...)` bodies
   - HAS → `onPostExecute / onPreExecute / onProgressUpdate` bodies
   - DW → methods touching `WakeLock` + their try/finally context
   - HMU / NLMR → class-level signatures
   The slicer is regex/scope-based (no `javalang` dep) and falls back to raw source if it
   can't parse.

3. **Single batched LLM call** (`build_batch_prompt` in `llm_service.py`)
   Asks the LLM to return verdicts + structured fix data for *all* remaining patterns in
   one shot. Schema:
   ```json
   {
     "DW":  { "answer": "Yes|No", "reason": "...", "diagnosis_summary": "...",
              "severity": "minor|major|critical", "confidence": "high|medium|low",
              "line_range": "12-18", "anchor_line": 14, "operation": "wrap",
              "location_hint": "Inside startTracking() at line 12", "suggested_fix": "...",
              "example_code": "...", "fix_explanation": "...",
              "original_snippet": "...", "fixed_snippet": "..." },
     ...
   }
   ```
   Errors (HTTP failure, unparseable JSON, missing entry) downgrade the verdict to `NA`
   with `error: true` in the feedback so the UI can flag them.

4. **Persist** via `task_manager._update_result_pattern` + `_update_result_feedback`.

5. **File status** → `Done` (always; per-pattern errors are surfaced inside the feedback,
   not by failing the whole file).

---

## Data model

Single SQLite file at `backend/ecocode.db` (or Postgres via `DATABASE_URL`).

### App tables

| Table | Columns of note |
|-------|-----------------|
| `projects`         | `id`, `name`, `repo_url`, `created_at` |
| `tasks`            | `id`, `project_id`, `description`, `source_type` (`repo` / `uploaded`), `source_url`, `download_folder_name`, `status` (`Pending` / `In-Progress` / `Done` / `Failed` / `Partial` / `Cancelled`), `error_message`, `created_at`, `updated_at` |
| `results_details`  | `id`, `task_id`, `file_name`, `file_content`, `status` (`Pending` / `Analyzing` / `Done` / `Failed`), `dw`, `hmu`, `has`, `iod`, `nlmr` (each `Yes` / `No` / `NA` / empty), `feedback` (JSON column with per-pattern diagnosis / fix data) |

### Dataset tables (populated by `scripts/import_dyn_data.py`)

| Table             | Source folder       |
|-------------------|---------------------|
| `dyn_events`      | `Dyn_Events/*.csv`  |
| `dyn_results`     | `Dyn_Results/*.csv` |
| `dyn_validation`  | `Dyn_Validation/*.csv` (ground-truth labels) |

### Evaluation tables (populated by `scripts/run_dataset_eval.py`)

| Table          | Purpose |
|----------------|---------|
| `eval_runs`    | One row per evaluation invocation (timestamp, source dir, limit, …) |
| `eval_results` | Per-(file × pattern) row: predicted, expected, match flag, latency, etc. |

Detailed schema reference: [`backend/docs/DATABASE_GUIDE.md`](../backend/docs/DATABASE_GUIDE.md).

---

## Frontend ↔ backend contract

The frontend speaks to **only** these endpoints (full reference: [api-documentation.md](api-documentation.md)):

```
GET  /api/health
GET  /api/projects                  POST /api/projects
GET  /api/projects/{id}             PATCH /api/projects/{id}      DELETE /api/projects/{id}
GET  /api/projects/{id}/runs        GET  /api/projects/{id}/pattern-stats
POST /api/runs                      POST /api/runs/upload
GET  /api/runs/{id}                 DELETE /api/runs/{id}
GET  /api/runs/{id}/findings
POST /api/runs/{id}/cancel          POST /api/runs/{id}/retry
```

`/api/tasks*` endpoints exist as legacy aliases — they map to the same handlers but
predate the project/run rename. New code should not use them.

---

## Choice notes

### Why no separate worker?

The capstone scope is a one-machine demo. A single FastAPI process running an asyncio
loop avoids the orchestration cost of Celery/RQ/Arq for a workload that's already
I/O-bound (LLM calls dominate). If load justifies it, the worker can be lifted into
its own process with no schema changes — `dequeue_pending` is already designed to be
called from outside.

### Why no HTTP SDKs (openai / google-generativeai)?

Three providers, three different REST shapes, but all small JSON over HTTPS. Going
direct via `httpx` keeps the dependency surface tiny (`requirements.txt` is 9 lines)
and avoids version-matrix headaches across providers.

### Why polling and not SSE?

We had an SSE endpoint, removed in commit `8f62cfe`. The 3-second poll is good enough,
keeps the proxy story simple (no nginx tweak), and the SSE response was cancelling
mid-stream on most reverse-proxy setups. Bring it back if push becomes critical.

### Why GitHub Primer color tokens?

The frontend converged on a Copilot-style PR review aesthetic for the Code view. Using
the same `#0d1117 / #e6edf3 / #30363d / #cf222e / #1a7f37` palette means the syntax
highlighting reads like GitHub even before users notice it's a different app — lower
cognitive friction. Light + dark mode share the token names.

---

## Evaluation baselines

EcoCode predictions are benchmarked against two analyzers that share the same five-pattern taxonomy:

- **aDoctor** — static code-smell detector for Android (Palomba et al.). Used as the
  ground-truth label source in our evaluation CSVs (`eval_full_matrix.csv`,
  `eval_run_summary.csv`).
- **DynAMICS** — dynamic analysis dataset covering the same taxonomy, ingested via
  `scripts/import_dyn_data.py` and documented in [`DYNAMICS_DATASET.md`](DYNAMICS_DATASET.md).

Facebook Infer and Android Lint are **not** used as baselines: neither tool reports
on the Android-specific energy smells in our taxonomy, so their outputs would not be
directly comparable. aDoctor and DynAMICS publish per-file Yes/No labels for exactly
the five patterns this project detects.
