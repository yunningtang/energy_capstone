import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, FileCode, Loader2, ArrowLeft } from "lucide-react";
import { createRunFromUrl, createRunUpload, getProject } from "../services/api";
import { Project } from "../types";

type SourceTab = "repo" | "uploaded";

export default function NewRun() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const pid = Number(projectId);

  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<SourceTab>("repo");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    getProject(pid).then(setProject).catch(() => {});
  }, [pid]);

  const canSubmit =
    !submitting &&
    (tab === "repo" ? repoUrl.trim().length > 0 : selectedFiles.length > 0);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const javaFiles = Array.from(incoming).filter((f) =>
      f.name.toLowerCase().endsWith(".java")
    );
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...javaFiles.filter((f) => !existing.has(f.name))];
    });
  }, []);

  const removeFile = (name: string) =>
    setSelectedFiles((prev) => prev.filter((f) => f.name !== name));

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      let run;
      if (tab === "repo") {
        run = await createRunFromUrl(pid, description, repoUrl.trim());
      } else {
        const dt = new DataTransfer();
        selectedFiles.forEach((f) => dt.items.add(f));
        run = await createRunUpload(pid, description, dt.files);
      }
      navigate(`/runs/${run.id}`);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail
        : Array.isArray(detail) ? detail.map((x: any) => x?.msg || JSON.stringify(x)).join("; ")
        : detail ? JSON.stringify(detail) : null;
      setError(msg || e?.message || "Failed to start run. Is the backend running on port 8000?");
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canSubmit) handleSubmit();
  }

  // Pre-fill repo URL from project
  useEffect(() => {
    if (project?.repo_url && !repoUrl) {
      setRepoUrl(project.repo_url);
    }
  }, [project]);

  return (
    <div className="page page-narrow">
      <Link to={`/projects/${pid}`} className="back-link">
        <ArrowLeft size={14} /> Back to {project?.name || "Project"}
      </Link>

      <h2>New Analysis Run</h2>
      <p className="page-sub">
        {project ? `Analyze code in ${project.name} for energy anti-patterns.` : "Loading..."}
      </p>

      <div className="card form-card" onKeyDown={handleKeyDown}>
        <label className="field-label">Description <span className="optional">optional</span></label>
        <input
          className="input"
          placeholder="e.g. Check after refactoring AsyncTask"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="field-label" style={{ marginTop: "1.4rem" }}>Source</label>
        <div className="source-toggle">
          <button
            className={`toggle-btn ${tab === "repo" ? "active" : ""}`}
            onClick={() => setTab("repo")}
          >
            GitHub Repository
          </button>
          <button
            className={`toggle-btn ${tab === "uploaded" ? "active" : ""}`}
            onClick={() => setTab("uploaded")}
          >
            Upload Files
          </button>
        </div>

        {tab === "repo" ? (
          <motion.div key="repo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
            <label className="field-label">Repository URL</label>
            <input
              className="input"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </motion.div>
        ) : (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
            <label className="field-label">Java Files</label>
            <div
              className={`drop-zone ${dragActive ? "drag-active" : ""}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={24} strokeWidth={1.5} />
              <p>Drag & drop <strong>.java</strong> files here, or click to browse</p>
            </div>
            <input ref={fileRef} type="file" hidden multiple accept=".java" onChange={(e) => addFiles(e.target.files)} />
            {selectedFiles.length > 0 && (
              <ul className="file-list">
                {selectedFiles.map((f) => (
                  <li key={f.name} className="file-item">
                    <span className="file-item-name"><FileCode size={14} /> {f.name}</span>
                    <button className="file-remove" onClick={() => removeFile(f.name)}>&times;</button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}

        {error && <p className="error">{error}</p>}

        <button className="btn primary btn-full" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? <><Loader2 size={16} className="spin" /> Analyzing...</> : "Start Analysis"}
        </button>
      </div>
    </div>
  );
}
