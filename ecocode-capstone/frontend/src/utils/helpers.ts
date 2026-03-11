import { TaskStatus } from "../types";

export function uiStatus(status: TaskStatus): "Queued" | "In Progress" | "Finished" | "Failed" {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "IN_PROGRESS":
      return "In Progress";
    case "FINISHED":
      return "Finished";
    case "FAILED":
      return "Failed";
    default:
      return "Queued";
  }
}

export function statusColor(status: TaskStatus): string {
  switch (status) {
    case "FINISHED":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "FAILED":
      return "text-red-700 bg-red-50 border-red-200";
    case "IN_PROGRESS":
      return "text-amber-700 bg-amber-50 border-amber-200";
    default:
      return "text-zinc-600 bg-zinc-100 border-zinc-200";
  }
}
