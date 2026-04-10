import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, ChevronRight, Trash2, WifiOff, MoreHorizontal } from "lucide-react";
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
  const [error, setError] = useState("");
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [runToDelete, setRunToDelete] = useState<Run | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const load = async () => {
      try {
        const [p, r] = await Promise.all([getProject(pid), getProjectRuns(pid)]);
        if (active) { setProject(p); setRuns(r); setError(""); }
      } catch (e: any) {
        if (active) setError(e?.message || "Failed to load project");
      } finally { if (active) setLoading(false); }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [projectId]);

  async function handleDeleteProject() {
    try { await deleteProject(pid); navigate("/"); } catch {}
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
      <div className="page">
        <div className="skeleton skeleton-text short" style={{ marginBottom: 16 }} />
        <div className="skeleton skeleton-heading" />
        <div className="skeleton-stats-row">
          {[1,2,3].map(i => <div key={i} className="skeleton skeleton-stat" />)}
        </div>
        <div className="skeleton-table">
          {[1,2,3].map(i => <div key={i} className="skeleton skeleton-row" />)}
        </div>
      </div>
    );

  if (error || !project)
    return (
      <div className="page"><div className="empty-state">
        <WifiOff size={40} strokeWidth={1.2} />
        <p className="empty-title">{error || "Project not found"}</p>
        <p className="empty-sub">Check that the backend is running and try again.</p>
        <Link to="/" className="back-link"><ArrowLeft size={14} /><span>Projects</span></Link>
      </div></div>
    );

  function statusBadge(status: string) {
    const cls = status === "Done" ? "done" : status === "In-Progress" ? "progress" : status === "Failed" ? "failed" : "pending";
    return <span className={`badge ${cls}`}>{status}</span>;
  }

  const hasRuns = runs.length > 0;

  return (
    <div className="page">
      {/* Breadcrumb */}
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Projects</Link>
        <span className="breadcrumb-sep">/</span>
        <span>{project.name}</span>
      </nav>

      <div className="page-header">
        <h2>{project.name}</h2>
        <div className="header-actions">
          <Link to={`/projects/${project.id}/new-run`} className="btn primary btn-sm">
            <Plus size={14} strokeWidth={2.5} /><span>New Run</span>
          </Link>
          <div className="menu-wrapper">
            <button className="btn outline btn-sm icon-only" onClick={() => setShowMenu(!showMenu)}
              aria-label="More actions">
              <MoreHorizontal size={16} />
            </button>
            {showMenu && (
              <div className="dropdown-menu" onClick={() => setShowMenu(false)}>
                <button className="dropdown-item danger-text"
                  onClick={() => setConfirmDeleteProject(true)}>
                  <Trash2 size={14} /><span>Delete Project</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {project.repo_url && <p className="page-sub">{project.repo_url}</p>}

      {/* Stats — only show when there's data */}
      {hasRuns && (
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
            <span className={`stat-number ${project.total_issues > 0 ? "stat-issue-count" : ""}`}>
              {project.total_issues}
            </span>
            <span className="stat-label">Issues Found</span>
          </div>
        </div>
      )}

      {hasRuns && <h3 className="section-title">Run History</h3>}

      {!hasRuns ? (
        <div className="empty-state">
          <p className="empty-title">Nothing to analyze yet</p>
          <p className="empty-sub">Upload Java files or provide a GitHub repo to scan for energy anti-patterns.</p>
          <Link to={`/projects/${project.id}/new-run`} className="btn primary btn-sm">
            <Plus size={14} strokeWidth={2.5} /><span>Start Run</span>
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
                <motion.tr key={r.id} className="clickable-row"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  onClick={() => navigate(`/runs/${r.id}`)}
                  role="button" aria-label={`View run #${r.id}`}>
                  <td className="id-cell">#{r.id}</td>
                  <td>{r.description || "\u2014"}</td>
                  <td className="source-cell">{r.source_type === "repo" ? "GitHub" : "Upload"}</td>
                  <td>{statusBadge(r.status)}</td>
                  <td className="date-cell">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="delete-cell">
                    <button className="icon-btn-danger" title="Delete run"
                      onClick={(e) => { e.stopPropagation(); setRunToDelete(r); }}>
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

      <ConfirmDialog open={confirmDeleteProject} title="Delete Project"
        message={`Delete "${project.name}" and all ${project.total_runs} run${project.total_runs !== 1 ? "s" : ""}? This cannot be undone.`}
        onConfirm={handleDeleteProject} onCancel={() => setConfirmDeleteProject(false)} />
      <ConfirmDialog open={!!runToDelete} title="Delete Run"
        message={`Delete Run #${runToDelete?.id} and all its findings? This cannot be undone.`}
        onConfirm={handleDeleteRun} onCancel={() => setRunToDelete(null)} />
    </div>
  );
}
