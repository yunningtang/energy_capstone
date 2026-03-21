# EcoCode (capstone app)

Local-first web app: **FastAPI** backend + **React** UI. Analyzes uploaded or cloned Java for Android energy smells **DW, HMU, HAS, IOD, NLMR** using **Ollama**, **Google Gemini**, or **OpenAI**.

The API runs a **background worker inside `main.py`** (no separate `worker.py` process).

---

## Prerequisites

- Python **3.11+** (3.12 OK)
- Node **18+**
- An LLM: **Gemini API key** (recommended) or **Ollama** locally, or **OpenAI**

---

## 1. Environment

From this folder (`ecocode-capstone`):

```powershell
copy backend\.env.example backend\.env
```

Edit `backend/.env`:

| Variable | When |
|----------|------|
| `DATABASE_URL=sqlite:///ecocode.db` | Default local (no Postgres) |
| `LLM_PROVIDER=gemini` + `GEMINI_API_KEY` | Google AI Studio |
| `LLM_PROVIDER=ollama` | Local Ollama; set `OLLAMA_BASE_URL` / `OLLAMA_MODEL` |
| `LLM_PROVIDER=openai` + `OPENAI_API_KEY` | OpenAI |

Optional: `FRONTEND_URL` if the UI is not on `http://localhost:3000` (CORS).

---

## 2. Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

- API: **http://localhost:8000**
- Swagger: **http://localhost:8000/docs**

Database file: `backend/ecocode.db` (created on first run).

---

## 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**.

To point at another API host:

```powershell
$env:REACT_APP_API_BASE_URL="http://localhost:8000"; npm run dev
```

---

## 4. Docker (optional)

PostgreSQL + backend + frontend:

```powershell
copy .env.example .env
# edit .env; ensure backend\.env exists for secrets
docker compose up --build
```

`database/init.sql` is **PostgreSQL-only** (used by Docker init). Local SQLite uses SQLAlchemy `init_db()` instead.

---

## 5. Scripts (from `ecocode-capstone` root)

| Script | Purpose |
|--------|---------|
| `scripts/import_dyn_data.py` | Import `Dyn_*` CSVs into DB |
| `scripts/run_dataset_eval.py` | Eval vs `dyn_validation` |
| `scripts/evaluate_dyn.py` | LLM eval CLI |
| `scripts/decompile_apks.py` | APK → Java (needs **jadx**) |
| `scripts/migrate.py` | Run `init_db()` / bootstrap |
| `scripts/check_env.py` | Quick env check |

Dyn folders are expected at repo root: `../Dyn_Events`, `../Dyn_Results`, `../Dyn_Validation` (or pass `--dyn-root`).

---

## Project layout

```
ecocode-capstone/
  backend/          # FastAPI, SQLAlchemy, LLM
  frontend/         # React + TypeScript
  database/         # PostgreSQL bootstrap SQL (Docker)
  docs/             # Guides
  scripts/          # CLI tools
  data/             # test-samples, few-shot (gitignored if large — see .gitignore)
```

More: [docs/README.md](docs/README.md).
