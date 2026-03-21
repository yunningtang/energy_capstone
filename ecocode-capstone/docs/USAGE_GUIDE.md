# EcoCode Usage Guide: Dyn_* Datasets, Database, and Collected Data

## Part 1: Dyn_* Datasets (Dyn_Events, Dyn_Results, Dyn_Validation)

### 1.1 Prepare the Dataset Folders

Place the Dyn_* folders under your project root (same level as `ecocode-capstone/`):

```
capstone_project/
├── ecocode-capstone/
├── Dyn_Events/          <-- CSV files (e.g. DW_acquire.csv, HMU_instantiation.csv)
├── Dyn_Results/         <-- CSV files (detected code smells)
└── Dyn_Validation/      <-- CSV files (e.g. DW_Pos.csv, DW_Neg.csv, ground truth)
```

**Expected CSV formats:**
- **Dyn_Events**: `apk_path, package, java_file, method [, is_true_positive]`
- **Dyn_Results**: varies by file; pattern inferred from filename (DW, HMU, HAS, IOD, NLMR)
- **Dyn_Validation**: `Class, Code Smell ?, Comments` (with optional tool header like "aDoctor,,")

### 1.2 Import Dyn_* Data into Database

From the `ecocode-capstone` directory:

```powershell
cd ecocode-capstone
python scripts/import_dyn_data.py
```

**Options:**

| Option | Description |
|--------|--------------|
| (none) | Import all three datasets |
| `--events` | Import only Dyn_Events |
| `--results` | Import only Dyn_Results |
| `--validation` | Import only Dyn_Validation |
| `--dyn-root "C:/path/to/datasets"` | Custom path to Dyn_* folders |

**Example:**
```powershell
python scripts/import_dyn_data.py --dyn-root "C:/Users/me/Dyn_datasets"
python scripts/import_dyn_data.py --validation   # Only validation data
```

### 1.3 Validate / Evaluate the Pipeline

**Option A: Test-samples evaluation** (uses `data/test-samples/` + `ground_truth.json`)

```powershell
cd ecocode-capstone
python scripts/evaluate.py
```

This runs the LLM analysis on each file in `test-samples/`, compares with `ground_truth.json`, and prints Precision/Recall/F1 per pattern.

**Option B: Evaluate against Dyn_Validation** (batch comparison)

```powershell
python scripts/evaluate_dyn.py --source-dir "C:/path/to/java/source"
```

- Requires: (1) Dyn_Validation imported, (2) Java source code in a folder
- Resolves `class_name` from dyn_validation to `.java` files under `--source-dir`
- Runs LLM on each file, compares with ground truth, reports P/R/F1

Options:
- `--pattern DW` - Only evaluate DW pattern
- `--limit 20` - Max 20 entries per pattern (for quick testing)

---

## Part 2: View the Database

### 2.1 Database Location

```
ecocode-capstone/backend/ecocode.db
```

### 2.2 Method 1: SQLite CLI

```powershell
cd ecocode-capstone/backend
sqlite3 ecocode.db
```

Inside sqlite3:
```sql
.tables
.schema dyn_events
.schema dyn_results
.schema dyn_validation

SELECT COUNT(*) FROM dyn_events;
SELECT * FROM dyn_events LIMIT 5;

SELECT COUNT(*) FROM dyn_validation;
SELECT pattern, class_name, code_smell FROM dyn_validation LIMIT 10;

.quit
```

### 2.3 Method 2: DB Browser for SQLite (GUI)

1. Download: https://sqlitebrowser.org/
2. Open `ecocode-capstone/backend/ecocode.db`
3. Browse tables, run SQL, export to CSV

### 2.4 Method 3: Python Script

```python
import sqlite3
conn = sqlite3.connect("ecocode-capstone/backend/ecocode.db")
cursor = conn.cursor()

# Dyn_* tables
cursor.execute("SELECT * FROM dyn_events LIMIT 5")
print(cursor.fetchall())

cursor.execute("SELECT pattern, source_file, COUNT(*) FROM dyn_validation GROUP BY pattern")
print(cursor.fetchall())

conn.close()
```

---

## Part 3: Use Collected Data

### 3.1 Data from API (projects, tasks, results_details)

- **Projects**: Create via `POST /api/projects` or frontend
- **Runs**: Create via `POST /api/runs` or upload files
- **Findings**: `GET /api/runs/{run_id}/findings` returns per-file detection (dw, hmu, has, iod, nlmr)

### 3.2 Query Dyn_* Data (SQL)

```sql
-- Count events by pattern
SELECT source_file, COUNT(*) FROM dyn_events GROUP BY source_file;

-- Count validation entries by pattern
SELECT pattern, code_smell, COUNT(*) FROM dyn_validation GROUP BY pattern, code_smell;

-- Compare with LLM results (example: join by class_name if you have matching logic)
SELECT v.class_name, v.code_smell, r.dw, r.has
FROM dyn_validation v
LEFT JOIN results_details r ON r.file_name LIKE '%' || v.class_name || '%'
WHERE v.pattern = 'DW';
```

### 3.3 Export Data for Analysis

**From SQLite CLI:**
```sql
.mode csv
.output dyn_validation_export.csv
SELECT * FROM dyn_validation;
.output stdout
```

**From Python:**
```python
import sqlite3
import csv
conn = sqlite3.connect("ecocode.db")
cursor = conn.cursor()
cursor.execute("SELECT * FROM dyn_validation")
rows = cursor.fetchall()
with open("dyn_validation_export.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow([d[0] for d in cursor.description])
    writer.writerows(rows)
conn.close()
```

---

## Environment Fixes (python313.dll, venv, jadx)

| Issue | Fix |
|-------|-----|
| python313.dll | Use `py -3` instead of `python`, or reinstall Python |
| Run decompile | `py -3 scripts/decompile_apks.py --apk-dir C:\apks --output-dir C:\dyn_decompiled --limit 5` |
| Broken venv | `scripts\fix_venv.bat` |
| Check setup | `py -3 scripts/check_env.py` |

---

## Quick Reference

| Task | Command / Action |
|------|------------------|
| Import Dyn_* | `python scripts/import_dyn_data.py` |
| Query Dyn_* summary | `python scripts/query_dyn_data.py` |
| Evaluate test-samples | `python scripts/evaluate.py` |
| Decompile APKs | `py -3 scripts/decompile_apks.py --apk-dir C:\apks --output-dir C:\dyn_decompiled` |
| **Safwat-style eval (decompile + evaluate + DB)** | `py -3 scripts/run_dataset_eval.py --apk-dir C:\apks --output-dir C:\dyn_decompiled --limit 20` |
| Evaluate existing decompiled | `py -3 scripts/run_dataset_eval.py --source-dir C:\dyn_decompiled --limit 20` |
| Query eval results | `py -3 scripts/query_dyn_data.py --eval-runs` |
| Open DB (CLI) | `sqlite3 backend/ecocode.db` |
| View tables | `projects`, `tasks`, `results_details`, `dyn_events`, `dyn_results`, `dyn_validation` |
