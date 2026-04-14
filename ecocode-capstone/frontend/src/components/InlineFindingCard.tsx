import React from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { tokenizeLine, renderTokens } from "./CodeBlock";
import SeverityBadge from "./SeverityBadge";
import { PatternFeedback } from "../types";

/**
 * Inline finding card — Copilot/GitHub PR review style.
 *
 * Rendered directly inside the code flow, right below the affected line.
 * Collapsed by default; a single-line pill shows pattern + severity + line.
 * Expanded: diagnosis, suggested change as a mini unified diff (red -/green +),
 * copy action, learn-more link.
 */

export interface InlineFindingCardProps {
  patternShort: string;
  patternFull: string;
  severity: "minor" | "major" | "critical";
  feedback: PatternFeedback;
  fallbackExample?: string;
  lineRange?: string;
  expanded: boolean;
  onToggle: () => void;
  originalLines?: string[];  // the actual source lines the issue anchors to
}

/** Render a unified-diff block (-/+) with Java syntax highlighting. */
function SuggestedChange({
  beforeLines,
  afterLines,
  startLine,
}: {
  beforeLines: string[];
  afterLines: string[];
  startLine?: number;
}) {
  const rows: { op: "remove" | "add"; text: string; num: number | "" }[] = [];
  let n = startLine ?? 1;
  beforeLines.forEach((l) => {
    rows.push({ op: "remove", text: l, num: n++ });
  });
  n = startLine ?? 1;
  afterLines.forEach((l) => {
    rows.push({ op: "add", text: l, num: n++ });
  });
  return (
    <pre className="ifc-diff">
      {rows.map((r, i) => (
        <div key={i} className={`ifc-diff-row ifc-diff-row-${r.op}`}>
          <span className="ifc-diff-num">{r.num}</span>
          <span className="ifc-diff-marker">{r.op === "remove" ? "−" : "+"}</span>
          <span className="ifc-diff-content">
            {renderTokens(tokenizeLine(r.text), `ifc-${i}`)}
          </span>
        </div>
      ))}
    </pre>
  );
}

export default function InlineFindingCard({
  patternShort,
  patternFull,
  severity,
  feedback,
  fallbackExample,
  lineRange,
  expanded,
  onToggle,
  originalLines,
}: InlineFindingCardProps) {
  const summary =
    feedback.diagnosis_summary ||
    (feedback.reason ? feedback.reason.split(/(?<=\.)\s/)[0] : "") ||
    patternFull;
  const explanation = feedback.reason || "";
  const fixDesc = feedback.suggested_fix || "";
  const locationHint = feedback.location_hint || "";
  const exampleCode =
    feedback.example_code || feedback.fixed_snippet || fallbackExample || "";
  const confidence = feedback.confidence;
  const isTemplate = !feedback.example_code && !feedback.fixed_snippet && !!fallbackExample;

  // Build the before/after for the suggested-change block.
  const beforeLines = feedback.original_snippet
    ? feedback.original_snippet.split("\n")
    : originalLines ?? [];
  const afterLines = exampleCode.split("\n");
  const startLine = feedback.anchor_line ?? (lineRange ? parseInt(lineRange, 10) : undefined);

  const copyExample = () => {
    if (exampleCode) navigator.clipboard?.writeText(exampleCode);
  };

  return (
    <div className={`ifc ifc-sev-${severity} ${expanded ? "ifc-expanded" : "ifc-collapsed"}`}>
      <button
        type="button"
        className="ifc-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="ifc-head-left">
          <span className={`ifc-tag ifc-tag-${severity}`}>{patternShort}</span>
          <span className="ifc-head-pattern">{patternFull}</span>
          <SeverityBadge severity={severity} />
          {lineRange && <span className="ifc-head-line">line {lineRange}</span>}
          {!expanded && summary && (
            <span className="ifc-head-summary" title={summary}>· {summary}</span>
          )}
        </span>
        <span className="ifc-head-right">
          {confidence && (
            <span className={`ifc-conf ifc-conf-${confidence}`}>{confidence}</span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {expanded && (
        <div className="ifc-body">
          {/* Diagnosis */}
          {explanation && <p className="ifc-diag">{explanation}</p>}

          {/* Location hint */}
          {locationHint && (
            <p className="ifc-location">
              <span className="ifc-location-icon" aria-hidden>⌖</span>
              {locationHint}
            </p>
          )}

          {/* Fix description */}
          {fixDesc && <p className="ifc-fix-desc">{fixDesc}</p>}

          {/* Suggested change block */}
          {(beforeLines.length > 0 || afterLines.length > 0) && (
            <div className="ifc-change">
              <div className="ifc-change-head">
                <span className="ifc-change-label">
                  Suggested change
                  {isTemplate && (
                    <span className="preview-tag" title="Template preview — engine did not return a verbatim fix">
                      Preview
                    </span>
                  )}
                </span>
                {exampleCode && (
                  <button className="copy-btn" onClick={copyExample} title="Copy suggestion">
                    Copy
                  </button>
                )}
              </div>
              <SuggestedChange
                beforeLines={beforeLines}
                afterLines={afterLines}
                startLine={startLine}
              />
            </div>
          )}

          <div className="ifc-footer">
            <Link
              to={`/rules#rule-${patternShort}`}
              className="ifc-learn-more"
            >
              Learn more about {patternShort} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
