# energy_capstone

Android **energy anti-pattern** analysis capstone: DynAMICS-style dataset (events, results, validation) plus **EcoCode**, a web app that uses an LLM to detect five patterns (**DW, HMU, HAS, IOD, NLMR**) in Java source.

**Repository:** [github.com/yunningtang/energy_capstone](https://github.com/yunningtang/energy_capstone)

---

## What’s in this repo

| Path | Purpose |
|------|---------|
| **`Dyn_Events/`** | DynAMICS instrumentation event CSVs |
| **`Dyn_Results/`** | Detected / potential smell CSVs |
| **`Dyn_Validation/`** | Manual validation (ground truth) |
| **`ecocode-capstone/`** | Full-stack app: FastAPI backend + React frontend + scripts |

Paper reference (DynAMICS): *A Tool-Based Method for the Specification and Dynamic Detection of Android Behavioral Code Smells* (TSE 2024) — PDF in repo root.

---

## Quick demo (local, ~5 minutes)

1. **Clone**

   ```bash
   git clone https://github.com/yunningtang/energy_capstone.git
   cd energy_capstone
   ```

2. **Backend** — see [`ecocode-capstone/README.md`](ecocode-capstone/README.md) for details.

   ```powershell
   cd ecocode-capstone\backend
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt
   copy .env.example .env
   # Edit .env: set GEMINI_API_KEY (or Ollama / OpenAI per provider)
   python -m uvicorn main:app --reload --port 8000
   ```

3. **Frontend** (new terminal)

   ```powershell
   cd ecocode-capstone\frontend
   npm install
   npm run dev
   ```

4. Open **http://localhost:3000** — create a project, **New Run** → upload `.java` files.

> **Tip:** Close **DB Browser for SQLite** (or any tool) while `ecocode.db` is open if the backend hangs on startup — SQLite allows one writer at a time unless WAL is active.

---

## Dataset import & evaluation (optional)

From `ecocode-capstone` root (with venv + `backend` on `PYTHONPATH` or run from repo conventions in docs):

```powershell
python scripts/import_dyn_data.py
python scripts/run_dataset_eval.py --source-dir "C:/path/to/java/sources" --limit 20
```

See [`ecocode-capstone/docs/USAGE_GUIDE.md`](ecocode-capstone/docs/USAGE_GUIDE.md) and [`ecocode-capstone/docs/DYNAMICS_DATASET.md`](ecocode-capstone/docs/DYNAMICS_DATASET.md).

---

## Documentation index

| Doc | Topic |
|-----|--------|
| [ecocode-capstone/README.md](ecocode-capstone/README.md) | App setup, env, ports |
| [ecocode-capstone/docs/README.md](ecocode-capstone/docs/README.md) | All docs listed |
| [ecocode-capstone/backend/docs/DATABASE_GUIDE.md](ecocode-capstone/backend/docs/DATABASE_GUIDE.md) | SQLite / tables |
| [ecocode-capstone/docs/api-documentation.md](ecocode-capstone/docs/api-documentation.md) | REST API |
| [render.yaml](render.yaml) | Example Render.com deploy |

---

## License / course use

Capstone project — use per your institution’s policy.
