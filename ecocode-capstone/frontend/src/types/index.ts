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
  feedback: Record<string, string> | null;
}

export interface HealthInfo {
  api_status: string;
  db_status: string;
  llm_status: Record<string, unknown>;
}
