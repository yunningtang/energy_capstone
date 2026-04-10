import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileWarning, Minus, Clock, ChevronDown, ChevronUp,
  AlertTriangle, Trash2, Download,
} from "lucide-react";
import { getFindings, getRun, deleteRun, getProject, cancelRun, retryRun } from "../services/api";
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

function getFileIssues(f: Finding): string[] {
  return PATTERNS.filter((p) => f[p] === "Yes").map((p) => PATTERN_INFO[p].short);
}

function getFileChecked(f: Finding): number {
  return PATTERNS.filter((p) => f[p] === "Yes" || f[p] === "No").length;
}

function FeedbackRow({ result }: { result: Finding }) {
  const feedback = result.feedback;
  const issues = PATTERNS.filter((p) => result[p] === "Yes");
  const clean = PATTERNS.filter((p) => result[p] === "No");
  const [showCode, setShowCode] = useState(false);

  // Parse feedback for structured fields (line_range, suggested_fix)
  function getFeedbackObj(pattern: string): { reason: string; line_range?: string; suggested_fix?: string } {
    const raw = feedback?.[pattern.toUpperCase()] || feedback?.[pattern] || "";
    if (typeof raw === "object" && raw !== null) {
      return raw as any;
    }
    return { reason: String(raw) };
  }

  return (
    <tr className="feedback-row">
      <td colSpan={5}>
        <div className="feedback-content">
          {/* Issues with details */}
          {issues.map((p) => {
            const fb = getFeedbackObj(p);
            const info = PATTERN_INFO[p];
            return (
              <div key={p} className="feedback-item issue-found">
                <div className="feedback-header">
                  <span className="feedback-pattern">{info.full}</span>
                  <span className="feedback-verdict yes">Issue</span>
                </div>
                {fb.reason && <p className="feedback-reason">{fb.reason}</p>}
                {fb.line_range && (
                  <p className="feedback-line-ref">Line {fb.line_range}</p>
                )}
                {fb.suggested_fix && (
                  <div className="feedback-fix">
                    <span className="feedback-fix-label">Suggested fix</span>
                    <p className="feedback-fix-text">{fb.suggested_fix}</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Clean summary */}
          {clean.length > 0 && issues.length > 0 && (
            <div className="feedback-item no-issue">
              <span className="feedback-pattern" style={{ fontSize: 12, color: "var(--fg-tertiary)" }}>
                {clean.length} other check{clean.length > 1 ? "s" : ""} passed: {clean.map(p => PATTERN_INFO[p].short).join(", ")}
              </span>
            </div>
          )}

          {/* Source code viewer toggle */}
          {result.file_content && (
            <div className="code-viewer-toggle">
              <button className="text-btn" onClick={(e) => { e.stopPropagation(); setShowCode(!showCode); }}>
                {showCode ? "Hide source code" : "View source code"}
              </button>
            </div>
          )}

          {showCode && result.file_content && (
            <div className="code-viewer">
              <pre className="code-block">
                <code>{result.file_content}</code>
              </pre>
            </div>
          )}
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
  const [projectName, setProjectName] = useState("Project");

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
          if (r.project_id) {
            getProject(r.project_id).then(p => setProjectName(p.name)).catch(() => {});
          }
          // Auto-expand files with issues
          const withIssues = f.filter((fi) => PATTERNS.some((p) => fi[p] === "Yes"));
          if (withIssues.length > 0 && withIssues.length <= 3) {
            setExpandedRows(new Set(withIssues.map((fi) => fi.id)));
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
        <Link to="/" className="back-link"><span>Projects</span></Link>
      </div></div>
    );

  const doneCount = findings.filter((f) => f.status === "Done").length;
  const totalCount = findings.length;
  const issueCount = findings.reduce((sum, f) => sum + getFileIssues(f).length, 0);
  const filesWithIssues = findings.filter((f) => getFileIssues(f).length > 0).length;
  const backTo = run.project_id ? `/projects/${run.project_id}` : "/";

  async function handleDelete() {
    try { await deleteRun(run!.id); navigate(backTo); } catch {}
    setConfirmDelete(false);
  }

  function exportCsv() {
    const header = "file,status,dw,hmu,has,iod,nlmr\n";
    const rows = findings.map((f) =>
      `${f.file_name},${f.status},${f.dw || ""},${f.hmu || ""},${f.has || ""},${f.iod || ""},${f.nlmr || ""}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${run!.id}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const displayFindings = issuesOnly
    ? findings.filter((f) => getFileIssues(f).length > 0)
    : findings;

  return (
    <div className="page">
      {/* Breadcrumb */}
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Projects</Link>
        <span className="breadcrumb-sep">/</span>
        <Link to={backTo}>{projectName}</Link>
        <span className="breadcrumb-sep">/</span>
        <span>Run #{run.id}</span>
      </nav>

      <div className="page-header">
        <h2>Run #{run.id}</h2>
        <div className="header-actions">
          {(run.status === "In-Progress" || run.status === "Pending") && (
            <button className="btn outline btn-sm" onClick={async () => { await cancelRun(run.id); window.location.reload(); }}>
              <span>Cancel</span>
            </button>
          )}
          {run.status === "Cancelled" && findings.some(f => f.status !== "Done") && (
            <button className="btn primary btn-sm" onClick={async () => { await retryRun(run.id); window.location.reload(); }}>
              <span>Retry</span>
            </button>
          )}
          {findings.length > 0 && (
            <button className="btn outline btn-sm" onClick={exportCsv}>
              <Download size={14} /><span>Export</span>
            </button>
          )}
          <button className="btn outline btn-sm danger-text" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} /><span>Delete</span>
          </button>
        </div>
      </div>

      {/* Compact meta */}
      <div className="run-meta-inline">
        <span>{run.source_type === "repo" ? "GitHub" : "File Upload"}</span>
        <span className="meta-sep">·</span>
        <span className={`badge ${run.status === "Done" ? "done" : run.status === "In-Progress" ? "progress" : run.status === "Failed" ? "failed" : "pending"}`}>
          {run.status}
        </span>
        <span className="meta-sep">·</span>
        <span>{doneCount}/{totalCount} files</span>
        <span className="meta-sep">·</span>
        <span className="time-relative" title={new Date(run.created_at).toLocaleString()}>
          {relativeTime(run.created_at)}
        </span>
        {run.description && (
          <>
            <span className="meta-sep">·</span>
            <span style={{ color: "var(--fg-tertiary)" }}>{run.description}</span>
          </>
        )}
      </div>

      {/* Progress bar (only while running) */}
      {run.status !== "Done" && totalCount > 0 && (
        <div className="progress-bar-wrapper">
          <div className="progress-bar-fill" style={{ width: `${(doneCount / totalCount) * 100}%` }} />
        </div>
      )}

      {/* Summary — only show when issues found */}
      {run.status === "Done" && issueCount > 0 && (
        <div className="summary-banner has-issues">
          <AlertTriangle size={16} />
          <span><strong>{issueCount} issue{issueCount > 1 ? "s" : ""}</strong> in {filesWithIssues} of {totalCount} file{totalCount > 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Empty / processing */}
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
          {/* Filters */}
          <div className="table-actions">
            {issueCount > 0 && (
              <label className="toggle-label">
                <input type="checkbox" checked={issuesOnly}
                  onChange={(e) => setIssuesOnly(e.target.checked)} />
                <span>Issues only</span>
              </label>
            )}
            <div style={{ flex: 1 }} />
          </div>

          {/* Results table — simplified */}
          <div className="card table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>File</th>
                  <th>Status</th>
                  <th>Result</th>
                  <th style={{ width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {displayFindings.map((f, idx) => {
                  const issues = getFileIssues(f);
                  const checked = getFileChecked(f);
                  const hasIssue = issues.length > 0;

                  const isExpandable = hasIssue || f.status !== "Done";

                  return (
                    <React.Fragment key={f.id}>
                      <motion.tr
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                        className={`${isExpandable ? "clickable-row" : ""} ${expandedRows.has(f.id) ? "expanded" : ""}`}
                        onClick={isExpandable ? () => toggleRow(f.id) : undefined}
                        role={isExpandable ? "button" : undefined}
                        aria-expanded={isExpandable ? expandedRows.has(f.id) : undefined}
                        aria-label={isExpandable ? `Toggle details for ${f.file_name.split("/").pop()}` : undefined}
                        tabIndex={isExpandable ? 0 : undefined}
                        onKeyDown={isExpandable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRow(f.id); } } : undefined}
                      >
                        <td className="id-cell">{idx + 1}</td>
                        <td className="file-cell" title={f.file_name}>{f.file_name.split("/").pop()}</td>
                        <td>
                          {f.status === "Done"
                            ? <span className="badge done">Done</span>
                            : f.status === "Analyzing"
                            ? <span className="badge progress">Analyzing</span>
                            : <span className="badge pending">Pending</span>
                          }
                        </td>
                        <td>
                          {f.status !== "Done" ? (
                            <span style={{ color: "var(--fg-disabled)" }}><Minus size={14} /></span>
                          ) : hasIssue ? (
                            <span style={{ color: "var(--danger)", fontWeight: 500, fontSize: 13 }}>
                              <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 3 }} />
                              {issues.length} issue{issues.length > 1 ? "s" : ""}: {issues.join(", ")}
                            </span>
                          ) : (
                            <span style={{ color: "var(--fg-tertiary)", fontSize: 13 }}>
                              {checked}/{checked} passed
                            </span>
                          )}
                        </td>
                        <td className="expand-cell">
                          {isExpandable && (expandedRows.has(f.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                        </td>
                      </motion.tr>
                      {expandedRows.has(f.id) && <FeedbackRow result={f} />}
                    </React.Fragment>
                  );
                })}
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
