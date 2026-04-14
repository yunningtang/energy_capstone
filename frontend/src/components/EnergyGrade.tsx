import React from "react";
import { Grade, GRADE_CLASS } from "../lib/severity";

interface Props {
  grade: Grade;
  /** Caption below the circle, e.g. "Energy Grade" or "A+ density" */
  caption?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * A circular grade display inspired by Code Climate's maintainability
 * score. Color comes from a CSS class (theme-aware) — no inline hex.
 */
export default function EnergyGrade({ grade, caption = "Energy Grade", size = "md" }: Props) {
  return (
    <div className={`energy-grade energy-grade-${size}`}>
      <div className={`energy-grade-circle ${GRADE_CLASS[grade]}`}>
        <span className="energy-grade-letter">{grade}</span>
      </div>
      {caption && <div className="energy-grade-caption">{caption}</div>}
    </div>
  );
}
