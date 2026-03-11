# Energy Capstone

EcoCode is a local-first MVP for Android energy smell analysis using:

- FastAPI backend + background worker
- PostgreSQL task/result storage
- Ollama for LLM-based smell reasoning
- React + TypeScript frontend UI

## Quick start (Windows)

1. Copy env template:

```powershell
copy .env.example .env
copy backend\.env.example backend\.env
```

2. Start PostgreSQL:

```powershell
docker compose up -d postgres
```

3. Backend setup:

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

4. Worker (new terminal):

```powershell
cd backend
venv\Scripts\activate
python worker.py
```

5. Frontend (new terminal):

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Project layout

- `backend/`: API, worker, data models, and Ollama integration
- `frontend/`: React TypeScript UI
- `database/`: SQL bootstrap scripts
- `data/`: datasets, few-shot examples, and test samples
- `docs/`: architecture/API/deployment/user docs
- `scripts/`: setup and validation scripts
