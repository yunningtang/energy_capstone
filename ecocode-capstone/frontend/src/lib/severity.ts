/**
 * Severity model + Energy Grade formula.
 *
 * ─── Severity mapping ───────────────────────────────────────
 * Static mapping from pattern → severity. This is a simplification:
 * a real engine would weight by call-site (hot loop vs. init) and
 * occurrence count. We accept the limitation for the MVP and surface
 * it in the Rules page so the trade-off is visible.
 *
 *   DW   → Critical   (un-released wake lock; CPU awake until reboot)
 *   HAS  → Major      (blocking I/O on UI thread; freezes the app)
 *   IOD  → Major      (object allocation on every frame; GC pressure)
 *   HMU  → Minor      (memory-efficiency; not a battery smell alone)
 *   NLMR → Minor      (resilience smell; raises OOM-kill probability)
 *
 * ─── Energy Grade formula ───────────────────────────────────
 * A weighted score normalized per 1000 lines of code:
 *
 *   weighted = 3*critical + 2*major + 1*minor
 *   density  = weighted / max(1, KLOC)
 *
 *        density = 0    → A  (no issues)
 *        density ≤ 2    → B
 *        density ≤ 4    → C
 *        density ≤ 7    → D
 *        density > 7    → F
 *
 * KLOC falls back to max(1, file_count) when LOC is unknown, so the
 * formula still works for upload runs where we only have file counts.
 */

export type Severity = "critical" | "major" | "minor";
export type Pattern = "DW" | "HMU" | "HAS" | "IOD" | "NLMR";

export const PATTERN_SEVERITY: Record<Pattern, Severity> = {
  DW:   "critical",
  HAS:  "major",
  IOD:  "major",
  HMU:  "minor",
  NLMR: "minor",
};

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 3,
  major: 2,
  minor: 1,
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
};

/** CSS-variable colour token for each severity — resolves via App.css :root. */
export const SEVERITY_COLOR_VAR: Record<Severity, string> = {
  critical: "var(--c-red-fg)",     // red
  major:    "var(--c-amber-fg)",   // orange — distinct from minor
  minor:    "var(--c-yellow-fg)",  // yellow — distinct from major
};

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface GradeBreakdown {
  grade: Grade;
  density: number;
  weighted: number;
  counts: Record<Severity, number>;
  kloc: number;
}

export function severityOf(pattern: string): Severity {
  const key = pattern.toUpperCase() as Pattern;
  return PATTERN_SEVERITY[key] ?? "minor";
}

/**
 * Count issues by severity from a list of {pattern, hasIssue} entries.
 */
export function countBySeverity(issues: { pattern: string; hasIssue: boolean }[]): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, major: 0, minor: 0 };
  for (const { pattern, hasIssue } of issues) {
    if (!hasIssue) continue;
    out[severityOf(pattern)]++;
  }
  return out;
}

/**
 * Compute an Energy Grade. `loc` may be undefined; we then fall back to
 * using file count as a coarse proxy (1 KLOC per 10 files).
 */
export function computeGrade(
  counts: Record<Severity, number>,
  opts: { loc?: number; fileCount?: number } = {},
): GradeBreakdown {
  const weighted =
    SEVERITY_WEIGHT.critical * counts.critical +
    SEVERITY_WEIGHT.major * counts.major +
    SEVERITY_WEIGHT.minor * counts.minor;

  const kloc = opts.loc
    ? opts.loc / 1000
    : opts.fileCount
      ? opts.fileCount / 10
      : 1;
  const density = weighted / Math.max(0.1, kloc);

  let grade: Grade = "A";
  if (weighted === 0) grade = "A";
  else if (density <= 2) grade = "B";
  else if (density <= 4) grade = "C";
  else if (density <= 7) grade = "D";
  else grade = "F";

  return { grade, density, weighted, counts, kloc };
}

export const GRADE_COLOR: Record<Grade, string> = {
  A: "#10b978",   // success-green
  B: "#22c55e",
  C: "#d97706",
  D: "#ea580c",
  F: "#dc2626",
};
