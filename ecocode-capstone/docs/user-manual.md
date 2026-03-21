# User manual (EcoCode)

## Run an analysis

1. Open the app (**http://localhost:3000**).
2. Open or create a **Project**.
3. Click **New Run**.
4. Choose **GitHub Repository** (URL) or **Upload Files** (`.java`).
5. Click **Start Analysis**. You are taken to the run detail page when the run is created.

## Background processing

Analysis runs in a **background loop inside the FastAPI app** (`main.py`). You do **not** need a separate worker terminal as long as `uvicorn` is running.

## View results

- On the run page, open each file row to see **DW / HMU / HAS / IOD / NLMR** and LLM reasoning.
- API: `GET /api/runs/{id}/findings` (see [api-documentation.md](api-documentation.md)).

## Troubleshooting

- Runs stuck on **Pending**: ensure the backend is running (`uvicorn` on port **8000**).
- **Failed to start run**: backend down, wrong `REACT_APP_API_BASE_URL`, or **SQLite locked** — close DB Browser / other tools using `ecocode.db`, then restart the backend.
- Empty or wrong LLM output: check `GET /api/health` (`llm_status`), and `backend/.env` (`LLM_PROVIDER`, API keys, or Ollama URL).
