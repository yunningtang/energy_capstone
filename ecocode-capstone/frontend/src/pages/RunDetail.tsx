import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FileWarning, CheckCircle2, Check, Minus, Clock, ChevronDown, ChevronUp,
  AlertTriangle, Trash2, Loader2,
} from "lucide-react";
import { getFindings, getRun, deleteRun, getProject, cancelRun, retryRun } from "../services/api";
import CodeBlock, { parseLineRange, LineAnnotation } from "../components/CodeBlock";
import DiffView from "../components/DiffView";
import SeverityBadge from "../components/SeverityBadge";
import ExportMenu from "../components/ExportMenu";
import { Finding, Run } from "../types";
import ConfirmDialog from "../components/ConfirmDialog";
import { severityOf, countBySeverity } from "../lib/severity";

/** Fallback diff templates shown when the LLM didn't return fixed_snippet.
    Intentionally stubby / pedagogical — marked as "Preview" in the UI so the
    user knows it's a template, not engine output. */
const PATTERN_FIX_TEMPLATES: Record<string, { before: string; after: string }> = {
  dw: {
    before: `wakeLock.acquire();\n// work...\n// no release on exception path`,
    after:  `wakeLock.acquire(10 * 60 * 1000L);\ntry {\n    doWork();\n} finally {\n    if (wakeLock.isHeld())\n        wakeLock.release();\n}`,
  },
  has: {
    before: `protected void onPostExecute(Result r) {\n    database.writeAll(r.rows);   // I/O on UI thread\n}`,
    after:  `protected void onPostExecute(Result r) {\n    executor.submit(() -> database.writeAll(r.rows));\n}`,
  },
  iod: {
    before: `public void onDraw(Canvas c) {\n    Paint p = new Paint();\n    c.drawCircle(cx, cy, r, p);\n}`,
    after:  `private final Paint p = new Paint();\npublic void onDraw(Canvas c) {\n    c.drawCircle(cx, cy, r, p);\n}`,
  },
  hmu: {
    before: `Map<Integer, String> cache = new HashMap<>();`,
    after:  `SparseArray<String> cache = new SparseArray<>();`,
  },
  nlmr: {
    before: `public class MyService extends Service {\n    // no onTrimMemory / onLowMemory\n}`,
    after:  `public class MyService extends Service {\n    @Override\n    public void onTrimMemory(int level) {\n        if (level >= TRIM_MEMORY_RUNNING_MODERATE) {\n            imageCache.evictAll();\n        }\n    }\n}`,
  },
};

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


/* ──────────────────────────────────────────────────────
   TableView — Safwat's original spec (rows=files, cols=patterns).
   Upgrade: cells encode severity via a colored dot rather than
   flat text, and pattern headers show their severity tier.
   Reads the exact same Results_Details data as InspectorView.
   ────────────────────────────────────────────────────── */
function TableView({
  findings,
  expandedRows,
  onToggleRow,
  headerSlot,
}: {
  findings: Finding[];
  expandedRows: Set<number>;
  onToggleRow: (id: number) => void;
  headerSlot?: React.ReactNode;
}) {
  const colTotals = PATTERNS.map((p) => findings.filter((f) => f[p] === "Yes").length);

  function cellState(f: Finding, p: typeof PATTERNS[number]): "issue" | "passed" | "na" | "pending" {
    if (f.status !== "Done") return "pending";
    const v = f[p];
    if (v === "Yes") return "issue";
    if (v === "NA") return "na";
    if (v === "No") return "passed";
    return "pending";
  }

  function getFeedback(f: Finding, p: string): { reason?: string; line_range?: string; suggested_fix?: string; fixed_snippet?: string } {
    const raw = f.feedback?.[p.toUpperCase()] || f.feedback?.[p];
    if (typeof raw === "object" && raw !== null) return raw as any;
    if (raw) return { reason: String(raw) };
    return {};
  }

  return (
    <div className="matrix-wrapper">
      <div className="matrix-header-row">
        <span className="matrix-header-title">
          Checks across {findings.length} file{findings.length > 1 ? "s" : ""}
        </span>
        {headerSlot}
      </div>

      <div className="matrix-scroll">
        <table className="matrix-table">
          <thead>
            <tr>
              <th className="matrix-idx-col" scope="col">#</th>
              <th className="matrix-file-col" scope="col">File</th>
              <th className="matrix-status-col" scope="col">Issues</th>
              {PATTERNS.map((p) => {
                const info = PATTERN_INFO[p];
                return (
                  <th key={p} className="matrix-pattern-col" scope="col" title={`${info.full} — ${info.tip}`}>
                    {info.short}
                  </th>
                );
              })}
              <th className="matrix-chevron-col" aria-label="Expand" />
            </tr>
          </thead>
          <tbody>
            {findings.map((f, idx) => {
              const issues = PATTERNS.filter((p) => f[p] === "Yes");
              const hasIssues = issues.length > 0;
              const isExpanded = expandedRows.has(f.id);

              return (
                <React.Fragment key={f.id}>
                  <tr
                    className={`matrix-row ${hasIssues ? "has-issues" : ""} clickable`}
                    onClick={() => onToggleRow(f.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") onToggleRow(f.id); }}
                    aria-expanded={isExpanded}
                  >
                    <td className="matrix-idx-cell">{idx + 1}</td>
                    <td className="matrix-file-cell" title={f.file_name}>
                      {f.file_name.split("/").pop()}
                    </td>
                    <td className="matrix-status-cell">
                      {f.status !== "Done" ? (
                        <span className="badge pending">{f.status}</span>
                      ) : hasIssues ? (() => {
                        const maxSev = issues
                          .map((p) => severityOf(PATTERN_INFO[p].short))
                          .reduce<"critical" | "major" | "minor">((acc, s) => {
                            const rank = { critical: 3, major: 2, minor: 1 } as const;
                            return rank[s] > rank[acc] ? s : acc;
                          }, "minor");
                        return (
                          <span className={`matrix-status-issue sev-${maxSev}`}>
                            <span className={`sev-dot sev-dot-${maxSev}`} />{" "}
                            {issues.length} {maxSev}
                          </span>
                        );
                      })() : (
                        <span className="matrix-status-clean">Clean</span>
                      )}
                    </td>
                    {PATTERNS.map((p) => {
                      const state = cellState(f, p);
                      const sev = severityOf(PATTERN_INFO[p].short);
                      return (
                        <td key={p} className={`matrix-cell matrix-cell-${state}`}>
                          {state === "issue" ? (
                            <span className="cell-verdict cell-verdict-yes">
                              <span className={`sev-dot sev-dot-${sev}`} /> Yes
                            </span>
                          ) : state === "passed" ? (
                            <span className="cell-verdict cell-verdict-no">
                              <Check size={12} /> No
                            </span>
                          ) : state === "na" ? (
                            <span className="cell-verdict cell-verdict-na">
                              <Minus size={12} /> N/A
                            </span>
                          ) : (
                            <span className="cell-verdict cell-verdict-pending">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="matrix-chevron-cell">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="matrix-detail-row">
                      <td colSpan={PATTERNS.length + 4}>
                        <div className="matrix-detail">
                          {hasIssues ? (
                            issues.map((p) => {
                              const fb = getFeedback(f, p);
                              return (
                                <div key={p} className="matrix-detail-issue">
                                  <div className="matrix-detail-head">
                                    <SeverityBadge severity={severityOf(PATTERN_INFO[p].short)} />
                                    <span className="matrix-detail-pattern">{PATTERN_INFO[p].full} ({PATTERN_INFO[p].short})</span>
                                    {fb.line_range && <span className="matrix-detail-line">line {fb.line_range}</span>}
                                  </div>
                                  {fb.reason && <p className="matrix-detail-reason">{fb.reason}</p>}
                                  {fb.suggested_fix && (
                                    <p className="matrix-detail-fix">
                                      <span className="matrix-detail-fix-label">Fix:</span> {fb.suggested_fix}
                                    </p>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <p className="matrix-detail-clean">All checks passed for this file.</p>
                          )}
                        </div>
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
                <td />
                <td className="matrix-file-cell">Total</td>
                <td />
                {colTotals.map((n, i) => (
                  <td key={i} className={`matrix-cell matrix-total-cell ${n > 0 ? "has-hits" : ""}`}>
                    {n > 0 ? n : "·"}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   InspectorView — 3-column shell inspired by VOLTAIC mockup:
   left: file list with issue counts
   center: selected file's source with inline annotations
   right: selected issue's diagnosis + diff
   ────────────────────────────────────────────────────── */
function InspectorView({ findings }: { findings: Finding[] }) {
  const filesWithIssues = findings.filter((f) => PATTERNS.some((p) => f[p] === "Yes"));
  const firstInteresting = filesWithIssues[0] ?? findings[0];
  const [selectedFileId, setSelectedFileId] = React.useState<number | null>(firstInteresting?.id ?? null);
  const [selectedPattern, setSelectedPattern] = React.useState<string | null>(null);
  const [stageMode, setStageMode] = React.useState<"code" | "diff">("code");

  React.useEffect(() => {
    if (selectedFileId == null && firstInteresting) setSelectedFileId(firstInteresting.id);
  }, [firstInteresting, selectedFileId]);

  const selectedFile = findings.find((f) => f.id === selectedFileId) ?? null;
  const fileIssues = selectedFile ? PATTERNS.filter((p) => selectedFile[p] === "Yes") : [];

  // Reset selected pattern when file changes
  React.useEffect(() => {
    setSelectedPattern(fileIssues[0] ?? null);

  }, [selectedFileId]);

  function getFeedback(f: Finding, p: string): {
    reason?: string;
    line_range?: string;
    suggested_fix?: string;
    original_snippet?: string;
    fixed_snippet?: string;
  } {
    const raw = f.feedback?.[p.toUpperCase()] || f.feedback?.[p];
    if (typeof raw === "object" && raw !== null) return raw as any;
    if (raw) return { reason: String(raw) };
    return {};
  }

  // Build annotations map for the selected file
  const { highlightLines, annotations } = React.useMemo(() => {
    const hl = new Set<number>();
    const ann = new Map<number, LineAnnotation[]>();
    if (!selectedFile) return { highlightLines: hl, annotations: ann };
    // Anchor each issue to a single line — the first line of its range —
    // so we don't paint the wavy underline + row tint over a 15-line block.
    // The pill + gutter marker on the anchor line is enough signal.
    fileIssues.forEach((p) => {
      const fb = getFeedback(selectedFile, p);
      const lines = Array.from(parseLineRange(fb.line_range)).sort((a, b) => a - b);
      if (lines.length === 0) return;
      const anchor = lines[0];
      const info = PATTERN_INFO[p];
      const sev = severityOf(info.short);
      hl.add(anchor);
      const prev = ann.get(anchor) ?? [];
      prev.push({
        tag: info.short,
        message: fb.reason || info.full,
        severity: sev === "critical" ? "error" : "warning",
      });
      ann.set(anchor, prev);
    });
    return { highlightLines: hl, annotations: ann };
  }, [selectedFile, fileIssues]);

  const selectedFb = selectedFile && selectedPattern ? getFeedback(selectedFile, selectedPattern) : null;
  const focusLine = selectedFb?.line_range ? Array.from(parseLineRange(selectedFb.line_range))[0] : undefined;
  const diffStart = React.useMemo(() => {
    if (!selectedFb?.line_range) return undefined;
    const m = /(\d+)/.exec(selectedFb.line_range);
    return m ? parseInt(m[1], 10) : undefined;
  }, [selectedFb?.line_range]);

  if (findings.length === 0) return null;

  const singleFile = findings.length === 1;

  return (
    <div className={`run-shell ${singleFile ? "run-shell-single" : ""} ${stageMode === "diff" ? "run-shell-diff" : ""}`}>
      {/* ── LEFT: file list (hidden when there's only one file — that column
              is dead weight and steals ~180px from the code panel;
              also hidden in diff mode because diff needs full width) ─── */}
      {!singleFile && stageMode !== "diff" && (
        <aside className="run-files">
          <div className="run-files-label">Files ({findings.length})</div>
          <ul className="run-files-list">
            {findings.map((f) => {
              const issues = PATTERNS.filter((p) => f[p] === "Yes");
              const n = issues.length;
              const active = f.id === selectedFileId;
              const short = f.file_name.split("/").pop() || f.file_name;
              return (
                <li key={f.id}>
                  <button
                    className={`run-file-item ${active ? "active" : ""}`}
                    onClick={() => setSelectedFileId(f.id)}
                    title={f.file_name}
                  >
                    <span className="run-file-name">{short}</span>
                    {n > 0 ? (
                      <span className="run-file-count">{n}</span>
                    ) : f.status === "Done" ? (
                      <Check size={12} className="run-file-check" />
                    ) : (
                      <span className="run-file-pending">·</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      )}

      {/* ── CENTER: stage ─ Code ⇄ Diff toggle ────────────── */}
      <main className="run-stage">
        {selectedFile ? (() => {
          // Diff mode needs an active pattern and at least a template to show.
          const activeFb = selectedPattern ? getFeedback(selectedFile, selectedPattern) : null;
          const template = selectedPattern ? PATTERN_FIX_TEMPLATES[selectedPattern] : undefined;
          const diffAfter = activeFb?.fixed_snippet ?? template?.after ?? "";
          const diffBefore = activeFb?.original_snippet ?? (activeFb?.fixed_snippet ? "" : template?.before ?? "");
          const isTemplate = !activeFb?.fixed_snippet && !!template;
          const canDiff = !!diffAfter;
          const mode = canDiff ? stageMode : "code";
          const copyPatch = () => {
            const fileName = selectedFile.file_name.split("/").pop() || "file.java";
            const payload = mode === "diff"
              ? `# ${PATTERN_INFO[selectedPattern!].short} — ${PATTERN_INFO[selectedPattern!].full}\n# File: ${fileName}\n\n--- Before\n${diffBefore}\n\n+++ After\n${diffAfter}\n`
              : selectedFile.file_content || "";
            navigator.clipboard?.writeText(payload);
          };
          return (
            <>
              <div className="run-stage-header">
                <span className="run-stage-file">{selectedFile.file_name}</span>
                <span className="run-stage-spacer" />
                {canDiff && (
                  <div className="stage-mode-toggle" role="tablist" aria-label="View mode">
                    <button
                      role="tab"
                      aria-selected={mode === "code"}
                      className={`stage-mode-btn ${mode === "code" ? "active" : ""}`}
                      onClick={() => setStageMode("code")}
                    >
                      Full code
                    </button>
                    <button
                      role="tab"
                      aria-selected={mode === "diff"}
                      className={`stage-mode-btn ${mode === "diff" ? "active" : ""}`}
                      onClick={() => setStageMode("diff")}
                    >
                      Diff {isTemplate && <span className="preview-tag">Preview</span>}
                    </button>
                  </div>
                )}
                <span className="run-stage-meta">
                  {mode === "code" && selectedFile.file_content
                    ? `${selectedFile.file_content.split("\n").length} lines`
                    : ""}
                </span>
                {mode === "code" && fileIssues.length > 0 && (
                  <span className="run-stage-issues">
                    {fileIssues.length} issue{fileIssues.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {/* Diff-only strip — replaces the (hidden) inspector with a
                  compact issue header right above the before/after grid. */}
              {mode === "diff" && selectedPattern && activeFb && (
                <div className="run-stage-diff-strip">
                  <div className="run-stage-diff-strip-title">
                    <span className="run-stage-diff-pattern-chip">{PATTERN_INFO[selectedPattern].short}</span>
                    <span className="run-stage-diff-pattern-name">{PATTERN_INFO[selectedPattern].full}</span>
                    <SeverityBadge severity={severityOf(PATTERN_INFO[selectedPattern].short)} />
                  </div>
                  <div className="run-stage-diff-strip-actions">
                    <button className="copy-btn" onClick={copyPatch} title="Copy unified patch">
                      Copy patch
                    </button>
                    <Link
                      to={`/rules#rule-${PATTERN_INFO[selectedPattern].short}`}
                      className="run-inspector-rules-link"
                    >
                      Learn more →
                    </Link>
                  </div>
                </div>
              )}
              <div className="run-stage-code">
                {mode === "diff" && canDiff ? (
                  <div className="run-stage-diff">
                    <DiffView
                      before={diffBefore}
                      after={diffAfter}
                      startLine={diffStart}
                    />
                  </div>
                ) : selectedFile.file_content ? (
                  <CodeBlock
                    code={selectedFile.file_content}
                    highlightLines={highlightLines}
                    focusLine={focusLine}
                    annotations={annotations}
                  />
                ) : (
                  <div className="run-stage-empty">Source not available.</div>
                )}
              </div>
            </>
          );
        })() : (
          <div className="run-stage-empty">Select a file from the list.</div>
        )}
      </main>

      {/* ── RIGHT: inspector (hidden in diff mode — stage takes full width) ── */}
      {stageMode !== "diff" && (
      <aside className="run-inspector">
        {selectedFile && fileIssues.length > 0 ? (
          <>
            <div className="run-inspector-tabs">
              {fileIssues.map((p) => (
                <button
                  key={p}
                  className={`run-inspector-tab ${selectedPattern === p ? "active" : ""}`}
                  onClick={() => setSelectedPattern(p)}
                >
                  {PATTERN_INFO[p].short}
                </button>
              ))}
            </div>
            {selectedFb && selectedPattern && (
              <div className="run-inspector-body">
                <div className="run-inspector-head">
                  <div className="run-inspector-title-row">
                    <div className="run-inspector-pattern">{PATTERN_INFO[selectedPattern].full}</div>
                    <SeverityBadge severity={severityOf(PATTERN_INFO[selectedPattern].short)} />
                  </div>
                  <div className="run-inspector-head-actions">
                    {selectedFb.line_range && (
                      <button
                        className="run-inspector-loc-link"
                        onClick={() => {
                          const first = Array.from(parseLineRange(selectedFb.line_range!))[0];
                          if (first) {
                            const el = document.querySelector<HTMLElement>(`[data-line="${first}"]`);
                            el?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }
                        }}
                      >
                        Line {selectedFb.line_range} →
                      </button>
                    )}
                    <Link
                      to={`/rules#rule-${PATTERN_INFO[selectedPattern].short}`}
                      className="run-inspector-rules-link"
                    >
                      Learn more →
                    </Link>
                  </div>
                </div>
                {selectedFb.reason && (
                  <section className="run-inspector-section">
                    <div className="run-inspector-label">Diagnosis</div>
                    <p className="run-inspector-text">{selectedFb.reason}</p>
                  </section>
                )}
                {(() => {
                  // Inspector now only carries description + copy.  The diff itself lives
                  // on the stage (Code ⇄ Diff toggle), so we don't render it twice.
                  const template = PATTERN_FIX_TEMPLATES[selectedPattern];
                  const hasEngineFix = !!selectedFb.fixed_snippet;
                  const isPreview = !hasEngineFix && !!template;
                  const copyTarget = selectedFb.fixed_snippet || template?.after || selectedFb.suggested_fix || "";
                  const hasAny = selectedFb.suggested_fix || copyTarget;
                  return hasAny && (
                    <section className="run-inspector-section">
                      <div className="run-inspector-label-row">
                        <span className="run-inspector-label">
                          Suggested fix
                          {isPreview && <span className="preview-tag" title="Template preview — engine did not return a verbatim fix">Preview</span>}
                        </span>
                        {copyTarget && (
                          <button
                            className="copy-btn"
                            onClick={() => navigator.clipboard?.writeText(copyTarget)}
                            title={selectedFb.fixed_snippet ? "Copy code" : isPreview ? "Copy template" : "Copy description"}
                          >
                            Copy
                          </button>
                        )}
                      </div>
                      {selectedFb.suggested_fix && (
                        <p className="run-inspector-text">{selectedFb.suggested_fix}</p>
                      )}
                      <button
                        className="run-inspector-show-diff"
                        onClick={() => setStageMode("diff")}
                      >
                        View diff →
                      </button>
                    </section>
                  );
                })()}
              </div>
            )}
          </>
        ) : selectedFile ? (
          <div className="run-inspector-empty">
            <CheckCircle2 size={20} />
            <div className="run-inspector-empty-title">No issues in this file</div>
            <div className="run-inspector-empty-sub">
              Select a different file from the list to inspect its findings.
            </div>
          </div>
        ) : null}
      </aside>
      )}
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [projectName, setProjectName] = useState("Project");
  const [activeView, setActiveView] = useState<"table" | "code">("table");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

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

  useEffect(() => {
    function onKey(_e: KeyboardEvent) { /* reserved for future keyboard nav */ }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // Severity roll-up
  const severityCounts = countBySeverity(
    findings.flatMap((f) =>
      PATTERNS.map((p) => ({ pattern: PATTERN_INFO[p].short, hasIssue: f[p] === "Yes" }))
    )
  );

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

  function download(name: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportCsv() {
    const header = "file,status,dw,hmu,has,iod,nlmr\n";
    const rows = findings.map((f) =>
      `${f.file_name},${f.status},${f.dw || ""},${f.hmu || ""},${f.has || ""},${f.iod || ""},${f.nlmr || ""}`
    ).join("\n");
    download(`run-${run!.id}-results.csv`, header + rows, "text/csv");
  }
  function exportJson() {
    const payload = {
      run: { id: run!.id, status: run!.status, source_type: run!.source_type, created_at: run!.created_at },
      findings: findings.map(f => ({
        file: f.file_name, status: f.status,
        dw: f.dw, hmu: f.hmu, has: f.has, iod: f.iod, nlmr: f.nlmr,
        feedback: f.feedback,
      })),
    };
    download(`run-${run!.id}-results.json`, JSON.stringify(payload, null, 2), "application/json");
  }
  function exportMarkdown() {
    const header = `# Run #${run!.id} — Energy Analysis\n\n` +
      `Source: ${run!.source_type} · Files: ${findings.length} · ${new Date(run!.created_at).toLocaleString()}\n\n`;
    const body = findings.map((f) => {
      const issues = (["dw","hmu","has","iod","nlmr"] as const).filter(p => f[p] === "Yes");
      if (issues.length === 0) return `## ${f.file_name}\n\nClean.\n`;
      const lines = [`## ${f.file_name}\n`];
      issues.forEach(p => {
        const raw = f.feedback?.[p.toUpperCase()] || f.feedback?.[p];
        const fb = typeof raw === "object" && raw !== null ? raw as any : { reason: String(raw || "") };
        lines.push(`### ${p.toUpperCase()}${fb.line_range ? ` (line ${fb.line_range})` : ""}\n`);
        if (fb.reason) lines.push(fb.reason + "\n");
        if (fb.suggested_fix) lines.push(`**Fix:** ${fb.suggested_fix}\n`);
      });
      return lines.join("\n");
    }).join("\n\n---\n\n");
    download(`run-${run!.id}-report.md`, header + body, "text/markdown");
  }

  const displayFindings = issuesOnly
    ? findings.filter((f) => getFileIssues(f).length > 0)
    : findings;

  return (
    <div className="page run-detail-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Projects</Link>
        <span className="breadcrumb-sep">/</span>
        <Link to={backTo}>{projectName}</Link>
      </nav>

      <div className="page-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="page-title-sm">Run #{run.id}</h2>
          <p className="meta-line">
            <span>{run.source_type === "repo" ? "GitHub" : "Uploaded"}</span>
            <span className="meta-sep">·</span>
            <span>{totalCount} {totalCount === 1 ? "file" : "files"}</span>
            <span className="meta-sep">·</span>
            <span>{run.status}</span>
            <span className="meta-sep">·</span>
            <span title={new Date(run.created_at).toLocaleString()}>
              {relativeTime(run.created_at)}
            </span>
            {run.description && (
              <>
                <span className="meta-sep">·</span>
                <span className="meta-desc">{run.description}</span>
              </>
            )}
          </p>
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
            <ExportMenu
              onCsv={exportCsv}
              onJson={exportJson}
              onMarkdown={exportMarkdown}
            />
          )}
          <button
            className="btn outline btn-sm btn-icon btn-icon-danger"
            onClick={() => setConfirmDelete(true)}
            title="Delete run"
            aria-label="Delete run"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Progress strip — shown while a run is still executing.
          Surfaces: percent complete, currently-analyzing file, rough ETA. */}
      {run.status !== "Done" && totalCount > 0 && (() => {
        const percent = Math.round((doneCount / totalCount) * 100);
        const currentFile = findings.find(f => f.status === "Analyzing") || findings.find(f => f.status === "Pending");
        // Empirical: roughly 3–6s per file once batched; show a window rather
        // than a single number so users don't over-anchor on the estimate.
        const remainingFiles = Math.max(0, totalCount - doneCount);
        const etaLow = remainingFiles * 3;
        const etaHigh = remainingFiles * 6;
        const etaText = remainingFiles === 0
          ? "Wrapping up…"
          : remainingFiles <= 2
            ? `~${etaHigh}s remaining`
            : `~${Math.ceil(etaLow / 60)}–${Math.ceil(etaHigh / 60)} min remaining`;
        return (
          <div className="run-progress-strip">
            <div className="run-progress-header">
              <span className="run-progress-label">
                <Loader2 size={14} className="run-progress-spin" />
                Analyzing {doneCount} / {totalCount} files · {percent}%
              </span>
              <span className="run-progress-eta">{etaText}</span>
            </div>
            <div className="progress-bar-wrapper">
              <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            {currentFile && (
              <div className="run-progress-current">
                <span className="run-progress-current-label">Currently analyzing</span>
                <span className="run-progress-current-file">{currentFile.file_name}</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Hero banner — tone tracks the most severe issue present.
          critical → red, major → amber, minor → yellow, none → green. */}
      {run.status === "Done" && totalCount > 0 && (() => {
        if (issueCount === 0) {
          return (
            <div className="issue-banner issue-banner-success">
              <CheckCircle2 size={16} />
              <span>All checks passed · {totalCount} file{totalCount > 1 ? "s" : ""} scanned{naCount > 0 && ` · ${naCount} N/A`}</span>
            </div>
          );
        }
        const topSev: "critical" | "major" | "minor" =
          severityCounts.critical > 0 ? "critical" :
          severityCounts.major > 0 ? "major" : "minor";
        return (
          <div className={`issue-banner issue-banner-${topSev}`}>
            <AlertTriangle size={16} />
            <span><strong>{issueCount} issue{issueCount > 1 ? "s" : ""}</strong> found in {findings.filter(f => getFileIssues(f).length > 0).length} of {totalCount} file{totalCount > 1 ? "s" : ""}</span>
            <span className="issue-banner-sev">
              {severityCounts.critical > 0 && <><span className="sev-dot sev-dot-critical" /> {severityCounts.critical} critical</>}
              {severityCounts.major > 0 && <><span className="sev-dot sev-dot-major" /> {severityCounts.major} major</>}
              {severityCounts.minor > 0 && <><span className="sev-dot sev-dot-minor" /> {severityCounts.minor} minor</>}
            </span>
          </div>
        );
      })()}

      {/* Legend row — spell out the 5 abbreviations */}
      {totalCount > 0 && (
        <div className="pattern-legend">
          {PATTERNS.map((p) => (
            <Link
              key={p}
              to={`/rules#rule-${PATTERN_INFO[p].short}`}
              className="pattern-legend-item"
              title={`Learn about ${PATTERN_INFO[p].full}`}
            >
              <strong>{PATTERN_INFO[p].short}</strong>{PATTERN_INFO[p].full}
            </Link>
          ))}
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
      ) : (() => {
          const tabs = (
            <div className="view-tabs" role="tablist" aria-label="View mode">
              <button
                role="tab"
                aria-selected={activeView === "table"}
                className={`view-tab ${activeView === "table" ? "active" : ""}`}
                onClick={() => setActiveView("table")}
              >
                Table view
              </button>
              <button
                role="tab"
                aria-selected={activeView === "code"}
                className={`view-tab ${activeView === "code" ? "active" : ""}`}
                onClick={() => setActiveView("code")}
              >
                Code view
              </button>
            </div>
          );
          const allIds = displayFindings.map(f => f.id);
          const allExpanded = allIds.length > 0 && allIds.every(id => expandedRows.has(id));
          // Hide the filter/expand toolbar when there's nothing to filter or expand
          // (single-file runs). The controls add noise without value at that scale.
          const showToolbar = findings.length > 1;
          const toolbar = showToolbar ? (
            <div className="table-toolbar">
              <label className="issues-only-check">
                <input
                  type="checkbox"
                  checked={issuesOnly}
                  onChange={(e) => setIssuesOnly(e.target.checked)}
                />
                <span>Issues only</span>
              </label>
              <button
                className="text-btn"
                onClick={() => {
                  if (allExpanded) setExpandedRows(new Set());
                  else setExpandedRows(new Set(allIds));
                }}
              >
                {allExpanded ? "Collapse all" : "Expand all"}
              </button>
            </div>
          ) : null;
          return activeView === "table" ? (
            <>
              {toolbar}
              <TableView
                findings={displayFindings}
                expandedRows={expandedRows}
                onToggleRow={toggleRow}
                headerSlot={tabs}
              />
            </>
          ) : (
            <>
              <div className="section-header-row section-header-row-end">
                {tabs}
              </div>
              <InspectorView findings={displayFindings} />
            </>
          );
        })()}

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
