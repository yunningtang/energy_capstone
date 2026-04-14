-- PostgreSQL schema bootstrap for Docker Compose only.
-- Local SQLite: use backend/database.py (SQLAlchemy) instead.

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(512) NOT NULL DEFAULT '',
  repo_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  description TEXT NOT NULL DEFAULT '',
  source_type VARCHAR(20) NOT NULL,
  source_url TEXT,
  download_folder_name VARCHAR(512) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS results_details (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  folder_name VARCHAR(512) NOT NULL DEFAULT '',
  file_name VARCHAR(512) NOT NULL,
  file_content TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  dw VARCHAR(10) NOT NULL DEFAULT '',
  hmu VARCHAR(10) NOT NULL DEFAULT '',
  has VARCHAR(10) NOT NULL DEFAULT '',
  iod VARCHAR(10) NOT NULL DEFAULT '',
  nlmr VARCHAR(10) NOT NULL DEFAULT '',
  feedback TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_results_task_id ON results_details(task_id);
