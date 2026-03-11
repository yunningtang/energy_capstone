import React from "react";
import { AnalysisTask } from "../types";
import { statusColor, uiStatus } from "../utils/helpers";

type Props = {
  tasks: AnalysisTask[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
};

export default function TaskQueue({ tasks, selectedTaskId, onSelectTask }: Props) {
  return (
    <section className="panel">
      <h2>My Requests</h2>
      <div className="list">
        {tasks.length === 0 ? <p className="muted">No tasks yet.</p> : null}
        {tasks.map((task) => {
          const selected = selectedTaskId === task.id;
          return (
            <button
              key={task.id}
              className={selected ? "taskCard selected" : "taskCard"}
              onClick={() => onSelectTask(task.id)}
            >
              <div className="taskHeader">
                <span className="taskTitle">{task.source_name}</span>
                <span className={`statusPill ${statusColor(task.status)}`}>{uiStatus(task.status)}</span>
              </div>
              <div className="taskMeta">ID: {task.id}</div>
              {task.status === "IN_PROGRESS" ? (
                <div className="progressWrap">
                  <div className="progressBar" style={{ width: `${task.progress}%` }} />
                </div>
              ) : null}
              {task.error_message ? <p className="errorText">{task.error_message}</p> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
