# User Manual

A walkthrough of EcoCode from a user's perspective. Assumes the backend and
frontend are already running — see [the app README](../README.md) for setup.

---

## 0 · First visit — orientation

When you open **http://localhost:3000** the **Dashboard** loads with:

- A **hero banner** showing a 4-step Getting Started checklist; step 1 turns green
  once the backend has a working LLM provider.
- A row of **stat tiles** (total runs, files, issues, last analysis) — these show
  zeros until you've analyzed something.
- A **Recent runs** strip (also empty at first).
- A **Projects** section with a "**+ New project**" button.

Top nav: **Projects** · **Guide** · **Settings** · theme toggle (☀ / 🌙).

If you dismiss the hero banner you can bring it back any time via
"**Show getting started**" in the dashboard subhead.

---

## 1 · Configure an LLM provider (one-time)

EcoCode's analysis is done by an external LLM. The backend reads its provider
config from `backend/.env`:

```bash
LLM_PROVIDER=gemini          # or "openai" or "ollama"
GEMINI_API_KEY=AIza...       # Google AI Studio key (free tier OK)
```

Other options:

| Provider | Env vars |
|----------|----------|
| Gemini   | `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=...`, `GEMINI_MODEL=gemini-2.5-flash` |
| OpenAI   | `LLM_PROVIDER=openai`, `OPENAI_API_KEY=sk-...`, `OPENAI_MODEL=gpt-4.1-mini` |
| Ollama   | `LLM_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://localhost:11434`, `OLLAMA_MODEL=qwen2.5:7b` |

Restart `uvicorn` after editing `.env`. Refresh the dashboard — step 1 of the hero
banner should turn green ("LLM provider connected") and the **Settings** page
shows an **Active: gemini** chip.

> The text fields on Settings (API keys, endpoints, etc.) are saved to your browser
> only — they don't reach the backend. The "Active" chip reflects whatever the
> backend chose from `.env`. This is on purpose: the browser shouldn't be the
> source of truth for server-side credentials.

---

## 2 · Create a project

Projects group related runs. Use one per app you analyze repeatedly.

1. Dashboard → **+ New project**
2. Name it (e.g. *"AwesomeApp"*). Optionally paste the GitHub URL — that auto-fills
   later when you start a run.
3. Click **Create**. You land on the project page.

The project page lists past runs (empty at first), with status filters
(`All` / `Running` / `Done` / `Failed`).

---

## 3 · Start a run

From the project page click **+ New Run**.

Two source options:

### Option A — GitHub repository
1. Switch to **GitHub Repository** tab.
2. Paste a public GitHub / GitLab / Bitbucket URL.
3. Click **Start Analysis**.

The backend runs `git clone --depth 1` against that URL. Private repos aren't
supported (no auth flow). Cloning takes a few seconds for a typical Android repo.

### Option B — Upload files
1. Switch to **Upload Files** tab.
2. Drag-and-drop **`.java` files** *or* a **`.zip`** archive into the drop zone
   (or click to browse).
3. Click **Start Analysis**.

Zips are extracted server-side; only `.java` entries inside are kept. If the zip
contains zero `.java` files the run rejects with an error.

After **Start Analysis** you're redirected to the **Run Detail** page.

---

## 4 · Watch the run

While `status = Pending` or `In-Progress`, the run page shows a **progress strip**:

- A `Loader2` spinner + counter (`Analyzing 3 of 21 files · 14%`)
- Estimated time remaining (a window: `~1–2 min remaining`)
- The currently-analyzing filename

The page polls the backend every 3 seconds — you don't need to refresh.

When all files are processed the run settles into one of:

- **Done** — all files analyzed without error
- **Partial** — some files succeeded, some failed (rare — usually flaky LLM)
- **Failed** — clone failed or all files failed
- **Cancelled** — you clicked Cancel

---

## 5 · Read the results

Two views, switched by the segmented control on the right.

### Table view (default)

Matrix where rows = files, columns = the 5 patterns. Each cell shows:
- A **dot + verdict** (`● Yes`, `Check No`, `– N/A`, `·` pending) coloured by severity
- The **Issues** column rolls up: `Clean` / `1 minor` / `3 major`

Tools:
- **Issues only** checkbox → hides clean files
- **Expand all** → expands every row at once to see diagnoses inline
- Click any row to expand it inline (severity badges + diagnosis + suggested fix per issue)

### Code view

Three regions:

- **Files panel (left)** — collapsible to a 40px rail. Click a file to switch
  context. Filenames with issues show a small count chip; clean files show a
  green check.
- **Code panel (centre)** — the source file with line numbers, GitHub-style syntax
  highlighting, and **gutter dots** on issue lines (severity-colored circles next
  to the line number). Hover or click a dot to flash that line.
- **Inline finding cards** — Copilot-style cards rendered directly under the
  affected line. Collapsed by default to a single row pill (pattern · severity ·
  line number). Click to expand:
  - **Diagnosis** — why the LLM flagged this
  - **Location hint** — where the fix should go (cites class / method / line)
  - **Suggested change** — a mini unified diff (red `-` + green `+`) with syntax
    highlighting; **Copy** button copies the fix
  - **Learn more** → jumps to the rule reference on the Guide page

A small **Issues navigator bar** above the code lets you jump to any issue chip
(`● NLMR L15`) — clicking scrolls + flashes the line + opens its card.

The code view follows the app theme: **light** = GitHub Primer light (`#ffffff`
canvas, dark text); **dark** = GitHub Primer dark (`#0d1117`, `#e6edf3`).

---

## 6 · Export results

Top-right of the run page, **Export** dropdown:

| Format    | What you get                                                                 |
|-----------|------------------------------------------------------------------------------|
| **CSV**   | One row per `(file × pattern)` with verdict, severity, confidence, line, fix description |
| **JSON**  | Full run object: includes the entire `feedback` map per finding              |
| **Markdown** | Per-file headings + `### PATTERN` blocks with diagnosis + suggested fix code blocks |

The Markdown export is the most human-readable — good for posting in PRs or
issues.

---

## 7 · Cancel & Retry

While a run is `In-Progress`:
- **Cancel** (header button) — sets the cancel flag; the worker stops between
  files (in-flight LLM calls finish, then no more files are picked up).

While a run is `Cancelled` and has unfinished files:
- **Retry** (header button) — resets the unfinished files back to `Pending`
  and re-queues the task. New analysis starts within ~2 seconds.

---

## 8 · Browsing rule definitions

**Guide** in the top nav opens the rule reference + Getting Started. Each rule
card shows:
- Severity badge
- One-line summary
- "Why it drains battery" explanation
- Side-by-side **Anti-pattern** (red tint) vs **Fix** (green tint) code samples
- References to the academic source

Use the in-page TOC to jump between rules. Inline finding cards in Code view
have **Learn more →** links that anchor straight to that rule's section.

---

## 9 · Reset / clean up

- **Delete a run** — trash icon in the run page header. Cascades to remove
  findings + the on-disk download folder.
- **Delete a project** — trash icon on the project list (hover-reveal). Cascades
  to remove all its runs + findings.
- **Reset the entire frontend state** (theme, dismissed banners, stored API
  keys) — open `reset.html` in the repo root.
- **Reset the database** — close the backend and delete `backend/ecocode.db`.
  Restart `uvicorn`; the schema is auto-recreated.

---

## Troubleshooting

| Symptom                                                     | Fix                                                                                            |
|-------------------------------------------------------------|------------------------------------------------------------------------------------------------|
| Run stuck on **Pending**                                    | Backend isn't running. `uvicorn` should be on port 8000. Check `GET /api/health`.              |
| Run goes straight to **Failed**                             | Repo URL invalid or `git` CLI not on PATH. Check the run's `error_message` (Swagger / DB).      |
| Verdicts look wrong (everything `No`)                       | LLM returned a malformed batch response — switch provider or model and **Retry** the run.       |
| **"No LLM provider connected"** banner                      | `LLM_PROVIDER` + matching API key not set in `backend/.env`. Restart `uvicorn` after editing.  |
| `database is locked` on backend startup                     | Close DB Browser for SQLite (or any tool with `ecocode.db` open).                              |
| Frontend can't reach backend                                | Wrong base URL. Check **Settings → Backend → Test connection**, or set `REACT_APP_API_BASE_URL`.|
| Frontend stuck on a stale view                              | Open `reset.html` in the repo root → clears localStorage → reload.                              |
| Zip upload errors with "no `.java` files"                   | Zip is empty or contains only non-Java sources. We only analyze Java.                          |
