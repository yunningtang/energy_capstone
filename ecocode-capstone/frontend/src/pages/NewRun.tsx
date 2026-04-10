import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, FileCode, Loader2, GitBranch, AlertCircle } from "lucide-react";
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
  const [fileWarning, setFileWarning] = useState("");

  useEffect(() => { getProject(pid).then(setProject).catch(() => {}); }, [pid]);

  const isValidUrl = (url: string) => { try { new URL(url); return true; } catch { return false; } };

  const canSubmit = !submitting && (tab === "repo" ? isValidUrl(repoUrl.trim()) : selectedFiles.length > 0);

  const disabledReason = submitting ? "" :
    tab === "repo" ? (repoUrl.trim() ? (isValidUrl(repoUrl.trim()) ? "" : "Enter a valid URL") : "Enter a repository URL to continue") :
    selectedFiles.length === 0 ? "Upload at least one .java file" : "";

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const all = Array.from(incoming);
    const javaFiles = all.filter((f) => f.name.toLowerCase().endsWith(".java"));
    const skipped = all.length - javaFiles.length;
    if (skipped > 0) {
      setFileWarning(`${skipped} file${skipped > 1 ? "s" : ""} skipped — only .java files are supported.`);
      setTimeout(() => setFileWarning(""), 4000);
    }
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...javaFiles.filter((f) => !existing.has(f.name))];
    });
  }, []);

  const removeFile = (name: string) => setSelectedFiles((prev) => prev.filter((f) => f.name !== name));

  function handleDrag(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(""); setSubmitting(true);
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
      setError(msg || e?.message || "Failed to start run. Is the backend running?");
    } finally { setSubmitting(false); }
  }

  function handleKeyDown(e: React.KeyboardEvent) { if (e.key === "Enter" && canSubmit) handleSubmit(); }

  useEffect(() => { if (project?.repo_url && !repoUrl) setRepoUrl(project.repo_url); }, [project]);

  const showUrlError = tab === "repo" && repoUrl.trim().length > 0 && !isValidUrl(repoUrl.trim());

  return (
    <div className="page page-narrow">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Projects</Link>
        <span className="breadcrumb-sep">/</span>
        <Link to={`/projects/${pid}`}>{project?.name || "Project"}</Link>
        <span className="breadcrumb-sep">/</span>
        <span>New Run</span>
      </nav>

      <div className="page-header"><h2>New Analysis Run</h2></div>

      <div className="card form-card" onKeyDown={handleKeyDown}>
        <label className="field-label">Description <span className="optional">optional</span></label>
        <input className="input" placeholder="e.g. Check after refactoring AsyncTask"
          value={description} onChange={(e) => setDescription(e.target.value)} />

        <label className="field-label">Source</label>
        <div className="source-toggle">
          <button className={`toggle-btn ${tab === "repo" ? "active" : ""}`} onClick={() => setTab("repo")}>
            <GitBranch size={14} /><span>GitHub Repository</span>
          </button>
          <button className={`toggle-btn ${tab === "uploaded" ? "active" : ""}`} onClick={() => setTab("uploaded")}>
            <Upload size={14} /><span>Upload Files</span>
          </button>
        </div>

        {tab === "repo" ? (
          <motion.div key="repo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
            <label className="field-label">Repository URL</label>
            <input className={`input ${showUrlError ? "input-error" : ""}`}
              placeholder="https://github.com/owner/repo"
              value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
            {showUrlError && <p className="error"><AlertCircle size={12} style={{ verticalAlign: -2 }} /> Enter a valid URL</p>}
          </motion.div>
        ) : (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
            <label className="field-label">Java Files</label>
            <div className={`drop-zone ${dragActive ? "drag-active" : ""}`}
              onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}>
              <Upload size={24} strokeWidth={1.5} />
              <p>Drag & drop <strong>.java</strong> files here, or click to browse</p>
            </div>
            <input ref={fileRef} type="file" hidden multiple accept=".java" onChange={(e) => addFiles(e.target.files)} />
            {fileWarning && <p className="warning-text"><AlertCircle size={12} style={{ verticalAlign: -2 }} /> {fileWarning}</p>}
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

        <div className="submit-area">
          <button className="btn primary btn-full" disabled={!canSubmit} onClick={handleSubmit}
            title={disabledReason || undefined}>
            {submitting ? <><Loader2 size={16} className="spin" /><span>Analyzing...</span></> : <span>Start Analysis</span>}
          </button>
          {disabledReason && !submitting && <p className="hint">{disabledReason}</p>}
        </div>
      </div>
    </div>
  );
}
