import React, { useEffect, useState } from "react";
import {
  Loader2, CheckCircle2, XCircle, Lock, Eye, EyeOff,
  RefreshCw, Trash2, Server, Database, ChevronDown, ChevronUp,
} from "lucide-react";
import { healthCheck } from "../services/api";
import { HealthInfo } from "../types";

/* ── Helpers ─────────────────────────────────────── */
function StatusDot({ ok, checking }: { ok: boolean | null; checking?: boolean }) {
  if (checking) return <Loader2 size={12} className="spin" style={{ color: "var(--muted)" }} />;
  if (ok === null) return <span className="status-dot unknown" />;
  return <span className={`status-dot ${ok ? "online" : "offline"}`} />;
}

function PasswordInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrapper">
      <input className="input input-mono" type={show ? "text" : "password"}
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <button className="input-toggle" type="button" onClick={() => setShow(!show)}>
        {show ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </div>
  );
}

/* ── Main ────────────────────────────────────────── */
export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem("api_base_url") || "http://localhost:8000");
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem("openai_api_key") || "");
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
  const [ollamaHost, setOllamaHost] = useState(() => localStorage.getItem("ollama_host") || "http://localhost");
  const [ollamaPort, setOllamaPort] = useState(() => localStorage.getItem("ollama_port") || "11434");
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem("ollama_model") || "qwen2.5-coder:7b");
  const [ollamaTestResult, setOllamaTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [expandedLlm, setExpandedLlm] = useState<string | null>(null);

  useEffect(() => { checkConnection(); }, []);

  async function checkConnection() {
    setChecking(true);
    try { setHealth(await healthCheck()); }
    catch { setHealth(null); }
    finally { setChecking(false); }
  }

  function flashSaved(key: string) {
    setSaved((p) => ({ ...p, [key]: true }));
    setTimeout(() => setSaved((p) => ({ ...p, [key]: false })), 2000);
  }

  function saveApiUrl() {
    localStorage.setItem("api_base_url", apiUrl.trim().replace(/\/+$/, ""));
    flashSaved("api");
    window.location.reload();
  }

  function saveLocal(key: string, value: string) {
    localStorage.setItem(key, value);
    flashSaved(key);
  }

  function removeKey(key: string, setter: (v: string) => void) {
    localStorage.removeItem(key);
    setter("");
    flashSaved(key);
  }

  async function testOllama() {
    setOllamaTestResult({ ok: false, msg: "Testing..." });
    try {
      const res = await fetch(`${ollamaHost}:${ollamaPort}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        const models = data?.models?.map((m: any) => m.name)?.join(", ") || "none found";
        setOllamaTestResult({ ok: true, msg: `Models: ${models}` });
      } else {
        setOllamaTestResult({ ok: false, msg: `HTTP ${res.status}` });
      }
    } catch (e: any) {
      setOllamaTestResult({ ok: false, msg: e?.message || "Connection failed" });
    }
  }

  const dbOk = health?.db_status === "healthy";
  const llmInfo = health?.llm_status as any;
  const llmOk = llmInfo?.status === "healthy";
  const llmProvider = llmInfo?.provider;

  return (
    <div className="page page-narrow">
      <div className="page-header"><h2>Settings</h2></div>

      {/* ─── Section: Connection Status ─── */}
      <div className="settings-status-grid">
        <div className="status-item">
          <StatusDot ok={health ? true : null} checking={checking} />
          <div>
            <div className="status-item-label">API Server</div>
            <div className="status-item-value">{health ? "Connected" : checking ? "Checking..." : "Offline"}</div>
          </div>
        </div>
        <div className="status-item">
          <StatusDot ok={dbOk ? true : health ? false : null} />
          <div>
            <div className="status-item-label">Database</div>
            <div className="status-item-value">{dbOk ? "Connected" : "\u2014"}</div>
          </div>
        </div>
        <div className="status-item">
          <StatusDot ok={llmOk ? true : llmProvider ? false : null} />
          <div>
            <div className="status-item-label">LLM Provider</div>
            <div className="status-item-value">{llmProvider ? `${llmProvider}${llmOk ? "" : " (offline)"}` : "Not configured"}</div>
          </div>
        </div>
      </div>

      {/* ─── Section: API Server ─── */}
      <section className="settings-section-block">
        <h3 className="section-title">API Server</h3>
        <div className="settings-field-row">
          <div className="settings-field-grow">
            <label className="field-label">Base URL</label>
            <input className="input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://localhost:8000" onKeyDown={(e) => e.key === "Enter" && saveApiUrl()} />
          </div>
          <div className="settings-field-actions">
            <button className="btn outline btn-sm" onClick={checkConnection} disabled={checking}>
              {checking ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}<span>Test</span>
            </button>
            <button className="btn primary btn-sm" onClick={saveApiUrl}>
              <span>{saved["api"] ? "Saved!" : "Save"}</span>
            </button>
          </div>
        </div>
      </section>

      {/* ─── Section: LLM Providers ─── */}
      <section className="settings-section-block">
        <h3 className="section-title">LLM Providers</h3>
        <p className="settings-section-desc">Connect at least one provider to run code analysis.</p>

        {/* Ollama */}
        <div className="settings-provider-card">
          <div className="provider-header" onClick={() => setExpandedLlm(expandedLlm === "ollama" ? null : "ollama")}>
            <div className="provider-info">
              <Server size={16} />
              <span className="provider-name">Ollama</span>
              <span className="provider-desc">Local runtime</span>
            </div>
            <div className="provider-actions">
              <StatusDot ok={llmProvider === "ollama" && llmOk ? true : llmProvider === "ollama" ? false : null} />
              {expandedLlm === "ollama" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
          {expandedLlm === "ollama" && (
            <div className="provider-body">
              <div className="settings-two-col">
                <div>
                  <label className="field-label">Host</label>
                  <input className="input" value={ollamaHost} onChange={(e) => setOllamaHost(e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Port</label>
                  <input className="input input-mono" value={ollamaPort} onChange={(e) => setOllamaPort(e.target.value)} />
                </div>
              </div>
              <label className="field-label">Default Model</label>
              <input className="input" value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="qwen2.5-coder:7b" />
              {ollamaTestResult && (
                <p className={`test-inline ${ollamaTestResult.ok ? "success" : "error"}`}>
                  {ollamaTestResult.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {ollamaTestResult.msg}
                </p>
              )}
              <div className="provider-footer">
                <button className="btn outline btn-sm" onClick={testOllama}>
                  <RefreshCw size={14} /><span>Test Connection</span>
                </button>
                <button className="btn primary btn-sm" onClick={() => {
                  saveLocal("ollama_host", ollamaHost);
                  saveLocal("ollama_port", ollamaPort);
                  saveLocal("ollama_model", ollamaModel);
                }}><span>{saved["ollama_model"] ? "Saved!" : "Save"}</span></button>
              </div>
            </div>
          )}
        </div>

        {/* OpenAI */}
        <div className="settings-provider-card">
          <div className="provider-header" onClick={() => setExpandedLlm(expandedLlm === "openai" ? null : "openai")}>
            <div className="provider-info">
              <span className="provider-icon-text">O</span>
              <span className="provider-name">OpenAI</span>
              <span className="provider-desc">GPT-4o, GPT-4.1</span>
            </div>
            <div className="provider-actions">
              {openaiKey ? <span className="badge done">Key set</span> : <span className="badge pending">Not configured</span>}
              {expandedLlm === "openai" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
          {expandedLlm === "openai" && (
            <div className="provider-body">
              <label className="field-label">API Key</label>
              <PasswordInput value={openaiKey} onChange={setOpenaiKey} placeholder="sk-..." />
              <p className="field-helper"><Lock size={10} /> Stored locally. Never sent to our servers.</p>
              <div className="provider-footer">
                {openaiKey && (
                  <button className="btn danger-ghost btn-sm" onClick={() => removeKey("openai_api_key", setOpenaiKey)}>
                    <Trash2 size={14} /><span>Remove</span>
                  </button>
                )}
                <div style={{ flex: 1 }} />
                <button className="btn primary btn-sm" onClick={() => saveLocal("openai_api_key", openaiKey)}>
                  <span>{saved["openai_api_key"] ? "Saved!" : "Save"}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Gemini */}
        <div className="settings-provider-card">
          <div className="provider-header" onClick={() => setExpandedLlm(expandedLlm === "gemini" ? null : "gemini")}>
            <div className="provider-info">
              <span className="provider-icon-text">G</span>
              <span className="provider-name">Gemini</span>
              <span className="provider-desc">Gemini 2.5 Flash</span>
            </div>
            <div className="provider-actions">
              {geminiKey ? <span className="badge done">Key set</span> : <span className="badge pending">Not configured</span>}
              {expandedLlm === "gemini" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
          {expandedLlm === "gemini" && (
            <div className="provider-body">
              <label className="field-label">API Key</label>
              <PasswordInput value={geminiKey} onChange={setGeminiKey} placeholder="AIza..." />
              <p className="field-helper"><Lock size={10} /> Stored locally. Never sent to our servers.</p>
              <div className="provider-footer">
                {geminiKey && (
                  <button className="btn danger-ghost btn-sm" onClick={() => removeKey("gemini_api_key", setGeminiKey)}>
                    <Trash2 size={14} /><span>Remove</span>
                  </button>
                )}
                <div style={{ flex: 1 }} />
                <button className="btn primary btn-sm" onClick={() => saveLocal("gemini_api_key", geminiKey)}>
                  <span>{saved["gemini_api_key"] ? "Saved!" : "Save"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
