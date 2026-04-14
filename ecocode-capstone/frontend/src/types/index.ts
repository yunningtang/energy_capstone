export interface Project {
  id: number;
  name: string;
  repo_url: string | null;
  created_at: string;
  total_runs: number;
  total_files: number;
  total_issues: number;
  last_run_at: string | null;
}

export interface Run {
  id: number;
  project_id: number | null;
  description: string;
  source_type: "repo" | "uploaded";
  source_url: string | null;
  download_folder_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  file_count?: number | null;
  issue_count?: number | null;
}

export interface Finding {
  id: number;
  task_id: number;
  folder_name: string;
  file_name: string;
  file_content: string | null;
  status: string;
  dw: string;
  hmu: string;
  has: string;
  iod: string;
  nlmr: string;
  feedback: Record<string, PatternFeedback | string> | null;
}

/**
 * Per-pattern feedback entry. Older runs may have only `reason` (or a raw
 * string); newer runs include the structured diagnosis/fix card fields.
 */
export interface PatternFeedback {
  reason?: string;
  line_range?: string;
  suggested_fix?: string;
  // Legacy diff fields (kept for back-compat; no longer surfaced by default)
  original_snippet?: string;
  fixed_snippet?: string;
  // Structured finding-card fields (new)
  diagnosis_summary?: string;
  location_hint?: string;
  anchor_line?: number;
  operation?: "insert" | "replace" | "wrap";
  example_code?: string;
  fix_explanation?: string;
  severity?: "minor" | "major" | "critical";
  confidence?: "high" | "medium" | "low";
}

export interface HealthInfo {
  api_status: string;
  db_status: string;
  llm_status: Record<string, unknown>;
}
