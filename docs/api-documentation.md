# API Documentation

Base URL: `http://localhost:8000` (default, override via `REACT_APP_API_BASE_URL` or
the Settings page in the frontend).

Interactive Swagger UI: **http://localhost:8000/docs**.
ReDoc: **http://localhost:8000/redoc**.

All requests/responses are JSON unless noted (uploads are `multipart/form-data`).

---

## Health

### `GET /api/health`

Returns API + DB + LLM connectivity in one round-trip. Used by the frontend
hero banner and the Settings page.

```json
{
  "api_status": "healthy",
  "db_status": "healthy",
  "llm_status": {
    "provider": "gemini",
    "ok": true,
    "model": "gemini-2.5-flash"
  }
}
```

`llm_status.ok` is `false` when no provider is configured or the provider
returns an error.

---

## Projects

### `POST /api/projects`

Create a project (a logical grouping of runs).

Request:
```json
{ "name": "MyApp", "repo_url": "https://github.com/owner/repo" }
```

Response (`ProjectResponse`):
```json
{
  "id": 1,
  "name": "MyApp",
  "repo_url": "https://github.com/owner/repo",
  "created_at": "2026-04-14T10:23:11Z",
  "total_runs": 0,
  "total_files": 0,
  "total_issues": 0,
  "last_run_at": null
}
```

### `GET /api/projects`

List all projects, including roll-up stats (`total_runs`, `total_files`,
`total_issues`, `last_run_at` derived across runs).

### `GET /api/projects/{project_id}`

Single project, same shape.

### `PATCH /api/projects/{project_id}`

Rename or update repo URL.

Request:
```json
{ "name": "NewName", "repo_url": "https://github.com/...new..." }
```

Both fields optional. Returns the updated `ProjectResponse`.

### `DELETE /api/projects/{project_id}`

Cascades — deletes the project, all its runs, and the run findings.

### `GET /api/projects/{project_id}/runs`

Returns a list of `RunResponse` for the project, newest first.

### `GET /api/projects/{project_id}/pattern-stats`

Aggregated counts per pattern across all the project's runs:

```json
{
  "DW":   { "yes": 12, "no": 142, "na": 8, "pending": 0 },
  "HMU":  { "yes": 5,  "no": 149, "na": 8, "pending": 0 },
  "HAS":  { "yes": 0,  "no": 154, "na": 8, "pending": 0 },
  "IOD":  { "yes": 2,  "no": 152, "na": 8, "pending": 0 },
  "NLMR": { "yes": 9,  "no": 145, "na": 8, "pending": 0 }
}
```

---

## Runs

A *run* is a single analysis invocation against a set of Java files (uploaded
or cloned from a repo). Each run produces N `Findings` — one per file.

### `POST /api/runs`

Create a run from a public repo URL. The backend clones via
`subprocess.run(["git", "clone", "--depth", "1", url, ...])`; the `git` CLI must
be on PATH.

Request:
```json
{
  "project_id": 1,
  "description": "Initial scan",
  "source_type": "repo",
  "source_url": "https://github.com/owner/repo"
}
```

Response (`RunResponse`):
```json
{
  "id": 7,
  "project_id": 1,
  "description": "Initial scan",
  "source_type": "repo",
  "source_url": "https://github.com/owner/repo",
  "download_folder_name": "Task_7_Downloaded_Files",
  "status": "Pending",
  "created_at": "2026-04-14T10:24:00Z",
  "updated_at": "2026-04-14T10:24:00Z",
  "file_count": null,
  "issue_count": null
}
```

### `POST /api/runs/upload`

Create a run by uploading files. `multipart/form-data`:

| Field         | Type        | Notes                                                                  |
|---------------|-------------|------------------------------------------------------------------------|
| `project_id`  | int (form)  | Required                                                               |
| `description` | str (form)  | Optional                                                               |
| `files`       | file (multi)| One or more `.java` files **or** `.zip` archives                       |

`.zip` archives are extracted server-side; only `.java` entries inside are kept.
Path-traversal entries (`../...`) are skipped.

`HTTP 400` if the upload contains zero `.java` files (after zip expansion).

### `GET /api/runs/{run_id}`

Single `RunResponse`, including `file_count` (total files for this run) and
`issue_count` (total `Yes` verdicts across all files × patterns).

### `DELETE /api/runs/{run_id}`

Deletes the run + all findings + the on-disk download folder.

### `GET /api/runs/{run_id}/findings`

Returns one `FindingResponse` per file in the run.

```json
[
  {
    "id": 73,
    "task_id": 7,
    "folder_name": "Task_7_Downloaded_Files",
    "file_name": "_repo/app/src/main/java/com/example/MainActivity.java",
    "file_content": "package com.example...",
    "status": "Done",
    "dw":   "No",
    "hmu":  "No",
    "has":  "No",
    "iod":  "No",
    "nlmr": "Yes",
    "feedback": {
      "NLMR": {
        "answer": "Yes",
        "reason": "Service does not override onTrimMemory(). When the system is low on memory ...",
        "diagnosis_summary": "Service does not implement onTrimMemory()",
        "severity": "minor",
        "confidence": "high",
        "line_range": "15",
        "anchor_line": 16,
        "operation": "insert",
        "location_hint": "Add inside MainActivity (line 15), after onCreate at line 22",
        "suggested_fix": "Override onTrimMemory() to release caches under memory pressure",
        "example_code": "@Override\npublic void onTrimMemory(int level) {\n    super.onTrimMemory(level);\n    if (level >= TRIM_MEMORY_RUNNING_LOW) {\n        releaseCaches();\n    }\n}",
        "fix_explanation": "Releases non-critical caches when system memory is low, helping the service survive longer."
      }
    }
  }
]
```

#### Verdict values

| Value     | Meaning                                                              |
|-----------|----------------------------------------------------------------------|
| `Yes`     | Pattern present (= bug)                                              |
| `No`      | Pattern absent (= clean)                                             |
| `NA`      | Not applicable to this file (e.g. NLMR on a non-Activity/Service), or analysis errored — check `feedback.{pattern}.error` |
| `""`      | Pending — file hasn't finished analysis yet                          |

#### `feedback` shape

`feedback` is a `pattern → object` map, where the object can include:

| Field                | Type                                      | Notes                                                  |
|----------------------|-------------------------------------------|--------------------------------------------------------|
| `answer`             | `"Yes" \| "No"`                            | Same as the column verdict                            |
| `reason`             | string                                    | Diagnosis text                                         |
| `diagnosis_summary`  | string                                    | One-sentence headline                                  |
| `severity`           | `"minor" \| "major" \| "critical"`         | Maps to the badge color                                |
| `confidence`         | `"high" \| "medium" \| "low"`              | Model self-reported                                    |
| `line_range`         | string (`"42"` or `"42-47"`)              | Issue location                                         |
| `anchor_line`        | int                                       | Where the fix should be placed                         |
| `operation`          | `"insert" \| "replace" \| "wrap"`          | Fix kind                                               |
| `location_hint`      | string                                    | Human-readable location ("inside doDraw at line 18")   |
| `suggested_fix`      | string                                    | One-sentence fix description                           |
| `example_code`       | string                                    | Complete copy-pasteable Java fragment                  |
| `fix_explanation`    | string                                    | What `example_code` does                               |
| `original_snippet`   | string (legacy)                           | Verbatim source the issue refers to                    |
| `fixed_snippet`      | string (legacy)                           | Same block rewritten                                   |
| `error`              | bool                                      | True when the analyzer failed for this pattern         |
| `source`             | `"prefilter" \| "missing" \| "llm_error"`  | Why the verdict ended up as `NA`                       |

Older runs (before the rich-feedback migration) may only have `reason`,
`line_range`, `suggested_fix` populated. The frontend handles both shapes.

### `POST /api/runs/{run_id}/cancel`

Marks the run cancelled. The background worker checks the cancel flag between
files (not mid-LLM-call), so already-running file analyses complete first.

### `POST /api/runs/{run_id}/retry`

Resets every non-`Done` file in the run back to `Pending` and flips the task
status to `Pending`. The background worker picks it up on the next poll
(within 2s) and re-runs analysis.

---

## Legacy `tasks` endpoints

These predate the project/run rename. They're still wired for backward compat
but new code should use `/api/runs/*` instead.

| Method | Path                          | Equivalent                          |
|--------|-------------------------------|-------------------------------------|
| POST   | `/api/tasks`                  | `POST /api/runs`                    |
| POST   | `/api/tasks/upload`           | `POST /api/runs/upload`             |
| GET    | `/api/tasks`                  | (cross-project run list)             |
| GET    | `/api/tasks/{id}`             | `GET /api/runs/{id}`                 |
| GET    | `/api/tasks/{id}/results`     | `GET /api/runs/{id}/findings`        |

---

## Status reference

### Run / Task status (`RunResponse.status`)

| Value         | Meaning                                                        |
|---------------|----------------------------------------------------------------|
| `Pending`     | Created, waiting for the worker to pick it up (≤ 2s)           |
| `In-Progress` | Worker is processing files                                     |
| `Done`        | All files analyzed successfully                                |
| `Partial`     | Some files succeeded, some failed                              |
| `Failed`      | All files failed (e.g. clone error)                            |
| `Cancelled`   | User cancelled mid-flight                                      |

### Per-file status (`FindingResponse.status`)

| Value       | Meaning                                                    |
|-------------|------------------------------------------------------------|
| `Pending`   | File saved, not yet picked up                              |
| `Analyzing` | LLM call in progress                                       |
| `Done`      | Verdicts written (per-pattern errors live in `feedback`)   |
| `Failed`    | File-level error (e.g. couldn't read source)               |

---

## Errors

The backend uses standard `HTTPException`. Notable:

| Status | When                                                         |
|--------|--------------------------------------------------------------|
| 400    | Upload contains no `.java` files (after zip expansion)        |
| 404    | Project / run / finding not found                             |
| 500    | Unhandled — check `uvicorn` console + `error_message` on the run |

LLM-level errors don't bubble up as 500s. They're caught and recorded in the
finding's `feedback.{pattern}.error = true` so the UI can surface them per-pattern
without failing the whole run.
