import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  FileWarning,
  CheckCircle2,
  XCircle,
  Minus,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { getFindings, getRun, deleteRun } from "../services/api";
import { Finding, Run } from "../types";
import ConfirmDialog from "../components/ConfirmDialog";

const PATTERN_INFO: Record<string, { short: string; full: string }> = {
  dw: { short: "DW", full: "Durable Wakelock" },
  hmu: { short: "HMU", full: "HashMap Usage" },
  has: { short: "HAS", full: "Heavy AsyncTask" },
  iod: { short: "IOD", full: "Init OnDraw" },
  nlmr: { short: "NLMR", full: "No Low-Memory Resolver" },
};

const PATTERNS = ["dw", "hmu", "has", "iod", "nlmr"] as const;

function PatternCell({ value }: { value: string }) {
  if (!value) return <td className="cell-empty"><Minus size={14} /></td>;
  if (value === "Yes") return <td className="cell-yes"><XCircle size={14} /> Yes</td>;
  return <td className="cell-no"><CheckCircle2 size={14} /> No</td>;
}

function FeedbackRow({ result }: { result: Finding }) {
  const feedback = result.feedback;
  const analyzed = PATTERNS.filter((p) => result[p] === "Yes" || result[p] === "No");

  if (analyzed.length === 0 && !feedback) {
    return (
      <tr className="feedback-row">
        <td colSpan={9}>
          <div className="feedback-content">
            <p className="feedback-empty">No analysis feedback available yet.</p>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="feedback-row">
      <td colSpan={9}>
        <div className="feedback-content">
          {PATTERNS.map((p) => {
            const val = result[p];
            if (!val) return null;
            const reason = feedback?.[p.toUpperCase()] || feedback?.[p] || "";
            const info = PATTERN_INFO[p];
            return (
              <div key={p} className={`feedback-item ${val === "Yes" ? "issue-found" : "no-issue"}`}>
                <div className="feedback-header">
                  <span className="feedback-pattern">{info.full} ({info.short})</span>
                  <span className={`feedback-verdict ${val === "Yes" ? "yes" : "no"}`}>
                    {val === "Yes" ? "Issue Found" : "No Issue"}
                  </span>
                </div>
                {reason && <p className="feedback-reason">{reason}</p>}
              </div>
            );
          })}
        </div>
      </td>
    </tr>
  );
}

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allExpanded = findings.length > 0 && findings.every((f) => expandedRows.has(f.id));
  const toggleAll = () => {
    if (allExpanded) setExpandedRows(new Set());
    else setExpandedRows(new Set(findings.map((f) => f.id)));
  };

  useEffect(() => {
    if (!runId) return;
    let active = true;
    const id = Number(runId);

    const load = async () => {
      try {
        const [r, f] = await Promise.all([getRun(id), getFindings(id)]);
        if (active) {
          setRun(r);
          setFindings(f);
          if (f.length === 1 && f[0].status === "Done") {
            setExpandedRows(new Set([f[0].id]));
          }
        }
      } catch {}
      finally { if (active) setLoading(false); }
    };

    load();
    const timer = setInterval(load, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [runId]);

  if (loading)
    return (
      <div className="page"><div className="empty-state">
        <Loader2 size={28} className="spin" /><p>Loading run details...</p>
      </div></div>
    );

  if (!run)
    return (
      <div className="page"><div className="empty-state">
        <FileWarning size={40} strokeWidth={1.2} />
        <p className="empty-title">Run not found</p>
        <Link to="/" className="back-link" style={{ marginTop: "0.5rem" }}>
          <ArrowLeft size={14} /> Back to Projects
        </Link>
      </div></div>
    );

  const fileStatusLabel = (s: string) => {
    if (s === "Done") return <span className="badge done">Done</span>;
    if (s === "Analyzing") return <span className="badge progress">Analyzing</span>;
    return <span className="badge pending">Pending</span>;
  };

  const doneCount = findings.filter((f) => f.status === "Done").length;
  const totalCount = findings.length;
  const issueCount = findings.reduce((sum, f) =>
    sum + PATTERNS.filter((p) => f[p] === "Yes").length, 0
  );
  const filesWithIssues = findings.filter((f) =>
    PATTERNS.some((p) => f[p] === "Yes")
  ).length;

  const backTo = run.project_id ? `/projects/${run.project_id}` : "/";

  async function handleDelete() {
    try {
      await deleteRun(run!.id);
      navigate(backTo);
    } catch {}
    setConfirmDelete(false);
  }

  const displayFindings = issuesOnly
    ? findings.filter((f) => PATTERNS.some((p) => f[p] === "Yes"))
    : findings;

  return (
    <div className="page">
      <Link to={backTo} className="back-link">
        <ArrowLeft size={14} /> Back to Project
      </Link>

      <div className="page-header">
        <h2>Run #{run.id}</h2>
        <button className="btn danger-btn btn-sm" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={14} /> Delete
        </button>
      </div>

      <div className="meta-card">
        <div className="meta-item">
          <span className="meta-label">Description</span>
          <span className="meta-value">{run.description || "\u2014"}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Source</span>
          <span className="meta-value source-cell">{run.source_type}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Status</span>
          <span className="meta-value">{fileStatusLabel(run.status)}</span>
        </div>
        {totalCount > 0 && (
          <div className="meta-item">
            <span className="meta-label">Progress</span>
            <span className="meta-value">{doneCount} / {totalCount} files</span>
          </div>
        )}
      </div>

      {totalCount > 0 && (
        <div className="progress-bar-wrapper">
          <div className="progress-bar-fill" style={{ width: `${totalCount ? (doneCount / totalCount) * 100 : 0}%` }} />
        </div>
      )}

      {run.status === "Done" && totalCount > 0 && (
        <div className={`summary-banner ${issueCount > 0 ? "has-issues" : "clean"}`}>
          {issueCount > 0 ? (
            <><AlertTriangle size={16} /><span><strong>{issueCount} issue{issueCount > 1 ? "s" : ""}</strong> found in {filesWithIssues} of {totalCount} file{totalCount > 1 ? "s" : ""}</span></>
          ) : (
            <><CheckCircle2 size={16} /><span>No energy issues detected across {totalCount} file{totalCount > 1 ? "s" : ""}.</span></>
          )}
        </div>
      )}

      <div className="pattern-legend">
        {PATTERNS.map((p) => (
          <span key={p} className="legend-item">
            <strong>{PATTERN_INFO[p].short}</strong> = {PATTERN_INFO[p].full}
          </span>
        ))}
      </div>

      {findings.length === 0 ? (
        <div className="empty-state">
          <Clock size={40} strokeWidth={1.2} />
          <p className="empty-title">
            {run.status === "Pending" || run.status === "In-Progress" ? "Processing..." : "No files found"}
          </p>
          <p className="empty-sub">
            {run.status === "Pending" || run.status === "In-Progress"
              ? "Files are being analyzed. This page refreshes automatically."
              : "No Java files were found for this run."}
          </p>
        </div>
      ) : (
        <>
          <div className="table-actions">
            {issueCount > 0 && (
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={issuesOnly}
                  onChange={(e) => setIssuesOnly(e.target.checked)}
                />
                Issues only
              </label>
            )}
            {findings.length > 1 && (
              <button className="text-btn" onClick={toggleAll}>
                {allExpanded ? "Collapse All" : "Expand All"}
              </button>
            )}
          </div>
          <div className="card table-wrapper">
            <table className="data-table results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>File</th>
                  <th>Status</th>
                  {PATTERNS.map((p) => (
                    <th key={p} title={PATTERN_INFO[p].full}>{PATTERN_INFO[p].short}</th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayFindings.map((f, idx) => (
                  <React.Fragment key={f.id}>
                    <motion.tr
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                      className={`clickable-row ${expandedRows.has(f.id) ? "expanded" : ""}`}
                      onClick={() => toggleRow(f.id)}
                    >
                      <td className="id-cell">{idx + 1}</td>
                      <td className="file-cell" title={f.file_name}>{f.file_name.split("/").pop()}</td>
                      <td>{fileStatusLabel(f.status)}</td>
                      {PATTERNS.map((p) => <PatternCell key={p} value={f[p]} />)}
                      <td className="expand-cell">
                        {expandedRows.has(f.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </td>
                    </motion.tr>
                    {expandedRows.has(f.id) && <FeedbackRow result={f} />}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Run"
        message={`Delete Run #${run.id} and all its findings? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
