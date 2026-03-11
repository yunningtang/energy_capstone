CREATE TABLE IF NOT EXISTS analysis_tasks (
  id VARCHAR(64) PRIMARY KEY,
  source_type VARCHAR(16) NOT NULL DEFAULT 'url',
  source_name VARCHAR(512) NOT NULL,
  source_value TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
  progress INTEGER NOT NULL DEFAULT 0,
  selected_smells JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP NULL,
  error_message TEXT NULL
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(64) UNIQUE NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_suggestions TEXT NULL,
  processing_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_created
  ON analysis_tasks(status, created_at DESC);
