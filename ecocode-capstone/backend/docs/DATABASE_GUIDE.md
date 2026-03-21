# Database guide

## Location

Default SQLite file (when `DATABASE_URL=sqlite:///ecocode.db`):

`ecocode-capstone/backend/ecocode.db`

## Viewing the database

- **DB Browser for SQLite** — open `ecocode.db`. **Close it** before starting the backend if you see `database is locked` on startup.
- **API:** `GET /api/health` (checks DB), `GET /api/docs` for REST.
- **Python:** `sqlite3.connect("ecocode.db")` from the `backend` directory.

## Main tables (current app)

| Table | Purpose |
|-------|---------|
| `projects` | Analysis projects |
| `tasks` | Runs (upload / repo) |
| `results_details` | Per-file DW/HMU/HAS/IOD/NLMR + feedback |
| `dyn_events`, `dyn_results`, `dyn_validation` | Imported DynAMICS CSVs |
| `eval_runs`, `eval_results` | Dataset evaluation runs |

Legacy tables `analysis_tasks` / `analysis_results` (if present) are **not** used by the current FastAPI code.

## SQL snippets

```sql
.tables
SELECT id, status, source_type FROM tasks ORDER BY id DESC LIMIT 10;
SELECT task_id, file_name, status FROM results_details LIMIT 20;
```
