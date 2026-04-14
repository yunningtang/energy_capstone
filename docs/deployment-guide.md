# Deployment Guide

## Local Docker Compose

1. Copy env files:

```powershell
copy .env.example .env
copy backend\.env.example backend\.env
```

2. Edit `backend/.env` for DB and Ollama URL if needed.

3. Start services:

```powershell
docker compose up --build
```

4. Access:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

## Notes

- Ollama should run on host (`http://localhost:11434`) for local setup.
- In containers, use `http://host.docker.internal:11434` in `backend/.env` if needed.
