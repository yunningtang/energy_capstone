import axios from "axios";
import { HealthInfo, ResultDetail, Task } from "../types";

const API = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || "http://localhost:8000",
  timeout: 30000,
});

export async function healthCheck(): Promise<HealthInfo> {
  const { data } = await API.get("/api/health");
  return data;
}

export async function createTaskFromUrl(
  description: string,
  sourceUrl: string
): Promise<Task> {
  const { data } = await API.post("/api/tasks", {
    description,
    source_type: "repo",
    source_url: sourceUrl,
  });
  return data;
}

export async function createTaskUpload(
  description: string,
  files: FileList
): Promise<Task> {
  const form = new FormData();
  form.append("description", description);
  for (let i = 0; i < files.length; i++) {
    form.append("files", files[i]);
  }
  const { data } = await API.post("/api/tasks/upload", form);
  return data;
}

export async function listTasks(status?: string): Promise<Task[]> {
  const params = status && status !== "All" ? { status } : {};
  const { data } = await API.get("/api/tasks", { params });
  return data;
}

export async function getTask(taskId: number): Promise<Task> {
  const { data } = await API.get(`/api/tasks/${taskId}`);
  return data;
}

export async function getResults(taskId: number): Promise<ResultDetail[]> {
  const { data } = await API.get(`/api/tasks/${taskId}/results`);
  return data;
}
