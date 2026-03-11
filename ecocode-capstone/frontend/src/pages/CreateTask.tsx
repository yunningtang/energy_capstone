import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTaskFromUrl, createTaskUpload } from "../services/api";

type SourceTab = "repo" | "uploaded";

export default function CreateTask() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<SourceTab>("repo");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    !submitting &&
    (tab === "repo" ? repoUrl.trim().length > 0 : selectedFiles && selectedFiles.length > 0);

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    try {
      let task;
      if (tab === "repo") {
        task = await createTaskFromUrl(description, repoUrl.trim());
      } else {
        if (!selectedFiles) return;
        task = await createTaskUpload(description, selectedFiles);
      }
      navigate(`/tasks/${task.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to create task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h2>Create New Task</h2>

      <label className="field-label">Task Description</label>
      <input
        className="input"
        placeholder="e.g. Analyze energy smells in MyApp"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="tabs">
        <button
          className={`tab ${tab === "repo" ? "active" : ""}`}
          onClick={() => setTab("repo")}
        >
          GitHub Repository URL
        </button>
        <button
          className={`tab ${tab === "uploaded" ? "active" : ""}`}
          onClick={() => setTab("uploaded")}
        >
          Upload Files
        </button>
      </div>

      {tab === "repo" ? (
        <>
          <label className="field-label">Repository URL</label>
          <input
            className="input"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
          />
        </>
      ) : (
        <>
          <label className="field-label">Select Java Files</label>
          <input
            ref={fileRef}
            type="file"
            className="input"
            multiple
            accept=".java"
            onChange={(e) => setSelectedFiles(e.target.files)}
          />
          {selectedFiles && (
            <p className="hint">{selectedFiles.length} file(s) selected</p>
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}

      <button
        className="btn primary"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {submitting ? "Creating..." : "Create Task"}
      </button>
    </div>
  );
}
