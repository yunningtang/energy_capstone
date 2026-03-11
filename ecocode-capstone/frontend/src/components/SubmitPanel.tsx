import React from "react";
import { UploadCloud } from "lucide-react";
import { SourceType } from "../types";

type Props = {
  activeTab: SourceType;
  setActiveTab: (value: SourceType) => void;
  urlInput: string;
  setUrlInput: (value: string) => void;
  snippetInput: string;
  setSnippetInput: (value: string) => void;
  selectedFileName: string | null;
  onPickFile: (file: File | null) => void;
  onAnalyze: () => void;
  isAnalyzeDisabled: boolean;
};

export default function SubmitPanel(props: Props) {
  const {
    activeTab,
    setActiveTab,
    urlInput,
    setUrlInput,
    snippetInput,
    setSnippetInput,
    selectedFileName,
    onPickFile,
    onAnalyze,
    isAnalyzeDisabled,
  } = props;

  return (
    <section className="panel">
      <h2>Analyze</h2>
      <div className="tabRow">
        <button className={activeTab === "file" ? "tab active" : "tab"} onClick={() => setActiveTab("file")}>
          File
        </button>
        <button className={activeTab === "url" ? "tab active" : "tab"} onClick={() => setActiveTab("url")}>
          URL
        </button>
        <button className={activeTab === "snippet" ? "tab active" : "tab"} onClick={() => setActiveTab("snippet")}>
          Snippet
        </button>
      </div>

      {activeTab === "file" && (
        <label className="dropzone">
          <UploadCloud size={18} />
          <span>{selectedFileName ? selectedFileName : "Choose Java/Kotlin file"}</span>
          <input
            type="file"
            accept=".java,.kt,.txt"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            hidden
          />
        </label>
      )}

      {activeTab === "url" && (
        <input
          className="textInput"
          placeholder="https://github.com/owner/repo"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
        />
      )}

      {activeTab === "snippet" && (
        <textarea
          className="textArea"
          rows={10}
          placeholder="Paste Android code snippet..."
          value={snippetInput}
          onChange={(e) => setSnippetInput(e.target.value)}
        />
      )}

      <button className="primaryBtn" onClick={onAnalyze} disabled={isAnalyzeDisabled}>
        Analyze Code
      </button>
    </section>
  );
}
