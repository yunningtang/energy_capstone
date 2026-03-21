import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, FolderOpen, Plus, ChevronRight, AlertTriangle, FileCode } from "lucide-react";
import { listProjects, createProject } from "../services/api";
import { Project } from "../types";
import CreateProjectModal from "../components/CreateProjectModal";

export default function ProjectsList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    let active = true;
    listProjects()
      .then((data) => { if (active) setProjects(data); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function handleCreate(name: string, repoUrl?: string) {
    const proj = await createProject(name, repoUrl);
    setProjects((prev) => [proj, ...prev]);
    navigate(`/projects/${proj.id}`);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Projects</h2>
        <button className="btn primary btn-sm" onClick={() => setShowCreateModal(true)}>
          <Plus size={14} /> Create Project
        </button>
      </div>
      <p className="page-sub">Each project groups multiple analysis runs for the same codebase.</p>

      {loading ? (
        <div className="empty-state">
          <Loader2 size={28} className="spin" />
          <p>Loading projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <FolderOpen size={40} strokeWidth={1.2} />
          <p className="empty-title">No projects yet</p>
          <p className="empty-sub">Create your first project to analyze energy issues across a codebase.</p>
          <button className="btn primary btn-sm" style={{ marginTop: "0.8rem" }} onClick={() => setShowCreateModal(true)}>
            <Plus size={14} /> Create Project
          </button>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p, i) => (
            <motion.div
              key={p.id}
              className="project-card card"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => navigate(`/projects/${p.id}`)}
            >
              <div className="project-card-top">
                <h3 className="project-name">{p.name}</h3>
                <ChevronRight size={16} className="project-arrow" />
              </div>
              {p.repo_url && (
                <p className="project-url">{p.repo_url}</p>
              )}
              <div className="project-stats">
                <span>{p.total_runs} run{p.total_runs !== 1 ? "s" : ""}</span>
                <span><FileCode size={13} /> {p.total_files} file{p.total_files !== 1 ? "s" : ""}</span>
                {p.total_issues > 0 && (
                  <span className="stat-issues">
                    <AlertTriangle size={13} /> {p.total_issues} issue{p.total_issues !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {p.last_run_at && (
                <p className="project-last-run">
                  Last run: {new Date(p.last_run_at).toLocaleDateString()}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <CreateProjectModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}
