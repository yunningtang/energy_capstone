import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  FolderOpen,
  Plus,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { getProject, getProjectRuns, deleteProject, deleteRun } from "../services/api";
import { Project, Run } from "../types";
import ConfirmDialog from "../components/ConfirmDialog";

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const pid = Number(projectId);
  const [project, setProject] = useState<Project | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [runToDelete, setRunToDelete] = useState<Run | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let active = true;

    const load = async () => {
      try {
        const [p, r] = await Promise.all([
          getProject(pid),
          getProjectRuns(pid),
        ]);
        if (active) {
          setProject(p);
          setRuns(r);
        }
      } catch {}
      finally { if (active) setLoading(false); }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [projectId]);

  async function handleDeleteProject() {
    try {
      await deleteProject(pid);
      navigate("/");
    } catch {}
    setConfirmDeleteProject(false);
  }

  async function handleDeleteRun() {
    if (!runToDelete) return;
    try {
      await deleteRun(runToDelete.id);
      setRuns((prev) => prev.filter((r) => r.id !== runToDelete.id));
    } catch {}
    setRunToDelete(null);
  }

  if (loading)
    return (
      <div className="page"><div className="empty-state">
        <Loader2 size={28} className="spin" /><p>Loading project...</p>
      </div></div>
    );

  if (!project)
    return (
      <div className="page"><div className="empty-state">
        <FolderOpen size={40} strokeWidth={1.2} />
        <p className="empty-title">Project not found</p>
        <Link to="/" className="back-link" style={{ marginTop: "0.5rem" }}>
          <ArrowLeft size={14} /> Back to Projects
        </Link>
      </div></div>
    );

  function statusBadge(status: string) {
    const cls =
      status === "Done" ? "badge done"
      : status === "In-Progress" ? "badge progress"
      : status === "Failed" ? "badge failed"
      : "badge pending";
    return <span className={cls}>{status}</span>;
  }

  return (
    <div className="page">
      <Link to="/" className="back-link">
        <ArrowLeft size={14} /> Back to Projects
      </Link>

      <div className="page-header">
        <h2>{project.name}</h2>
        <div className="header-actions">
          <Link to={`/projects/${project.id}/new-run`} className="btn primary btn-sm">
            <Plus size={14} /> New Run
          </Link>
          <button
            className="btn danger-btn btn-sm"
            onClick={() => setConfirmDeleteProject(true)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {project.repo_url && <p className="page-sub">{project.repo_url}</p>}

      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-number">{project.total_runs}</span>
          <span className="stat-label">Runs</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{project.total_files}</span>
          <span className="stat-label">Files Scanned</span>
        </div>
        <div className="stat-card">
          <span className="stat-number stat-issue-count">{project.total_issues}</span>
          <span className="stat-label">Issues Found</span>
        </div>
      </div>

      <h3 className="section-title">Run History</h3>

      {runs.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No runs yet</p>
          <p className="empty-sub">Start your first analysis run for this project.</p>
          <Link to={`/projects/${project.id}/new-run`} className="btn primary btn-sm" style={{ marginTop: "0.8rem" }}>
            <Plus size={14} /> Start Run
          </Link>
        </div>
      ) : (
        <div className="card table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Description</th>
                <th>Source</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <motion.tr
                  key={r.id}
                  className="clickable-row"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => navigate(`/runs/${r.id}`)}
                >
                  <td className="id-cell">#{r.id}</td>
                  <td>{r.description || "\u2014"}</td>
                  <td className="source-cell">{r.source_type}</td>
                  <td>{statusBadge(r.status)}</td>
                  <td className="date-cell">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="delete-cell">
                    <button
                      className="icon-btn-danger"
                      title="Delete run"
                      onClick={(e) => { e.stopPropagation(); setRunToDelete(r); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                  <td className="arrow-cell"><ChevronRight size={16} /></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteProject}
        title="Delete Project"
        message={`Delete "${project.name}" and all its runs and findings? This cannot be undone.`}
        onConfirm={handleDeleteProject}
        onCancel={() => setConfirmDeleteProject(false)}
      />

      <ConfirmDialog
        open={!!runToDelete}
        title="Delete Run"
        message={`Delete Run #${runToDelete?.id} and all its findings? This cannot be undone.`}
        onConfirm={handleDeleteRun}
        onCancel={() => setRunToDelete(null)}
      />
    </div>
  );
}
