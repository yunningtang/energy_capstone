# Database bootstrap

- **`init.sql`** — **PostgreSQL only.** Used when Postgres starts via **Docker Compose** (`docker-compose.yml` mounts this file into `/docker-entrypoint-initdb.d/`).
- **Local development** with `DATABASE_URL=sqlite:///ecocode.db` does **not** use this file; tables are created by SQLAlchemy `init_db()` in `backend/database.py`.

For table descriptions and viewing `ecocode.db`, see [backend/docs/DATABASE_GUIDE.md](../backend/docs/DATABASE_GUIDE.md).
