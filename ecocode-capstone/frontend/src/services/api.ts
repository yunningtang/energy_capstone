import axios from "axios";
import { Finding, HealthInfo, Project, Run } from "../types";

function getBaseUrl(): string {
  return (
    localStorage.getItem("api_base_url") ||
    process.env.REACT_APP_API_BASE_URL ||
    "http://localhost:8000"
  );
}

const API = axios.create({ timeout: 30000 });

// Dynamically set baseURL on each request so Settings changes take effect
API.interceptors.request.use((config) => {
  config.baseURL = getBaseUrl();
  return config;
});

export async function healthCheck(): Promise<HealthInfo> {
  const { data } = await API.get("/api/health");
  return data;
}

// ── Projects ──────────────────────────────────────────────

export async function createProject(
  name: string,
  repoUrl?: string
): Promise<Project> {
  const { data } = await API.post("/api/projects", {
    name,
    repo_url: repoUrl || null,
  });
  return data;
}

export async function listProjects(): Promise<Project[]> {
  const { data } = await API.get("/api/projects");
  return data;
}

export async function getProject(projectId: number): Promise<Project> {
  const { data } = await API.get(`/api/projects/${projectId}`);
  return data;
}

export async function getProjectRuns(projectId: number): Promise<Run[]> {
  const { data } = await API.get(`/api/projects/${projectId}/runs`);
  return data;
}

export async function deleteProject(projectId: number): Promise<void> {
  await API.delete(`/api/projects/${projectId}`);
}

export async function getPatternStats(
  projectId: number
): Promise<Record<string, number>> {
  const { data } = await API.get(`/api/projects/${projectId}/pattern-stats`);
  return data;
}

// ── Runs ──────────────────────────────────────────────────

export async function createRunFromUrl(
  projectId: number,
  description: string,
  sourceUrl: string
): Promise<Run> {
  const { data } = await API.post("/api/runs", {
    project_id: projectId,
    description,
    source_type: "repo",
    source_url: sourceUrl,
  });
  return data;
}

export async function createRunUpload(
  projectId: number,
  description: string,
  files: FileList
): Promise<Run> {
  const form = new FormData();
  form.append("project_id", String(projectId));
  form.append("description", description);
  for (let i = 0; i < files.length; i++) {
    form.append("files", files[i]);
  }
  const { data } = await API.post("/api/runs/upload", form);
  return data;
}

export async function deleteRun(runId: number): Promise<void> {
  await API.delete(`/api/runs/${runId}`);
}

export async function getRun(runId: number): Promise<Run> {
  const { data } = await API.get(`/api/runs/${runId}`);
  return data;
}

export async function getFindings(runId: number): Promise<Finding[]> {
  const { data } = await API.get(`/api/runs/${runId}/findings`);
  return data;
}

export async function cancelRun(runId: number): Promise<void> {
  await API.post(`/api/runs/${runId}/cancel`);
}

export async function retryRun(runId: number): Promise<void> {
  await API.post(`/api/runs/${runId}/retry`);
}
