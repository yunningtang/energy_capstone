# API Documentation

Base URL: `http://localhost:8000`

## Health

- `GET /api/health`

Response:

```json
{
  "api_status": "healthy",
  "db_status": "healthy",
  "ollama_status": { "status": "healthy", "models": ["qwen3-vl:8b"] }
}
```

## Create Task

- `POST /api/tasks`

Request body:

```json
{
  "source_type": "snippet",
  "source_name": "sample.java",
  "source_value": "wakeLock.acquire(); doWork();",
  "smell_types": ["DW", "HMU", "HAS", "IOD", "NLMR"]
}
```

## List Tasks

- `GET /api/tasks`

## Get Task

- `GET /api/tasks/{task_id}`

## Get Result

- `GET /api/results/{task_id}`

## Upload and Analyze

- `POST /api/upload-analyze` (multipart form)
  - `file`: Java/Kotlin file
  - `smell_types`: comma-separated list
