import React from "react";
import { Severity, SEVERITY_LABEL } from "../lib/severity";
import EnergyGrade from "./EnergyGrade";
import { Grade } from "../lib/severity";

interface Props {
  grade: Grade;
  counts: Record<Severity, number>;
  fileCount: number;
  /** Optional subtitle shown under the total-issues metric */
  density?: string;
}

/**
 * Dashboard-style metric strip at the top of a run detail page.
 * 4 tiles: Energy Grade · Critical · Major · Minor.
 * Zero-count tiles are rendered but visually dimmed — keeps the
 * layout stable across runs.
 */
export default function MetricStrip({ grade, counts, fileCount, density }: Props) {
  const total = counts.critical + counts.major + counts.minor;
  return (
    <div className="metric-strip">
      <div className="metric-tile metric-tile-grade">
        <EnergyGrade grade={grade} caption="Energy Grade" />
      </div>
      <MetricTile
        label="Total issues"
        value={total}
        sub={density ?? `${fileCount} file${fileCount === 1 ? "" : "s"} scanned`}
      />
      <MetricTile
        label={SEVERITY_LABEL.critical}
        value={counts.critical}
        severity="critical"
      />
      <MetricTile
        label={SEVERITY_LABEL.major}
        value={counts.major}
        severity="major"
      />
      <MetricTile
        label={SEVERITY_LABEL.minor}
        value={counts.minor}
        severity="minor"
      />
    </div>
  );
}

function MetricTile({
  label,
  value,
  severity,
  sub,
}: {
  label: string;
  value: number;
  severity?: Severity;
  sub?: string;
}) {
  const dim = value === 0;
  return (
    <div className={`metric-tile ${dim ? "metric-tile-dim" : ""}`}>
      <div className="metric-tile-label">
        {severity && <span className={`sev-dot sev-dot-${severity}`} aria-hidden />}
        {label}
      </div>
      <div className="metric-tile-value">{value}</div>
      {sub && <div className="metric-tile-sub">{sub}</div>}
    </div>
  );
}
