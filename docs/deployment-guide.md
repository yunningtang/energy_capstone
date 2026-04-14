# Deployment Guide

Three supported paths, ordered by ease:

1. [**Render**](#1-render-recommended-for-evaluators) — one-click hosted demo,
   free tier, no credit card. **Use this for evaluators.**
2. [**Docker Compose**](#2-docker-compose-self-host) — Postgres + backend +
   frontend on your own machine / VPS.
3. [**Local dev**](#3-local-dev) — `uvicorn` + `npm start`, see the root
   [README](../README.md).

AWS / GCP / Azure are deliberately not documented — for a capstone-scale demo
they cost too much vs. the free options above. See "Why not AWS?" at the
bottom for the reasoning.

---

## 1 · Render (recommended for evaluators)

Render auto-provisions everything from `render.yaml` at the repo root. End
result: three services on Render's free tier:

| Service              | What it is                          | URL pattern                              |
|----------------------|-------------------------------------|------------------------------------------|
| `ecocode-db`         | PostgreSQL (free; 90-day expiry)    | internal only                            |
| `ecocode-api`        | FastAPI backend                     | `https://ecocode-api.onrender.com`       |
| `ecocode-frontend`   | React static site (CRA build)       | `https://ecocode-frontend.onrender.com`  |

### Steps

1. **Get an LLM API key** (Render doesn't provide one):
   - **Gemini** (recommended — free tier): https://aistudio.google.com/apikey
   - or **OpenAI**: https://platform.openai.com/api-keys

2. **Sign in** to Render: https://dashboard.render.com (use GitHub auth).

3. Top-right **New +** → **Blueprint**.

4. Connect your GitHub account if you haven't, then pick the
   `energy_capstone` repo.

5. Render reads `render.yaml`, shows a preview of the three services + DB.
   Click **Apply**.

6. Wait ~5–8 minutes for the first build (Postgres provisions instantly,
   backend pip install + frontend npm install + build take a few minutes).

7. **Set the LLM API key** (the only manual step):
   - Open `ecocode-api` service → **Environment** tab.
   - Find `GEMINI_API_KEY` (already in the env list, value blank).
   - Click the value, paste your Gemini key, **Save Changes**.
   - Render auto-restarts the service.
   - If you want to use OpenAI instead: also set `OPENAI_API_KEY`, and change
     `LLM_PROVIDER` from `gemini` → `openai`.

8. Open `https://ecocode-frontend.onrender.com` — your hosted demo is live.

### Free-tier caveats

- **Cold starts**: free Render web services sleep after ~15 minutes of
  inactivity. The next request takes 30–60 seconds (one-time wake-up).
  Tell evaluators this so they don't think the app is broken.
- **Postgres expiry**: Render free Postgres is deleted after 90 days. For a
  short evaluation window this is fine; for a longer demo, click **Upgrade**
  on the DB and pay $7/mo.
- **Filesystem is ephemeral**: uploaded source files live on a disk that
  resets on every deploy / restart. The DB persists; only the
  `temp_repos/` working dir is volatile. Findings are stored in Postgres,
  so this only affects re-running an old run after a restart (rare).
- **CRA env vars are baked at build time**: changing
  `REACT_APP_API_BASE_URL` later requires a frontend rebuild (push a commit
  or click **Manual Deploy** on the frontend service).

### Updating the deploy

Just `git push origin main`. Render watches the branch by default and
re-deploys both services automatically. The blueprint (`render.yaml`) is
re-read on every push, so adding env vars or changing build commands also
takes effect on push.

---

## 2 · Docker Compose (self-host)

For when you want to run the whole stack on your own machine or a VPS, with
Postgres in a container.

```powershell
copy .env.example .env
copy backend\.env.example backend\.env
# Edit backend/.env at minimum:
#   LLM_PROVIDER=...    (gemini / openai / ollama)
#   GEMINI_API_KEY=...  (or OPENAI_API_KEY=...)
docker compose up --build
```

Reaches:
- Frontend: `http://localhost:3000`
- Backend:  `http://localhost:8000`
- Postgres: `localhost:5432` (container name `ecocode-postgres`)

`database/init.sql` is **PostgreSQL-only** — used only as the Docker
Postgres init hook. Local SQLite uses SQLAlchemy `init_db()` from
`backend/database.py`.

If you want Ollama from a container, point `OLLAMA_BASE_URL` at
`http://host.docker.internal:11434` in `backend/.env` so the backend
container can reach the host's Ollama.

---

## 3 · Local dev

See [the root README's Quick start](../README.md#quick-start-local-5-minutes).
Skip Docker; run `uvicorn` + `npm start` directly. Best for development.

---

## Configuration reference

Every option is set via `backend/.env` (or, on Render, environment variables
on the service):

| Variable             | Default                  | Purpose                                                    |
|----------------------|--------------------------|------------------------------------------------------------|
| `DATABASE_URL`       | `sqlite:///ecocode.db`   | Switch to `postgresql://...` for Postgres                  |
| `LLM_PROVIDER`       | `openai`                 | `gemini` / `openai` / `ollama`                             |
| `GEMINI_API_KEY`     | _(empty)_                | Required if `LLM_PROVIDER=gemini`                          |
| `GEMINI_MODEL`       | `gemini-2.5-flash`       | Override Gemini model                                      |
| `OPENAI_API_KEY`     | _(empty)_                | Required if `LLM_PROVIDER=openai`                          |
| `OPENAI_MODEL`       | `gpt-4.1-mini`           | Override OpenAI model                                      |
| `OLLAMA_BASE_URL`    | `http://localhost:11434` | Required if `LLM_PROVIDER=ollama`                          |
| `OLLAMA_MODEL`       | `qwen3-vl:8b`            | Override Ollama model                                      |
| `FRONTEND_URL`       | _(empty)_                | Adds the frontend origin to CORS allow-list                |
| `APP_HOST`           | `0.0.0.0`                | Bind address                                               |
| `APP_PORT`           | `8000`                   | Bind port                                                  |

> The frontend Settings page exposes some of these (API keys, endpoints) for
> in-browser convenience, but they are saved to `localStorage` only and do
> NOT reach the backend. The backend always reads its config from `.env` /
> Render env vars. The Settings UI just calls `GET /api/health` to display
> what the backend is using.

---

## Why not AWS?

For a capstone-scale demo, AWS is the wrong tool:

| Concern         | Render free                    | AWS minimum (EC2 + RDS + ALB)         |
|-----------------|--------------------------------|----------------------------------------|
| Cost            | $0                             | ~$30–100/month after Free Tier expires |
| Time to deploy  | 5 min, click Apply             | hours: VPC, IAM, security groups, ALB  |
| Ops surface     | one Blueprint file             | CloudWatch, IAM, secrets manager, …    |
| Postgres        | one-click managed              | RDS provisioning + parameter groups    |
| TLS             | automatic                      | ACM certificate + ALB listener         |

AWS only makes sense if you need:
- multi-region / multi-AZ failover,
- integration with other AWS services (Bedrock for LLM, S3 for code uploads),
- "deployed on AWS" for resume / interview signal — in which case build a
  separate minimal demo (EC2 + Docker), don't migrate this project.
