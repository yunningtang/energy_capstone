import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, ChevronRight, AlertTriangle, FileCode, PlayCircle, WifiOff, Zap, ArrowRight } from "lucide-react";
import { listProjects, createProject, healthCheck } from "../services/api";
import { Project } from "../types";
import CreateProjectModal from "../components/CreateProjectModal";

export default function ProjectsList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [llmWarning, setLlmWarning] = useState("");

  const isFirstVisit = projects.length === 0 && !loading && !error;

  useEffect(() => {
    let active = true;
    listProjects()
      .then((data) => { if (active) setProjects(data); })
      .catch((e) => { if (active) setError(e?.message || "Could not connect to the backend."); })
      .finally(() => { if (active) setLoading(false); });

    healthCheck()
      .then((h) => {
        const llm = h?.llm_status as any;
        if (llm?.status !== "healthy") {
          setLlmWarning(`No LLM provider connected. Connect one in Settings to run analyses.`);
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
      {/* ── Hero (visible when no projects or loading) ── */}
      {(isFirstVisit || loading) && !error && (
        <div className="hero">
          <div className="hero-content">
            <div className="hero-icon"><Zap size={28} strokeWidth={1.5} /></div>
            <h1 className="hero-title">
              Detect energy anti-patterns
              <span className="hero-title-line2">in your Android code</span>
            </h1>
            <p className="hero-sub">
              Upload Java files or provide a GitHub repo URL. The system scans each file
              for 5 battery drain patterns — wakelock misuse, inefficient data structures,
              heavy UI operations — using LLM-powered analysis.
            </p>
            {!loading && (
              <div className="hero-actions">
                <button className="btn primary" onClick={() => setShowCreateModal(true)}>
                  <span>Get Started</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
            <div className="hero-steps">
              <div className="hero-step">
                <span className="hero-step-num">01</span>
                <span className="hero-step-text">Create a project</span>
              </div>
              <div className="hero-step">
                <span className="hero-step-num">02</span>
                <span className="hero-step-text">Upload files or paste a repo URL</span>
              </div>
              <div className="hero-step">
                <span className="hero-step-num">03</span>
                <span className="hero-step-text">Review per-file results & explanations</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Warning banners ── */}
      {llmWarning && !isFirstVisit && (
        <div className="warning-banner" role="alert">
          <AlertTriangle size={16} />
          <span>{llmWarning}</span>
          <a href="/settings" className="warning-link">Settings</a>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="skeleton-grid" style={{ marginTop: 24 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton skeleton-card" />)}
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

      {/* ── Project grid (shown when projects exist) ── */}
      {!loading && !error && projects.length > 0 && (
        <>
          <div className="page-header" style={{ marginTop: 8 }}>
            <h2>Projects</h2>
          </div>

          <div className="project-grid">
            {projects.map((p, i) => (
              <motion.div
                key={p.id}
                className="project-card card"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
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
                {p.last_run_at && (
                  <p className="project-last-run">Last run: {new Date(p.last_run_at).toLocaleDateString()}</p>
                )}
              </motion.div>
            ))}

            <div className="project-card card ghost-card"
              onClick={() => setShowCreateModal(true)}
              role="button" aria-label="Create new project">
              <div className="ghost-card-inner">
                <Plus size={20} strokeWidth={1.5} />
                <span>New Project</span>
              </div>
            </div>
          </div>
        </>
      )}

      <CreateProjectModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
