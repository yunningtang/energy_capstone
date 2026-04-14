# DynAMICS Dataset: Usage Guide

The DynAMICS dataset (538 F-Droid apps, behavioural code smells) is from the research:

> **DynAMICS**: Dynamic detection of Android behavioural code smells.

**Dataset source**: https://doi.org/10.6084/m9.figshare.c.6349562.v1  
**APKs + sources**: https://doi.org/10.6084/m9.figshare.c.6349562.v1  
**Tool**: https://github.com/diprestat/DynamicVerification

---

## Dataset structure

| DynAMICS folder | Our DB table | Content |
|-----------------|--------------|---------|
| **DynAMICS Events** | dyn_events | Instrumentation events |
| **Results** | dyn_results | DynAMICS / aDoctor / Paprika detection |
| **Manual Validation** | dyn_validation | Ground truth (Class, Code Smell, Comments) |
| **Dataset Apps** | - | 538 app names |

---

## Setup

1. **Download** the dataset from Figshare (DOI above).
2. **Extract** to a folder, e.g. `C:\DynAMICS_dataset\`.
3. **Download** APKs + sources from the same Figshare link (if needed for evaluation).

---

## Import into database

```powershell
cd .
python scripts/import_dyn_data.py --dyn-root "C:\DynAMICS_dataset" --dynamics
```

Or if the folder names match (Dyn_Events, Dyn_Results, Dyn_Validation):

```powershell
python scripts/import_dyn_data.py --dyn-root "C:\DynAMICS_dataset"
```

---

## Run evaluation (Safwat-style)

1. **Decompile** APKs (or use provided sources):
   ```powershell
   python scripts/decompile_apks.py --apk-dir C:\apks --output-dir C:\dyn_decompiled --limit 10
   ```

2. **Evaluate** and store in DB:
   ```powershell
   python scripts/run_dataset_eval.py --source-dir C:\dyn_decompiled --limit 20
   ```

---

## If CSV format differs

The import script expects:

- **Manual Validation**: `Class, Code Smell ?, Comments` (with optional tool header like "aDoctor,,")
- **DynAMICS Events**: `apk_path, package, java_file, method`
- **Results**: CSV with pattern inferred from filename (DW, HMU, HAS, IOD, NLMR)

If the DynAMICS folder structure or CSV columns differ, share a sample file and we can adapt the parser.
