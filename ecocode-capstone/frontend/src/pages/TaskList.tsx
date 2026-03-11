import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTasks } from "../services/api";
import { Task } from "../types";

const STATUS_OPTIONS = ["All", "Pending", "In-Progress", "Done", "Failed"];

export default function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await listTasks(filter);
        if (active) setTasks(data);
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [filter]);

  function statusBadge(status: string) {
    const cls =
      status === "Done"
        ? "badge done"
        : status === "In-Progress"
        ? "badge progress"
        : status === "Failed"
        ? "badge failed"
        : "badge pending";
    return <span className={cls}>{status}</span>;
  }

  return (
    <div className="page">
      <h2>Tasks</h2>

      <div className="filter-row">
        <label>Filter by status: </label>
        <select
          className="input select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="hint">No tasks found.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Description</th>
              <th>Source</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>{t.description || "—"}</td>
                <td>{t.source_type}</td>
                <td>{statusBadge(t.status)}</td>
                <td>{new Date(t.created_at).toLocaleString()}</td>
                <td>
                  <Link className="link" to={`/tasks/${t.id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
