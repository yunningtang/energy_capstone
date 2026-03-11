import React from "react";
import { Finding } from "../types";

type Props = {
  finding: Finding;
};

export default function ResultCard({ finding }: Props) {
  return (
    <article className="resultCard">
      <div className="resultTop">
        <h4>{finding.smell_type}</h4>
        <span className={`severity ${finding.severity}`}>{finding.severity}</span>
      </div>
      <p className="muted">Confidence: {finding.confidence}%</p>
      <p>{finding.explanation}</p>
      {finding.suggestion ? <p className="suggestion">Fix: {finding.suggestion}</p> : null}
      {finding.refactored_code ? <pre>{finding.refactored_code}</pre> : null}
    </article>
  );
}
