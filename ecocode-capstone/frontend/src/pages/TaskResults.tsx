import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getResults, getTask } from "../services/api";
import { ResultDetail, Task } from "../types";

function PatternCell({ value }: { value: string }) {
  if (!value) return <td className="cell-empty">—</td>;
  return (
    <td className={value === "Yes" ? "cell-yes" : "cell-no"}>{value}</td>
  );
}

export default function TaskResults() {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [results, setResults] = useState<ResultDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!taskId) return;
    let active = true;
    const id = Number(taskId);

    const load = async () => {
      try {
        const [t, r] = await Promise.all([getTask(id), getResults(id)]);
        if (active) {
          setTask(t);
          setResults(r);
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [taskId]);

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (!task) return <div className="page"><p>Task not found.</p></div>;

  const fileStatusLabel = (s: string) => {
    if (s === "Done") return <span className="badge done">Done</span>;
    if (s === "Analyzing") return <span className="badge progress">Analyzing</span>;
    return <span className="badge pending">Pending</span>;
  };

  return (
    <div className="page">
      <Link to="/tasks" className="back-link">&larr; Back to Tasks</Link>

      <h2>Task #{task.id}</h2>
      <div className="task-meta">
        <span><strong>Description:</strong> {task.description || "—"}</span>
        <span><strong>Source:</strong> {task.source_type}</span>
        <span><strong>Status:</strong> {task.status}</span>
        <span><strong>Folder:</strong> {task.download_folder_name}</span>
      </div>

      {results.length === 0 ? (
        <p className="hint">
          {task.status === "Pending" || task.status === "In-Progress"
            ? "Waiting for files to be processed..."
            : "No files found for this task."}
        </p>
      ) : (
        <table className="data-table results-table">
          <thead>
            <tr>
              <th>#</th>
              <th>File</th>
              <th>Status</th>
              <th>DW</th>
              <th>HMU</th>
              <th>HAS</th>
              <th>IOD</th>
              <th>NLMR</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, idx) => (
              <tr key={r.id}>
                <td>{idx + 1}</td>
                <td className="file-cell" title={r.file_name}>
                  {r.file_name.split("/").pop()}
                </td>
                <td>{fileStatusLabel(r.status)}</td>
                <PatternCell value={r.dw} />
                <PatternCell value={r.hmu} />
                <PatternCell value={r.has} />
                <PatternCell value={r.iod} />
                <PatternCell value={r.nlmr} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
