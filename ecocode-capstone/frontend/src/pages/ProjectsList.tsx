import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, ChevronRight, AlertTriangle, FileCode, PlayCircle, WifiOff, Zap, X, CheckCircle2, Clock } from "lucide-react";
import { listProjects, createProject, healthCheck, listAllRuns } from "../services/api";
import { Project, Run } from "../types";
import CreateProjectModal from "../components/CreateProjectModal";

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ProjectsList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentRuns, setRecentRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [llmWarning, setLlmWarning] = useState("");
  const [heroDismissed, setHeroDismissed] = useState(() => !!localStorage.getItem("hero_dismissed"));
  const [heroClosing, setHeroClosing] = useState(false);

  function dismissHero() {
    setHeroClosing(true);
    setTimeout(() => {
      setHeroDismissed(true);
      localStorage.setItem("hero_dismissed", "1");
    }, 300);
  }

  useEffect(() => {
    let active = true;
    Promise.all([listProjects(), listAllRuns(5).catch(() => [] as Run[])])
      .then(([projs, runs]) => {
        if (!active) return;
        setProjects(projs);
        setRecentRuns(runs);
      })
      .catch((e) => { if (active) setError(e?.message || "Could not connect to the backend."); })
      .finally(() => { if (active) setLoading(false); });

    healthCheck()
      .then((h) => {
        const llm = h?.llm_status as any;
        if (llm?.status !== "healthy") {
          setLlmWarning("No LLM provider connected. Connect one in Settings to run analyses.");
        }
      })
      .catch(() => {});

    return () => { active = false; };
  }, []);

  async function handleCreate(name: string, repoUrl?: string) {
    const proj = await createProject(name, repoUrl);
    setProjects((prev) => [proj, ...prev]);
    navigate(`/projects/${proj.id}`);
  }

  return (
    <div className="page">
      {/* ── Hero banner (dismissible, slides out) ── */}
      {!heroDismissed && (
        <div className={`hero-banner ${heroClosing ? "hero-closing" : ""}`}>
          <div className="hero-banner-icon"><Zap size={20} strokeWidth={1.5} /></div>
          <div className="hero-banner-content">
            <h3 className="hero-banner-title">Detect energy anti-patterns in your Android code</h3>
            <div className="hero-banner-steps">
              <span className={llmWarning ? "hero-step-pending" : "hero-step-done"}>
                <strong>1.</strong> {llmWarning ? (
                  <>Configure an LLM provider in <a href="/settings" className="hero-inline-link">Settings</a></>
                ) : (
                  <>LLM provider connected</>
                )}
              </span>
              <span><strong>2.</strong> Create a project</span>
              <span><strong>3.</strong> Upload .java files or paste a repo URL</span>
              <span><strong>4.</strong> Review per-file results & explanations</span>
            </div>
          </div>
          <button className="hero-banner-close" onClick={dismissHero} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Warning ── */}
      {llmWarning && (
        <div className="warning-banner" role="alert">
          <AlertTriangle size={16} />
          <span>{llmWarning}</span>
          <a href="/settings" className="warning-link">Settings</a>
        </div>
      )}

      {/* ── Dashboard header ── */}
      <div className="page-header dashboard-header">
        <div>
          <h2>Dashboard</h2>
          <p className="dashboard-sub">
            {projects.length === 0
              ? "Run your first analysis to get started."
              : recentRuns[0]?.created_at
                ? `Last analysis ${relativeTime(recentRuns[0].created_at)} across ${projects.length} project${projects.length > 1 ? "s" : ""}`
                : `${projects.length} project${projects.length > 1 ? "s" : ""} ready.`}
          </p>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="skeleton-grid">
          {[1, 2, 3].map(i => <div key={i} className="skeleton skeleton-card" />)}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="empty-state">
          <WifiOff size={40} strokeWidth={1.2} />
          <p className="empty-title">Cannot reach backend</p>
          <p className="empty-sub">{error}. Check that the API server is running.</p>
        </div>
      )}

      {!loading && !error && (() => {
        const totalRuns = projects.reduce((a, p) => a + (p.total_runs || 0), 0);
        const totalFiles = projects.reduce((a, p) => a + (p.total_files || 0), 0);
        const totalIssues = projects.reduce((a, p) => a + (p.total_issues || 0), 0);
        const lastRunAt = projects
          .map(p => p.last_run_at)
          .filter(Boolean)
          .sort()
          .pop();

        return (
          <>
            {/* ── 4 stat tiles — aggregate across all projects ── */}
            <div className="dashboard-stats">
              <div className="dashboard-stat">
                <div className="dashboard-stat-value">{totalRuns}</div>
                <div className="dashboard-stat-label">Total runs</div>
              </div>
              <div className="dashboard-stat">
                <div className="dashboard-stat-value">{totalFiles}</div>
                <div className="dashboard-stat-label">Files scanned</div>
              </div>
              <div className="dashboard-stat">
                <div className={`dashboard-stat-value ${totalIssues > 0 ? "has-issues" : ""}`}>{totalIssues}</div>
                <div className="dashboard-stat-label">Open issues</div>
              </div>
              <div className="dashboard-stat">
                <div className="dashboard-stat-value dashboard-stat-time">
                  {lastRunAt ? relativeTime(lastRunAt) : "—"}
                </div>
                <div className="dashboard-stat-label">Last run</div>
              </div>
            </div>

            {/* ── Recent runs ── */}
            <section className="dashboard-section">
              <div className="dashboard-section-head">
                <h3 className="section-title">Recent runs</h3>
                {projects[0] && (
                  <button
                    className="btn primary btn-sm"
                    onClick={() => navigate(`/projects/${projects[0].id}/new-run`)}
                  >
                    <Plus size={14} strokeWidth={2.5} /><span>New run</span>
                  </button>
                )}
              </div>
              {recentRuns.length === 0 ? (
                <div className="dashboard-empty">
                  <p className="empty-sub">No runs yet. Create a project and upload code to see results here.</p>
                </div>
              ) : (
                <ul className="dashboard-runs">
                  {recentRuns.map((r) => {
                    const issueCount = r.issue_count ?? 0;
                    const fileCount = r.file_count ?? 0;
                    const descLabel = r.description
                      || (r.source_url
                        ? r.source_url.replace(/^https?:\/\//, "").replace(/\/$/, "")
                        : `${fileCount} file${fileCount === 1 ? "" : "s"} uploaded`);
                    const project = projects.find(p => p.id === r.project_id);
                    return (
                      <li key={r.id}>
                        <button
                          className="dashboard-run-row"
                          onClick={() => navigate(`/runs/${r.id}`)}
                          aria-label={`Open run #${r.id}`}
                        >
                          <span className="dashboard-run-id">#{r.id}</span>
                          <span className="dashboard-run-desc">{descLabel}</span>
                          <span className="dashboard-run-project">{project?.name}</span>
                          <span className={`dashboard-run-status ${issueCount > 0 ? "has-issues" : r.status === "Done" ? "clean" : "pending"}`}>
                            {r.status !== "Done" ? (
                              <><Clock size={13} /> {r.status}</>
                            ) : issueCount > 0 ? (
                              <><AlertTriangle size={13} /> {issueCount} issue{issueCount === 1 ? "" : "s"}</>
                            ) : (
                              <><CheckCircle2 size={13} /> Clean</>
                            )}
                          </span>
                          <span className="dashboard-run-time">{relativeTime(r.created_at)}</span>
                          <ChevronRight size={14} className="dashboard-run-chevron" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* ── Projects (sunk to the bottom) ── */}
            <section className="dashboard-section">
              <div className="dashboard-section-head">
                <h3 className="section-title">
                  Projects <span className="section-title-count">({projects.length})</span>
                </h3>
                <button
                  className="btn outline btn-sm"
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus size={14} strokeWidth={2.5} /><span>New project</span>
                </button>
              </div>
              {projects.length === 0 ? (
                <div className="dashboard-empty">
                  <p className="empty-sub">
                    Create a project to group your analyses.{" "}
                    <button className="text-btn inline-btn" onClick={() => setShowCreateModal(true)}>Create one now</button>.
                  </p>
                </div>
              ) : (
                <div className="dashboard-projects">
                  {projects.map((p, i) => (
                    <motion.div
                      key={p.id}
                      className="project-card card"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      role="button"
                      aria-label={`Open project ${p.name}`}
                    >
                      <div className="project-card-top">
                        <h3 className="project-name">{p.name}</h3>
                        <ChevronRight size={16} className="project-arrow" />
                      </div>
                      {p.repo_url && <p className="project-url">{p.repo_url}</p>}
                      <div className="project-stats">
                        <span><PlayCircle size={14} /> {p.total_runs} run{p.total_runs !== 1 ? "s" : ""}</span>
                        <span><FileCode size={14} /> {p.total_files} file{p.total_files !== 1 ? "s" : ""}</span>
                        {p.total_issues > 0 && (
                          <span className="stat-issues">
                            <AlertTriangle size={14} /> {p.total_issues} issue{p.total_issues !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          </>
        );
      })()}

      <CreateProjectModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
