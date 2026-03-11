import React from "react";
import { AnalysisResult, AnalysisTask } from "../types";
import ResultCard from "./ResultCard";
import { uiStatus } from "../utils/helpers";

type Props = {
  task: AnalysisTask | null;
  result: AnalysisResult | null;
};

export default function TaskDetail({ task, result }: Props) {
  if (!task) {
    return (
      <section className="panel">
        <h2>Analysis Results</h2>
        <p className="muted">Select a task to view details.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>{task.source_name}</h2>
      <p className="muted">Status: {uiStatus(task.status)}</p>

      {!result && <p className="muted">Waiting for result...</p>}

      {result && (
        <>
          <div className="summaryGrid">
            <div>
              <span className="summaryLabel">Total Findings</span>
              <strong>{result.summary.total_findings}</strong>
            </div>
            <div>
              <span className="summaryLabel">Smell Hits</span>
              <strong>{result.summary.smell_hits}</strong>
            </div>
            <div>
              <span className="summaryLabel">Critical</span>
              <strong>{result.summary.critical_count}</strong>
            </div>
          </div>
          <p className="muted">Processing time: {result.processing_time_ms} ms</p>
          <div className="resultList">
            {result.findings.map((finding, idx) => (
              <ResultCard key={`${finding.smell_type}-${idx}`} finding={finding} />
            ))}
          </div>
          {result.llm_suggestions ? (
            <div className="llmBox">
              <h3>LLM Suggestions</h3>
              <pre>{result.llm_suggestions}</pre>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
