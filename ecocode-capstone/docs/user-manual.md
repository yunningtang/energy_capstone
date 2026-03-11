# User Manual

## Submit Analysis

1. Open frontend page.
2. Select input type: File, URL, or Snippet.
3. Click **Analyze Code**.

## Monitor Requests

- Use **My Requests** panel for queue and progress state.
- Select any task to view details.

## View Results

- For finished tasks, result panel shows:
  - smell findings by type
  - confidence and severity
  - suggestions and optional refactored snippets
  - final LLM recommendation summary

## Troubleshooting

- If all tasks remain queued, confirm worker process is running.
- If results are empty, check backend logs and Ollama health.
