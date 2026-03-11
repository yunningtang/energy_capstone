import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import SubmitPanel from "./components/SubmitPanel";
import TaskDetail from "./components/TaskDetail";
import TaskQueue from "./components/TaskQueue";
import { createTask, getResult, healthCheck, listTasks } from "./services/api";
import { AnalysisResult, AnalysisTask, SourceType } from "./types";

const DEFAULT_SMELLS = ["DW", "HMU", "HAS", "IOD", "NLMR"];

function App() {
  const [activeTab, setActiveTab] = useState<SourceType>("file");
  const [urlInput, setUrlInput] = useState("");
  const [snippetInput, setSnippetInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<AnalysisTask[]>([]);
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const [health, setHealth] = useState("checking");
  const [error, setError] = useState("");

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await healthCheck();
        const llmStatus =
          res.ollama_status?.provider_health?.status ??
          res.ollama_status?.status ??
          "unknown";
        const activeProvider = res.ollama_status?.active_provider ?? "unknown";
        setHealth(`${res.api_status}/${res.db_status}/${llmStatus} (${activeProvider})`);
      } catch {
        setHealth("unhealthy");
      }
    })();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await listTasks();
        setTasks(rows);
      } catch {
        setError("Failed to load task list.");
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedResult(null);
      return;
    }
    const fetchResult = async () => {
      try {
        const row = await getResult(selectedTaskId);
        setSelectedResult(row);
      } catch {
        // Not completed yet.
      }
    };
    fetchResult();
    const timer = setInterval(fetchResult, 3000);
    return () => clearInterval(timer);
  }, [selectedTaskId]);

  async function handleAnalyze() {
    setError("");
    try {
      const payload = await buildPayload();
      const task = await createTask(payload);
      setTasks((prev) => [task, ...prev]);
      setSelectedTaskId(task.id);
      setUrlInput("");
      setSnippetInput("");
      setSelectedFile(null);
    } catch (e) {
      setError("Failed to submit analysis request.");
      console.error(e);
    }
  }

  async function buildPayload() {
    if (activeTab === "url") {
      return {
        source_type: "url" as const,
        source_name: urlInput.split("/").pop() || "repository",
        source_value: urlInput.trim(),
        smell_types: DEFAULT_SMELLS,
      };
    }
    if (activeTab === "snippet") {
      return {
        source_type: "snippet" as const,
        source_name: "pasted_snippet.java",
        source_value: snippetInput.trim(),
        smell_types: DEFAULT_SMELLS,
      };
    }
    const fileText = await readFileText(selectedFile);
    return {
      source_type: "file" as const,
      source_name: selectedFile?.name || "uploaded_file.java",
      source_value: fileText,
      smell_types: DEFAULT_SMELLS,
    };
  }

  const isAnalyzeDisabled =
    (activeTab === "url" && !urlInput.trim()) ||
    (activeTab === "snippet" && !snippetInput.trim()) ||
    (activeTab === "file" && !selectedFile);

  return (
    <div className="appRoot">
      <header className="topBar">
        <div>
          <h1>EcoCode</h1>
        </div>
        <div className="health">Health: {health}</div>
      </header>

      {error ? <p className="errorBanner">{error}</p> : null}

      <main className="grid3">
        <SubmitPanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          snippetInput={snippetInput}
          setSnippetInput={setSnippetInput}
          selectedFileName={selectedFile?.name ?? null}
          onPickFile={setSelectedFile}
          onAnalyze={handleAnalyze}
          isAnalyzeDisabled={isAnalyzeDisabled}
        />
        <TaskQueue tasks={tasks} selectedTaskId={selectedTaskId} onSelectTask={setSelectedTaskId} />
        <TaskDetail task={selectedTask} result={selectedResult} />
      </main>
    </div>
  );
}

async function readFileText(file: File | null): Promise<string> {
  if (!file) {
    throw new Error("No file selected");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export default App;
