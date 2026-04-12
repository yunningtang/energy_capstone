import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileWarning, CheckCircle2, Check, Minus, Clock, ChevronDown, ChevronUp,
  AlertTriangle, Trash2, Download,
} from "lucide-react";
import { getFindings, getRun, deleteRun, getProject, cancelRun, retryRun } from "../services/api";
import CodeBlock, { parseLineRange } from "../components/CodeBlock";
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
  const [showCode, setShowCode] = useState(issues.length > 0);  // auto-open for issues
  const [showCleanDetails, setShowCleanDetails] = useState(false);

  // Parse feedback for structured fields (line_range, suggested_fix)
  function getFeedbackObj(pattern: string): { reason: string; line_range?: string; suggested_fix?: string } {
    const raw = feedback?.[pattern.toUpperCase()] || feedback?.[pattern] || "";
    if (typeof raw === "object" && raw !== null) {
      return raw as any;
    }
    return { reason: String(raw) };
  }

  // Merge all line_ranges from issues
  const highlightLines = new Set<number>();
  issues.forEach((p) => {
    const fb = getFeedbackObj(p);
    parseLineRange(fb.line_range).forEach((n) => highlightLines.add(n));
  });

  return (
    <tr className="feedback-row">
      <td colSpan={5}>
        <div className="feedback-content">
          {/* ── Issues with details ─────────────────── */}
          {issues.map((p) => {
            const fb = getFeedbackObj(p);
            const info = PATTERN_INFO[p];
            return (
              <div key={p} className="feedback-item issue-found">
                <div className="feedback-header">
                  <span className="feedback-pattern">{info.full} ({info.short})</span>
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

          {/* ── Clean summary with expand-to-details ─ */}
          {clean.length > 0 && (
            <div className="clean-summary">
              <button className="clean-summary-toggle" onClick={(e) => { e.stopPropagation(); setShowCleanDetails(!showCleanDetails); }}>
                <span className="feedback-verdict no">Clean</span>
                <span className="clean-summary-text">
                  {issues.length === 0
                    ? `All ${clean.length} checks passed`
                    : `${clean.length} other check${clean.length > 1 ? "s" : ""} passed`
                  }
                </span>
                <span className="clean-summary-chevron">{showCleanDetails ? "−" : "+"}</span>
              </button>
              {showCleanDetails && (
                <div className="clean-details">
                  {clean.map((p) => {
                    const fb = getFeedbackObj(p);
                    const info = PATTERN_INFO[p];
                    return (
                      <div key={p} className="clean-detail-item">
                        <div className="clean-detail-name">{info.full} <span className="clean-detail-short">({info.short})</span></div>
                        {fb.reason && <p className="clean-detail-reason">{fb.reason}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Source code viewer ─────────────────── */}
          {result.file_content && (
            <div className="code-viewer-section">
              <div className="code-viewer-header">
                <button className="text-btn" onClick={(e) => { e.stopPropagation(); setShowCode(!showCode); }}>
                  {showCode ? "Hide source" : "View source"}
                  {highlightLines.size > 0 && !showCode && (
                    <span className="code-viewer-badge"> · {highlightLines.size} line{highlightLines.size > 1 ? "s" : ""} flagged</span>
                  )}
                </button>
                <span className="code-viewer-filename">{result.file_name}</span>
              </div>
              {showCode && (
                <CodeBlock code={result.file_content} highlightLines={highlightLines} />
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ──────────────────────────────────────────────────────
   InlineIssueList — rendered directly under a matrix row
   when that file has issues. ESLint/tsc-style output:
   file → indented issue items with fix suggestions.
   No clicks, no expansion — everything always visible.
   ────────────────────────────────────────────────────── */
function InlineIssueList({ finding }: { finding: Finding }) {
  const issues = PATTERNS.filter((p) => finding[p] === "Yes");

  function getFeedback(p: string): { reason?: string; line_range?: string; suggested_fix?: string } {
    const raw = finding.feedback?.[p.toUpperCase()] || finding.feedback?.[p];
    if (typeof raw === "object" && raw !== null) return raw as any;
    if (raw) return { reason: String(raw) };
    return {};
  }

  return (
    <div className="inline-issue-list">
      {issues.map((p) => {
        const fb = getFeedback(p);
        const info = PATTERN_INFO[p];
        return (
          <div key={p} className="inline-issue-item">
            <div className="inline-issue-head">
              <span className="inline-issue-code">{info.short}</span>
              {fb.line_range && (
                <span className="inline-issue-line">line {fb.line_range}</span>
              )}
              <span className="inline-issue-name">{info.full}</span>
            </div>
            {fb.reason && <p className="inline-issue-reason">{fb.reason}</p>}
            {fb.suggested_fix && (
              <p className="inline-issue-fix">
                <span className="inline-issue-fix-label">Fix</span>
                {fb.suggested_fix}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   MatrixView — rows = files, cols = patterns (DW/HMU/HAS/IOD/NLMR)
   Files with issues auto-expand with inline details (ESLint-style).
   ────────────────────────────────────────────────────── */
function MatrixView({
  findings,
  selectedFinding,
  onSelectCell,
}: {
  findings: Finding[];
  selectedFinding: Finding | null | undefined;
  onSelectCell: (f: Finding) => void;
}) {
  // Per-column totals (how many files tripped each pattern)
  const colTotals = PATTERNS.map((p) => findings.filter((f) => f[p] === "Yes").length);

  // Map backend verdict to visual state. Backend writes:
  //   "Yes" = issue, "No" = passed, "NA" = not applicable, "" = pending
  function cellState(f: Finding, p: typeof PATTERNS[number]): "issue" | "passed" | "na" | "pending" {
    if (f.status !== "Done") return "pending";
    const v = f[p];
    if (v === "Yes") return "issue";
    if (v === "NA") return "na";
    if (v === "No") {
      // Legacy fallback: old runs stored "No" for both passed + NA
      const raw = f.feedback?.[p.toUpperCase()] || f.feedback?.[p];
      const reason = typeof raw === "object" && raw !== null ? (raw as any).reason || "" : String(raw || "");
      const r = reason.toLowerCase();
      if (
        r.includes("not present") || r.includes("no ondraw") ||
        r.includes("no asynctask") || r.includes("does not use") ||
        r.includes("not an activity") || r.includes("does not require") ||
        r.includes("no hashmap") || r.includes("not applicable") ||
        r.includes("no object allocation")
      ) return "na";
      return "passed";
    }
    return "pending";
  }

  function cellSymbol(state: string) {
    if (state === "issue") return "●";
    if (state === "passed") return "✓";
    if (state === "na") return "—";
    return "●";  // pending — pulsing dot distinguishes it from the N/A dash
  }

  const showStatusCol = findings.length > 1;

  return (
    <div className="matrix-wrapper">
      {/* Legend above table, right-aligned */}
      <div className="matrix-header-row">
        <span className="matrix-header-title">Checks across {findings.length} file{findings.length > 1 ? "s" : ""}</span>
        <div className="matrix-legend">
          <span><span className="matrix-cell-symbol matrix-legend-dot issue">●</span>Issue</span>
          <span><span className="matrix-cell-symbol matrix-legend-dot passed">✓</span>Passed</span>
          <span><span className="matrix-cell-symbol matrix-legend-dot na">—</span>N/A</span>
        </div>
      </div>

      <div className="matrix-scroll">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="matrix-file-col">File</th>
              {PATTERNS.map((p) => (
                <th key={p} className="matrix-pattern-col" title={`${PATTERN_INFO[p].full} — ${PATTERN_INFO[p].tip}`}>
                  <span className="matrix-pattern-short">{PATTERN_INFO[p].short}</span>
                </th>
              ))}
              {showStatusCol && <th className="matrix-status-col">Status</th>}
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => {
              const issues = PATTERNS.filter((p) => f[p] === "Yes");
              const hasIssues = issues.length > 0;
              return (
                <React.Fragment key={f.id}>
                  <tr
                    className={`matrix-row ${hasIssues ? "has-issues" : ""}`}
                  >
                    <td className="matrix-file-cell" title={f.file_name}>
                      {f.file_name.split("/").pop()}
                    </td>
                    {PATTERNS.map((p) => {
                      const state = cellState(f, p);
                      return (
                        <td key={p} className={`matrix-cell matrix-cell-${state}`} title={`${PATTERN_INFO[p].short}: ${state}`}>
                          <span className="matrix-cell-symbol">{cellSymbol(state)}</span>
                        </td>
                      );
                    })}
                    {showStatusCol && (
                      <td className="matrix-status-cell">
                        {hasIssues ? (
                          <span className="matrix-status-issue">{issues.length} issue{issues.length > 1 ? "s" : ""}</span>
                        ) : f.status === "Done" ? (
                          <span className="matrix-status-clean">Clean</span>
                        ) : (
                          <span className="matrix-status-pending">{f.status}</span>
                        )}
                      </td>
                    )}
                  </tr>
                  {hasIssues && (
                    <tr className="matrix-inline-issue-row">
                      <td colSpan={PATTERNS.length + 1 + (showStatusCol ? 1 : 0)}>
                        <InlineIssueList finding={f} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          {findings.length > 1 && (
            <tfoot>
              <tr className="matrix-total-row">
                <td className="matrix-file-cell">Total</td>
                {colTotals.map((n, i) => (
                  <td key={i} className={`matrix-cell matrix-total-cell ${n > 0 ? "has-hits" : ""}`}>
                    {n > 0 ? n : "·"}
                  </td>
                ))}
                {showStatusCol && (
                  <td className="matrix-status-cell" style={{ color: "var(--fg-tertiary)", fontSize: 12 }}>
                    {colTotals.reduce((a, b) => a + b, 0)} total
                  </td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   FileCard — single-file card layout (used when totalCount === 1)
   Replaces the table-for-one-row anti-pattern
   ────────────────────────────────────────────────────── */
function FileCard({ result, expanded, onToggle }: { result: Finding; expanded: boolean; onToggle: () => void }) {
  const issues = PATTERNS.filter((p) => result[p] === "Yes");
  const hasIssue = issues.length > 0;
  const shortName = result.file_name.split("/").pop();

  return (
    <div className="file-card">
      <button className="file-card-header" onClick={onToggle}>
        <div className="file-card-info">
          <div className="file-card-name-row">
            <span className="file-card-name">{shortName}</span>
            {result.status === "Done" && !hasIssue && (
              <CheckCircle2 size={16} style={{ color: "var(--success)" }} aria-label="Clean" />
            )}
            {hasIssue && (
              <span style={{ color: "var(--danger)", fontWeight: 500, fontSize: 13 }}>
                <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                {issues.length} issue{issues.length > 1 ? "s" : ""} · {issues.join(", ")}
              </span>
            )}
            {result.status !== "Done" && (
              <span className="badge pending">{result.status}</span>
            )}
          </div>
        </div>
        {result.status === "Done" && (
          <span className="file-card-chevron">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </span>
        )}
      </button>
      {expanded && (
        <div className="file-card-body">
          <FeedbackRowContent result={result} />
        </div>
      )}
    </div>
  );
}

/**
 * Extract the feedback content (without <tr><td>) so it can be reused
 * in both the single-file card and the table's expanded row.
 */
function FeedbackRowContent({ result }: { result: Finding }) {
  const feedback = result.feedback;
  const issues = PATTERNS.filter((p) => result[p] === "Yes");
  const clean = PATTERNS.filter((p) => result[p] === "No");
  const [showCode, setShowCode] = useState(issues.length > 0);
  const [showCleanDetails, setShowCleanDetails] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(issues[0] || null);

  function getFeedbackObj(pattern: string): { reason: string; line_range?: string; suggested_fix?: string } {
    const raw = feedback?.[pattern.toUpperCase()] || feedback?.[pattern] || "";
    if (typeof raw === "object" && raw !== null) return raw as any;
    return { reason: String(raw) };
  }

  // Differentiate "actually passed" vs "N/A" based on reason text
  function isNotApplicable(reason: string): boolean {
    const r = reason.toLowerCase();
    return (
      r.includes("not present") ||
      r.includes("no onDraw") ||
      r.includes("no asynctask") ||
      r.includes("does not use") ||
      r.includes("not an activity") ||
      r.includes("does not require") ||
      r.includes("no hashmap") ||
      r.includes("not applicable")
    );
  }

  const highlightLines = new Set<number>();
  issues.forEach((p) => {
    const fb = getFeedbackObj(p);
    parseLineRange(fb.line_range).forEach((n) => highlightLines.add(n));
  });

  // ═══ Clean-only layout (no issues) ═══
  if (issues.length === 0) {
    return (
      <div className="feedback-content" style={{ padding: 0 }}>
        {clean.length > 0 && (
          <div className="clean-section">
            <button className="clean-section-toggle" onClick={() => setShowCleanDetails(!showCleanDetails)}>
              {clean.length} check{clean.length > 1 ? "s" : ""} ▾
            </button>
            {showCleanDetails && (
              <div className="clean-details">
                {clean
                  .map((p) => ({ p, na: isNotApplicable(getFeedbackObj(p).reason || "") }))
                  .sort((a, b) => Number(a.na) - Number(b.na))
                  .map(({ p, na }) => {
                    const fb = getFeedbackObj(p);
                    const info = PATTERN_INFO[p];
                    return (
                      <div key={p} className="clean-detail-item">
                        <div className="clean-detail-head">
                          <span className="clean-detail-name">
                            {info.full} <span className="clean-detail-short">({info.short})</span>
                          </span>
                          <span className={`clean-detail-tag ${na ? "na" : "passed"}`}>
                            {na ? "N/A" : "Passed"}
                          </span>
                        </div>
                        {fb.reason && <p className="clean-detail-reason">{fb.reason}</p>}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
        {result.file_content && (
          <div className="code-viewer-section">
            <div className="code-viewer-header">
              <button className="text-btn" onClick={(e) => { e.stopPropagation(); setShowCode(!showCode); }}>
                {showCode ? "Hide source" : "View source"}
              </button>
              <span className="code-viewer-filename">{result.file_name}</span>
            </div>
            {showCode && <CodeBlock code={result.file_content} />}
          </div>
        )}
      </div>
    );
  }

  // ═══ Issue-driven layout: problems panel (left) + code + fix (right) ═══
  const selected = selectedIssue && issues.includes(selectedIssue as any) ? selectedIssue : issues[0];
  const selectedFb = selected ? getFeedbackObj(selected) : null;
  const focusLine = selectedFb?.line_range ? Array.from(parseLineRange(selectedFb.line_range))[0] : undefined;

  return (
    <div className="issue-layout">
      {/* ─── Left: issues list + clean collapse ─── */}
      <aside className="issue-panel">
        <div className="issue-panel-header">
          <AlertTriangle size={14} style={{ color: "var(--danger)" }} />
          <span>Issues ({issues.length})</span>
        </div>
        <ul className="issue-list">
          {issues.map((p) => {
            const fb = getFeedbackObj(p);
            const info = PATTERN_INFO[p];
            const isActive = selected === p;
            return (
              <li key={p}>
                <button
                  className={`issue-list-item ${isActive ? "active" : ""}`}
                  onClick={() => setSelectedIssue(p)}
                >
                  <div className="issue-list-name">{info.full}</div>
                  <div className="issue-list-meta">
                    <span className="issue-list-short">{info.short}</span>
                    {fb.line_range && <span className="issue-list-line">· Line {fb.line_range}</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {clean.length > 0 && (
          <div className="issue-panel-footer">
            <button className="clean-section-toggle" onClick={() => setShowCleanDetails(!showCleanDetails)}>
              {clean.length} other check{clean.length > 1 ? "s" : ""} {showCleanDetails ? "▴" : "▾"}
            </button>
            {showCleanDetails && (
              <div className="clean-details" style={{ marginTop: 4 }}>
                {clean
                  .map((p) => ({ p, na: isNotApplicable(getFeedbackObj(p).reason || "") }))
                  .sort((a, b) => Number(a.na) - Number(b.na))
                  .map(({ p, na }) => {
                    const info = PATTERN_INFO[p];
                    return (
                      <div key={p} className="clean-detail-item">
                        <div className="clean-detail-head">
                          <span className="clean-detail-name">
                            <span className={`clean-detail-icon ${na ? "na" : "passed"}`}>
                              {na ? <Minus size={12} /> : <Check size={12} />}
                            </span>
                            {info.full} <span className="clean-detail-short">{info.short}</span>
                          </span>
                          <span className={`clean-detail-tag ${na ? "na" : "passed"}`}>
                            {na ? "N/A" : "Passed"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ─── Right: code + selected fix ─── */}
      <main className="issue-main">
        {result.file_content && (
          <div className="issue-code">
            <div className="issue-code-header">
              <span className="code-viewer-filename">{result.file_name}</span>
              <span style={{ color: "var(--danger)", fontSize: 11, fontWeight: 500 }}>
                {highlightLines.size} line{highlightLines.size > 1 ? "s" : ""} flagged
              </span>
            </div>
            <CodeBlock
              code={result.file_content}
              highlightLines={highlightLines}
              focusLine={focusLine}
            />
          </div>
        )}

        {selectedFb && (
          <div className="issue-fix-panel">
            <div className="issue-fix-header">
              <span className="issue-fix-tag">{PATTERN_INFO[selected!].short}</span>
              <h4 className="issue-fix-title">{PATTERN_INFO[selected!].full}</h4>
              {selectedFb.line_range && (
                <span className="issue-fix-line">Line {selectedFb.line_range}</span>
              )}
            </div>

            {selectedFb.reason && (
              <div className="issue-fix-section">
                <div className="issue-fix-section-label">Why it's a problem</div>
                <p className="issue-fix-section-text">{selectedFb.reason}</p>
              </div>
            )}

            {selectedFb.suggested_fix ? (
              <div className="issue-fix-section issue-fix-highlight">
                <div className="issue-fix-section-label">Suggested fix</div>
                <p className="issue-fix-section-text">{selectedFb.suggested_fix}</p>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--fg-tertiary)", fontStyle: "italic", marginTop: 8 }}>
                No fix suggestion available (run from older prompt version).
              </p>
            )}
          </div>
        )}
      </main>
    </div>
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

  // Note: no auto-select — user clicks matrix row to open drawer

  // Close drawer on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && expandedRows.size > 0) {
        setExpandedRows(new Set());
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedRows.size]);

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
  const backTo = run.project_id ? `/projects/${run.project_id}` : "/";

  // Four-state classification now comes directly from backend:
  // "Yes" = issue, "No" = passed, "NA" = not applicable, "" = pending
  // Legacy runs (before migration) may still have "No" meaning either —
  // we fall back to the reason-text heuristic only for those.
  function isLegacyNa(reason: string): boolean {
    const r = reason.toLowerCase();
    return (
      r.includes("not present") || r.includes("no ondraw") ||
      r.includes("no asynctask") || r.includes("does not use") ||
      r.includes("not an activity") || r.includes("does not require") ||
      r.includes("no hashmap") || r.includes("not applicable") ||
      r.includes("no object allocation")
    );
  }

  let passedCount = 0;
  let naCount = 0;
  findings.forEach((f) => {
    PATTERNS.forEach((p) => {
      const verdict = f[p];
      if (verdict === "NA") {
        naCount++;
      } else if (verdict === "No") {
        // Legacy fallback — reason-based classification
        const raw = f.feedback?.[p.toUpperCase()] || f.feedback?.[p];
        const reason = typeof raw === "object" && raw !== null ? (raw as any).reason || "" : String(raw || "");
        if (isLegacyNa(reason)) naCount++;
        else passedCount++;
      }
    });
  });

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
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Projects</Link>
        <span className="breadcrumb-sep">/</span>
        <Link to={backTo}>{projectName}</Link>
        <span className="breadcrumb-sep">/</span>
        <span>Run #{run.id}</span>
      </nav>

      <div className="page-header">
        <div>
          <h2>Run #{run.id}</h2>
          <div className="run-meta-inline" style={{ marginTop: 4, marginBottom: 0 }}>
            <span>{run.source_type === "repo" ? "GitHub" : "File Upload"}</span>
            <span className="meta-sep">·</span>
            <span>{doneCount}/{totalCount} files</span>
            <span className="meta-sep">·</span>
            <span className="time-relative" title={new Date(run.created_at).toLocaleString()}>
              {relativeTime(run.created_at)}
            </span>
            {run.description && (
              <><span className="meta-sep">·</span><span style={{ color: "var(--fg-tertiary)" }}>{run.description}</span></>
            )}
          </div>
        </div>
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
          <div style={{ width: 8 }} />
          <button className="icon-btn-danger" style={{ opacity: 1 }} onClick={() => setConfirmDelete(true)} title="Delete run" aria-label="Delete run">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Progress bar (only while running) */}
      {run.status !== "Done" && totalCount > 0 && (
        <div className="progress-bar-wrapper" style={{ marginTop: 16 }}>
          <div className="progress-bar-fill" style={{ width: `${(doneCount / totalCount) * 100}%` }} />
        </div>
      )}

      {/* ─── Conclusion banner (primary headline, not 3 equal-weight stats) ─── */}
      {run.status === "Done" && totalCount > 0 && (
        <div className={`conclusion-banner ${issueCount > 0 ? "has-issues" : "clean"}`}>
          <div className="conclusion-icon">
            {issueCount > 0 ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
          </div>
          <div className="conclusion-content">
            <h3 className="conclusion-title">
              {issueCount > 0
                ? `${issueCount} issue${issueCount > 1 ? "s" : ""} found`
                : "All checks passed"}
            </h3>
            <p className="conclusion-sub">
              {totalCount} file{totalCount > 1 ? "s" : ""} scanned ·{" "}
              <span className="conclusion-stat-passed">{passedCount} passed</span> ·{" "}
              <span className="conclusion-stat-na">{naCount} not applicable</span>
            </p>
          </div>
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
        <MatrixView
          findings={displayFindings}
          selectedFinding={null}
          onSelectCell={() => {}}
        />
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
