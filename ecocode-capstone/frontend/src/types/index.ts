export interface Task {
  id: number;
  description: string;
  source_type: "repo" | "uploaded";
  source_url: string | null;
  download_folder_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ResultDetail {
  id: number;
  task_id: number;
  folder_name: string;
  file_name: string;
  status: string;
  dw: string;
  hmu: string;
  has: string;
  iod: string;
  nlmr: string;
}

export interface HealthInfo {
  api_status: string;
  db_status: string;
  llm_status: Record<string, unknown>;
}
