import React from "react";
import { Severity, SEVERITY_LABEL } from "../lib/severity";

interface Props {
  severity: Severity;
  /** Compact (dot + label) vs. tiny (just a colored dot) */
  variant?: "pill" | "dot";
  /** Override label text (otherwise uses capitalized severity) */
  label?: string;
}

export default function SeverityBadge({ severity, variant = "pill", label }: Props) {
  if (variant === "dot") {
    return <span className={`sev-dot sev-dot-${severity}`} aria-label={SEVERITY_LABEL[severity]} />;
  }
  return (
    <span className={`sev-pill sev-pill-${severity}`}>
      <span className={`sev-dot sev-dot-${severity}`} aria-hidden />
      {label ?? SEVERITY_LABEL[severity]}
    </span>
  );
}
