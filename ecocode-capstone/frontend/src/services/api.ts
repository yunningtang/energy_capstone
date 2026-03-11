import axios from "axios";
import { AnalysisResult, AnalysisTask, TaskCreatePayload } from "../types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:8000";

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

export async function healthCheck() {
  const { data } = await http.get("/api/health");
  return data;
}

export async function createTask(payload: TaskCreatePayload): Promise<AnalysisTask> {
  const { data } = await http.post("/api/tasks", payload);
  return data;
}

export async function listTasks(): Promise<AnalysisTask[]> {
  const { data } = await http.get("/api/tasks");
  return data;
}

export async function getTask(taskId: string): Promise<AnalysisTask> {
  const { data } = await http.get(`/api/tasks/${taskId}`);
  return data;
}

export async function getResult(taskId: string): Promise<AnalysisResult> {
  const { data } = await http.get(`/api/results/${taskId}`);
  return data;
}
