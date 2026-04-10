import React, { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, repoUrl?: string) => Promise<void>;
}

export default function CreateProjectModal({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await onSubmit(name.trim(), repoUrl.trim() || undefined);
      setName("");
      setRepoUrl("");
      onClose();
    } catch {}
    finally {
      setCreating(false);
    }
  }

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box create-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Create Project</h3>
        <label className="field-label">Project name</label>
        <input
          className="input"
          placeholder="e.g. MyAndroidApp"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <label className="field-label">Repository URL <span className="optional">optional</span></label>
        <input
          className="input"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <div className="dialog-actions">
          <button className="btn outline btn-sm" onClick={onClose}>Cancel</button>
          <button
            className="btn primary btn-sm"
            disabled={!name.trim() || creating}
            onClick={handleSubmit}
          >
            {creating ? <><Loader2 size={14} className="spin" /><span>Creating...</span></> : <span>Create</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
