export type SourceType = "url" | "file" | "snippet";
export type TaskStatus = "QUEUED" | "IN_PROGRESS" | "FINISHED" | "FAILED";

export interface AnalysisTask {
  id: string;
  source_type: SourceType;
  source_name: string;
  status: TaskStatus;
  progress: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface Finding {
  smell_type: string;
  has_smell: boolean;
  confidence: number;
  severity: "critical" | "major" | "minor";
  explanation: string;
  suggestion?: string | null;
  location?: Record<string, unknown>;
  refactored_code?: string | null;
}

export interface AnalysisResult {
  task_id: string;
  summary: {
    total_findings: number;
    smell_hits: number;
    critical_count: number;
    major_count: number;
    minor_count: number;
  };
  findings: Finding[];
  llm_suggestions: string | null;
  processing_time_ms: number;
}

export interface TaskCreatePayload {
  source_type: SourceType;
  source_name: string;
  source_value: string;
  smell_types: string[];
}
