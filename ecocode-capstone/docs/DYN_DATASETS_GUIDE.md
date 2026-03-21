# Dyn_* 数据集使用指南

本指南说明如何将 Dyn_Events、Dyn_Results、Dyn_Validation 集成到当前项目。

## 1. 导入 Dyn_* 数据到数据库（独立表）

### 表结构

- **dyn_events**：从 Dyn_Events/*.csv 导入，记录仪器化事件（apk_path, package, java_file, method）
- **dyn_results**：从 Dyn_Results/*.csv 导入，记录检测/潜在 code smell（pattern, raw_data）
- **dyn_validation**：从 Dyn_Validation/*_Pos.csv、*_Neg.csv 导入，记录 ground truth（class_name, code_smell, comments）

### 导入命令

```powershell
cd ecocode-capstone
python scripts/import_dyn_data.py
```

Dyn_* 文件夹默认位于项目根目录（`capstone_project/` 下的 `Dyn_Events`、`Dyn_Results`、`Dyn_Validation`）。

指定路径：

```powershell
python scripts/import_dyn_data.py --dyn-root "C:/path/to/dyn_datasets"
```

仅导入部分数据集：

```powershell
python scripts/import_dyn_data.py --events      # 仅 Dyn_Events
python scripts/import_dyn_data.py --results    # 仅 Dyn_Results
python scripts/import_dyn_data.py --validation # 仅 Dyn_Validation
```

---

## 2. Few-shot 示例（LLM 增强）

LLM 分析时自动从 `data/test-samples/` 加载 few-shot 示例，结合 `ground_truth.json` 标注。

### 目录结构

```
data/test-samples/
├── ground_truth.json   # 每个文件的 pattern 标注
├── DW_example.java     # DW 正例
├── HAS_example.java    # HAS 正例
└── ...
```

### ground_truth.json 格式

```json
{
  "DW_example.java": { "DW": "Yes", "HMU": "No", "HAS": "No", "IOD": "No", "NLMR": "No" },
  "HAS_example.java": { "DW": "No", "HMU": "No", "HAS": "Yes", "IOD": "No", "NLMR": "No" }
}
```

### 添加新测试样本

1. 在 `data/test-samples/` 下新增 `.java` 文件
2. 在 `ground_truth.json` 中为该文件添加 pattern 标注（Yes/No）

Few-shot 会自动用于 prompt 构建，无需修改代码。

---

## 3. 评估脚本（Precision / Recall / F1）

使用 `data/test-samples/` 中带 ground truth 的样本评估分析 pipeline。

### 运行

```powershell
cd ecocode-capstone
python scripts/evaluate.py
```

### 输出示例

```
Per-pattern metrics:
  DW: P=1.00 R=1.00 F1=1.00 (tp=1 fp=0 fn=0)
  HAS: P=1.00 R=1.00 F1=1.00 (tp=1 fp=0 fn=0)
  ...

Overall: P=0.95 R=0.90 F1=0.92
```

---

## 4. 在当前 Project 中查看 Dyn_* 数据（可选）

目前 Dyn_* 以独立表形式存入数据库，尚未通过前端 API 暴露。如需在 Project 界面中查看：

1. 在 `main.py` 中增加 API，例如：
   - `GET /api/dyn/events?pattern=DW`
   - `GET /api/dyn/validation?pattern=DW`
2. 在前端 Projects / Run Detail 页增加“对比 Dyn 数据集”或“查看验证数据”入口

也可写脚本将 Dyn_Validation 映射为 projects + tasks + results_details，使数据出现在现有 Project 结构中。

---

## 5. 文件索引

| 文件 | 用途 |
|------|------|
| `backend/database.py` | DynEvent, DynResult, DynValidation 模型定义 |
| `scripts/import_dyn_data.py` | 从 CSV 导入 Dyn_* 到 DB |
| `scripts/evaluate.py` | 在 test-samples 上运行评估 |
| `data/test-samples/ground_truth.json` | 测试样本标注 |
| `backend/llm_service.py` | few-shot 加载与 prompt 构建 |
