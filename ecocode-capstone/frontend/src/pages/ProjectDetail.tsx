import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Trash2, WifiOff, MoreHorizontal, Pencil, X } from "lucide-react";
import { getProject, getProjectRuns, getPatternStats, deleteProject, deleteRun, updateProject } from "../services/api";
import { Project, Run } from "../types";
import ConfirmDialog from "../components/ConfirmDialog";

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const pid = Number(projectId);
  const [project, setProject] = useState<Project | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [patternStats, setPatternStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [runToDelete, setRunToDelete] = useState<Run | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "In-Progress" | "Done" | "Failed">("all");
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameRepo, setRenameRepo] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");

  function openRename() {
    if (!project) return;
    setRenameName(project.name);
    setRenameRepo(project.repo_url || "");
    setRenameError("");
    setRenaming(true);
  }

  async function handleRenameSubmit() {
    if (!project) return;
    const trimmed = renameName.trim();
    const repoTrimmed = renameRepo.trim();
    if (!trimmed) { setRenameError("Name cannot be empty."); return; }
    if (repoTrimmed && !/^https?:\/\/\S+$/i.test(repoTrimmed)) {
      setRenameError("Repository URL must start with http(s)://.");
      return;
    }
    // Nothing changed — close without calling backend
    if (trimmed === project.name && repoTrimmed === (project.repo_url || "")) {
      setRenaming(false);
      return;
    }
    setRenameSaving(true);
    setRenameError("");
    try {
      const updated = await updateProject(project.id, {
        name: trimmed,
        repo_url: repoTrimmed || null,
      });
      setProject((p) => (p ? { ...p, name: updated.name, repo_url: updated.repo_url } : p));
      setRenaming(false);
    } catch (e: any) {
      setRenameError(e?.response?.data?.detail || e?.message || "Failed to save.");
    } finally {
      setRenameSaving(false);
    }
  }

  // Escape closes the rename dialog
  useEffect(() => {
    if (!renaming) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !renameSaving) setRenaming(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [renaming, renameSaving]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const load = async () => {
      try {
        const [p, r, ps] = await Promise.all([
          getProject(pid),
          getProjectRuns(pid),
          getPatternStats(pid).catch(() => ({} as Record<string, number>)),
        ]);
        if (active) { setProject(p); setRuns(r); setPatternStats(ps || {}); setError(""); }
      } catch (e: any) {
        if (active) setError(e?.message || "Failed to load project");
      } finally { if (active) setLoading(false); }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [projectId]);

  // Max severity across the project: critical if any DW, major if any HAS/IOD,
  // minor if any HMU/NLMR, else none.
  function maxProjectSeverity(): "critical" | "major" | "minor" | null {
    if ((patternStats.DW ?? 0) > 0) return "critical";
    if ((patternStats.HAS ?? 0) > 0 || (patternStats.IOD ?? 0) > 0) return "major";
    if ((patternStats.HMU ?? 0) > 0 || (patternStats.NLMR ?? 0) > 0) return "minor";
    return null;
  }

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
        <Link to="/" className="back-link"><span>Back to Projects</span></Link>
      </div></div>
    );

  function statusBadge(status: string) {
    const cls = status === "Done" ? "done" : status === "In-Progress" ? "progress" : status === "Failed" ? "failed" : "pending";
    return <span className={`badge ${cls}`}>{status}</span>;
  }

  const hasRuns = runs.length > 0;

  return (
    <div className="page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Projects</Link>
        <span className="breadcrumb-sep">/</span>
        <span>{project.name}</span>
      </nav>

      <div className="page-header">
        <h2 className="page-title-sm">{project.name}</h2>
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
                <button className="dropdown-item"
                  onClick={openRename}>
                  <Pencil size={14} /><span>Rename…</span>
                </button>
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

      {/* Compact inline metrics — severity-aware coloring on issues. */}
      {hasRuns && (() => {
        const totalRuns = project.total_runs ?? runs.length;
        const totalFiles = project.total_files ?? runs.reduce((a, r) => a + (r.file_count ?? 0), 0);
        const totalIssues = project.total_issues ?? runs.reduce((a, r) => a + (r.issue_count ?? 0), 0);
        const sev = totalIssues > 0 ? maxProjectSeverity() : null;
        return (
          <dl className="project-metrics">
            <div className="project-metric">
              <dt>Runs</dt>
              <dd>{totalRuns}</dd>
            </div>
            <span className="project-metric-sep" aria-hidden>·</span>
            <div className="project-metric">
              <dt>Files scanned</dt>
              <dd>{totalFiles}</dd>
            </div>
            <span className="project-metric-sep" aria-hidden>·</span>
            <div className="project-metric">
              <dt>Issues found</dt>
              <dd className={sev ? `project-metric-sev-${sev}` : ""}>
                {sev && <span className={`sev-dot sev-dot-${sev}`} aria-hidden />}
                {totalIssues}
              </dd>
            </div>
          </dl>
        );
      })()}

      {!hasRuns ? (
        <div className="empty-state">
          <p className="empty-title">Nothing to analyze yet</p>
          <p className="empty-sub">Upload Java files or provide a GitHub repo to scan for energy anti-patterns.</p>
          <Link to={`/projects/${project.id}/new-run`} className="btn primary btn-sm">
            <Plus size={14} strokeWidth={2.5} /><span>Start Run</span>
          </Link>
        </div>
      ) : (
        <>
          {/* Run History heading + filter tabs on one row */}
          <div className="run-history-header-row">
            <h3 className="run-history-heading">Run History</h3>
            <div className="run-filter-row">
              {(["all", "In-Progress", "Done", "Failed"] as const).map((s) => {
                const count = s === "all" ? runs.length : runs.filter(r => r.status === s).length;
                const label = s === "all" ? "All" : s === "In-Progress" ? "Running" : s;
                const isActive = statusFilter === s;
                return (
                  <button
                    key={s}
                    className={`run-filter-btn ${isActive ? "active" : ""}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {label}
                    <span className={`run-filter-count ${isActive ? "active" : ""}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="run-history-wrapper">
            <table className="run-history-table">
              <thead>
                <tr>
                  <th scope="col" className="rh-col-run">Run</th>
                  <th scope="col" className="rh-col-desc">Description</th>
                  <th scope="col" className="rh-col-source">Source</th>
                  <th scope="col" className="rh-col-status">Status</th>
                  <th scope="col" className="rh-col-date">Date</th>
                  <th scope="col" className="rh-col-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {runs
                  .filter(r => statusFilter === "all" || r.status === statusFilter)
                  .map((r) => (
                    <motion.tr
                      key={r.id}
                      className="run-history-row"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      onClick={() => navigate(`/runs/${r.id}`)}
                      role="button"
                      aria-label={`View run #${r.id}`}
                    >
                      <td className="rh-cell-run">#{r.id}</td>
                      <td className="rh-cell-desc">
                        {r.description
                          ? r.description
                          : r.source_url
                            ? <span className="rh-cell-desc-empty">{r.source_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                            : <span className="rh-cell-desc-empty">{r.file_count ?? 0} file{(r.file_count ?? 0) === 1 ? "" : "s"} uploaded</span>
                        }
                      </td>
                      <td className="rh-cell-source">
                        {r.source_type === "repo" ? "GitHub" : "Uploaded"}
                      </td>
                      <td className="rh-cell-status">{statusBadge(r.status)}</td>
                      <td className="rh-cell-date" title={new Date(r.created_at).toLocaleString()}>
                        {relativeTime(r.created_at)}
                      </td>
                      <td className="rh-cell-actions">
                        <button
                          className="icon-btn-danger run-list-delete"
                          title="Delete run"
                          aria-label="Delete run"
                          onClick={(e) => { e.stopPropagation(); setRunToDelete(r); }}
                        >
                          <Trash2 size={14} />
                        </button>
                        <span className="rh-cell-chevron" aria-hidden>›</span>
                      </td>
                    </motion.tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {renaming && (
        <div className="dialog-overlay" onClick={() => !renameSaving && setRenaming(false)}>
          <div
            className="dialog-box rename-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-title"
          >
            <div className="rename-dialog-head">
              <h3 id="rename-title" className="dialog-title">Rename project</h3>
              <button
                className="rename-dialog-close"
                onClick={() => setRenaming(false)}
                disabled={renameSaving}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <p className="dialog-message">
              Renaming only affects the display name. Existing runs, findings, and share links stay the same.
            </p>

            <label className="field-label" htmlFor="rename-name-input">Name</label>
            <input
              id="rename-name-input"
              className="input"
              autoFocus
              value={renameName}
              onChange={(e) => { setRenameName(e.target.value); if (renameError) setRenameError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(); }}
              disabled={renameSaving}
              maxLength={80}
            />

            <label className="field-label" htmlFor="rename-repo-input" style={{ marginTop: 12 }}>
              Repository URL <span className="optional">optional</span>
            </label>
            <input
              id="rename-repo-input"
              className="input"
              value={renameRepo}
              onChange={(e) => { setRenameRepo(e.target.value); if (renameError) setRenameError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(); }}
              placeholder="https://github.com/owner/repo"
              disabled={renameSaving}
            />

            {renameError && <p className="error rename-dialog-error">{renameError}</p>}

            <div className="dialog-actions">
              <button className="btn outline btn-sm" onClick={() => setRenaming(false)} disabled={renameSaving}>
                Cancel
              </button>
              <button
                className="btn primary btn-sm"
                onClick={handleRenameSubmit}
                disabled={renameSaving || !renameName.trim()}
              >
                {renameSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
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
