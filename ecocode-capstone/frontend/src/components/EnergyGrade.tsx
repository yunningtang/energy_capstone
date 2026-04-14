import React from "react";
import { Grade, GRADE_COLOR } from "../lib/severity";

interface Props {
  grade: Grade;
  /** Caption below the circle, e.g. "Energy Grade" or "A+ density" */
  caption?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * A circular grade display inspired by Code Climate's maintainability
 * score. The circle is filled; tone comes from the letter + color,
 * not a vertical left accent (per the design principle).
 */
export default function EnergyGrade({ grade, caption = "Energy Grade", size = "md" }: Props) {
  const color = GRADE_COLOR[grade];
  return (
    <div className={`energy-grade energy-grade-${size}`}>
      <div className="energy-grade-circle" style={{ background: color }}>
        <span className="energy-grade-letter">{grade}</span>
      </div>
      {caption && <div className="energy-grade-caption">{caption}</div>}
    </div>
  );
}
