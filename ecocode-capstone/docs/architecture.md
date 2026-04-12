# Architecture

EcoCode uses a split architecture:

1. **Frontend (React/TypeScript)**: submit URL/file/snippet and monitor task statuses.
2. **Backend (FastAPI)**: create/list tasks, expose results, and provide health checks.
3. **Worker (Python)**: pulls queued tasks and runs LLM-based smell analysis.
4. **PostgreSQL**: stores task lifecycle and analysis results.
5. **Ollama**: local LLM runtime for structured code smell analysis.

## Request Flow

1. Frontend calls `POST /api/tasks`.
2. Backend stores task with `QUEUED`.
3. Worker polls queue and marks `IN_PROGRESS`.
4. Worker analyzes by smell type (`DW/HMU/HAS/IOD/NLMR`).
5. Worker stores findings and marks task `FINISHED` (or `FAILED`).
6. Frontend polls `GET /api/tasks` and `GET /api/results/{task_id}`.

## Evaluation Baselines

EcoCode predictions are benchmarked against two published static/dynamic
analyzers that share the same five-pattern taxonomy (DW, HMU, HAS, IOD, NLMR):

- **aDoctor** — static code-smell detector for Android (Palomba et al.),
  used as the ground-truth label source in our evaluation CSVs
  (`eval_full_matrix.csv`, `eval_run_summary.csv`).
- **DynAMICS** — dynamic analysis dataset covering the same taxonomy,
  ingested via `scripts/import_dyn_data.py` and documented in
  `docs/DYNAMICS_DATASET.md`.

Facebook Infer and Android Lint are not used as baselines: neither tool
reports on the Android-specific energy smells in our taxonomy, so their
outputs would not be directly comparable. aDoctor and DynAMICS were
selected because they publish per-file Yes/No labels for exactly the
five patterns this project detects.
