import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, FileWarning, CheckCircle2, Minus,
  Clock, ChevronDown, ChevronUp, AlertTriangle, Trash2,
} from "lucide-react";
import { getFindings, getRun, deleteRun } from "../services/api";
import { Finding, Run } from "../types";
import ConfirmDialog from "../components/ConfirmDialog";

const PATTERN_INFO: Record<string, { short: string; full: string; tip: string }> = {
  dw: { short: "DW", full: "Durable Wakelock", tip: "WakeLock.acquire() without matching release() — keeps the device awake and drains battery." },
  hmu: { short: "HMU", full: "HashMap Usage", tip: "Using java.util.HashMap where ArrayMap or SparseArray would be more memory-efficient on Android." },
  has: { short: "HAS", full: "Heavy AsyncTask", tip: "Blocking operations (I/O, network) inside onPostExecute/onPreExecute — freezes the UI thread." },
  iod: { short: "IOD", full: "Init OnDraw", tip: "Creating objects (new Paint(), new Rect()) inside View.onDraw() — causes GC pressure on every frame." },
  nlmr: { short: "NLMR", full: "No Low-Memory Resolver", tip: "Activity or Service missing onLowMemory()/onTrimMemory() — app gets killed first under memory pressure." },
};

const PATTERNS = ["dw", "hmu", "has", "iod", "nlmr"] as const;

function PatternCell({ value }: { value: string }) {
  if (!value) return <td className="cell-empty"><Minus size={14} /></td>;
  if (value === "Yes") return <td className="cell-yes"><AlertTriangle size={14} /><span>Issue</span></td>;
  return <td className="cell-no"><CheckCircle2 size={14} /><span>Clean</span></td>;
}

function PatternHeader({ pattern }: { pattern: string }) {
  const info = PATTERN_INFO[pattern];
  const [showTip, setShowTip] = useState(false);
  return (
    <th title={info.tip} style={{ position: "relative", cursor: "help" }}
      onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
      {info.short}
      {showTip && (
        <div className="pattern-tooltip">
          <strong>{info.full}</strong>
          <p>{info.tip}</p>
        </div>
      )}
    </th>
  );
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
                    {val === "Yes" ? "Issue Found" : "Clean"}
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
  const [error, setError] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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
          setError("");
          if (f.length === 1 && f[0].status === "Done") {
            setExpandedRows(new Set([f[0].id]));
          }
        }
      } catch (e: any) {
        if (active) setError(e?.message || "Failed to load run details");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [runId]);

  if (loading)
    return (
      <div className="page">
        <div className="skeleton skeleton-text short" style={{ marginBottom: 16 }} />
        <div className="skeleton skeleton-heading" />
        <div className="meta-card">
          {[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-text" />)}
        </div>
        <div className="skeleton skeleton-row" style={{ height: 5, marginBottom: 20 }} />
        <div className="skeleton-table">
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton skeleton-row" />)}
        </div>
      </div>
    );

  if (error || !run)
    return (
      <div className="page"><div className="empty-state">
        <FileWarning size={40} strokeWidth={1.2} />
        <p className="empty-title">{error || "Run not found"}</p>
        <p className="empty-sub">Check that the backend is running and try again.</p>
        <Link to="/" className="back-link">
          <ArrowLeft size={14} /><span>Back to Projects</span>
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
        <ArrowLeft size={14} /><span>Back to Project</span>
      </Link>

      <div className="page-header">
        <div>
          <h2>Run #{run.id}</h2>
          {(run.status === "In-Progress" || run.status === "Pending") && (
            <span className="live-badge">Live</span>
          )}
        </div>
        <button className="btn outline btn-sm danger-text" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={14} /><span>Delete</span>
        </button>
      </div>

      <div className="meta-card">
        <div className="meta-item">
          <span className="meta-label">Description</span>
          <span className="meta-value">{run.description || "\u2014"}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Source</span>
          <span className="meta-value">{run.source_type === "repo" ? "GitHub" : "File Upload"}</span>
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
                <span>Issues only</span>
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
                  {PATTERNS.map((p) => <PatternHeader key={p} pattern={p} />)}
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
                      role="button"
                      aria-expanded={expandedRows.has(f.id)}
                      aria-label={`Toggle details for ${f.file_name.split("/").pop()}`}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRow(f.id); } }}
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
