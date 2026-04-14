import React, { useEffect, useState } from "react";
import {
  Loader2, CheckCircle2, XCircle, Lock, Eye, EyeOff,
  RefreshCw, Trash2, ChevronDown, ChevronUp,
} from "lucide-react";

/* ── Inline brand logos (no icon lib dependency; simplified SVG paths) ─ */
const OpenAIMark = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.682zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
  </svg>
);
const GeminiMark = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 0c0 6.627 5.373 12 12 12-6.627 0-12 5.373-12 12 0-6.627-5.373-12-12-12 6.627 0 12-5.373 12-12z"/>
  </svg>
);
/* Simplified llama silhouette — two ears, head, long neck, body.
   Not the exact Ollama brand logo (that's copyrighted 3D art) but clearly
   reads as "llama" at 14–16px. */
const OllamaMark = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8.2 2.4c-.5 0-.9.5-.9 1v2.4c-.1.4-.2.8-.3 1.2-1.2 0-2.2.4-2.9 1.2-.8.9-1.1 2-1.1 3.1 0 1.3.6 2.7 1.6 3.4.1.7.3 1.3.7 1.9v3.8c0 1 .4 2 1 2.7.7.7 1.6 1.1 2.6 1.1h4.3c1 0 1.9-.4 2.6-1.1.7-.7 1-1.7 1-2.7v-3.8c.3-.6.5-1.2.7-1.9 1-.7 1.6-2.1 1.6-3.4 0-1.1-.3-2.2-1.1-3.1-.7-.8-1.7-1.2-2.9-1.2-.1-.4-.2-.8-.3-1.2V3.4c0-.5-.4-1-.9-1-.5 0-.9.5-.9 1v2c-.5-.1-1-.1-1.5-.1s-1 0-1.5.1v-2c0-.5-.4-1-.9-1zm1.3 8.6c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm5 0c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1z"/>
  </svg>
);
import { healthCheck } from "../services/api";
import { HealthInfo } from "../types";

/* ─────────────────────────────────────────────────────
   Small inline status pill used next to every section
   heading + on each provider card header.
   One vocabulary: Ready / Untested / Not configured / Error.
   ───────────────────────────────────────────────────── */
type StatusKind = "ready" | "untested" | "not-configured" | "error" | "checking";
const STATUS_LABEL: Record<StatusKind, string> = {
  ready: "Ready",
  untested: "Untested",
  "not-configured": "Not configured",
  error: "Error",
  checking: "Checking…",
};
function StatusChip({ kind, variant = "section" }: { kind: StatusKind; variant?: "section" | "card" }) {
  return (
    <span className={`status-chip status-chip-${variant} status-chip-${kind}`}>
      {kind === "checking" ? (
        <Loader2 size={11} className="spin" />
      ) : (
        <span className="status-chip-dot" aria-hidden />
      )}
      {STATUS_LABEL[kind]}
    </span>
  );
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

/* ─────────────────────────────────────────────────────
   Settings
   Order: LLM Providers (most users) → Backend (dev only)
   ───────────────────────────────────────────────────── */
export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem("api_base_url") || "http://localhost:8000");
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem("openai_api_key") || "");
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
  const [ollamaEndpoint, setOllamaEndpoint] = useState(() => {
    // Migrate older split host+port → single endpoint URL.
    const legacy = localStorage.getItem("ollama_endpoint");
    if (legacy) return legacy;
    const host = localStorage.getItem("ollama_host") || "http://localhost";
    const port = localStorage.getItem("ollama_port") || "11434";
    return `${host}:${port}`;
  });
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem("ollama_model") || "qwen2.5-coder:7b");
  const [ollamaTestResult, setOllamaTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [ollamaTesting, setOllamaTesting] = useState(false);
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
    setOllamaTesting(true);
    setOllamaTestResult(null);
    try {
      const res = await fetch(`${ollamaEndpoint.replace(/\/+$/, "")}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        const models = data?.models?.map((m: any) => m.name)?.join(", ") || "none found";
        setOllamaTestResult({ ok: true, msg: `Connected · ${models}` });
      } else {
        setOllamaTestResult({ ok: false, msg: `HTTP ${res.status}` });
      }
    } catch (e: any) {
      setOllamaTestResult({ ok: false, msg: e?.message || "Connection failed" });
    } finally {
      setOllamaTesting(false);
    }
  }

  const dbOk = health?.db_status === "healthy";
  const llmInfo = health?.llm_status as any;
  const llmOk = llmInfo?.status === "healthy";
  const llmProvider: string | undefined = llmInfo?.provider;

  const backendStatus: StatusKind = checking ? "checking" : health ? "ready" : "error";

  function providerStatus(key: "ollama" | "openai" | "gemini"): StatusKind {
    const configured =
      key === "ollama" ? !!ollamaEndpoint :
      key === "openai" ? !!openaiKey :
      !!geminiKey;
    if (!configured) return "not-configured";
    if (llmProvider === key) return llmOk ? "ready" : "error";
    return "untested";
  }

  const cloudReady = providerStatus("openai") === "ready" || providerStatus("gemini") === "ready";
  const localReady = providerStatus("ollama") === "ready";
  const providersReadyCount = [cloudReady, localReady].filter(Boolean).length;
  const llmOverall: StatusKind =
    providersReadyCount > 0 ? "ready" :
    (openaiKey || geminiKey || ollamaEndpoint) ? "untested" : "not-configured";

  return (
    <div className="page page-narrow settings-page">
      <div className="page-header">
        <h2>Settings</h2>
      </div>
      <p className="settings-page-sub">
        Configure your AI provider below. The backend address only needs
        changing for self-hosted deployments.
      </p>

      {/* ═════════ LLM Providers (most users come here first) ═════════ */}
      <section className="settings-section-block">
        <header className="settings-section-header">
          <h3 className="section-title">AI Providers</h3>
          {llmOk && llmProvider ? (
            <span className="status-chip status-chip-section status-chip-ready" title={`${llmProvider} is currently serving analysis requests`}>
              <span className="status-chip-dot" aria-hidden />
              Active: {llmProvider}
            </span>
          ) : (
            <StatusChip kind={llmOverall} />
          )}
        </header>
        <p className="settings-section-desc">Connect at least one provider to run code analysis.</p>

        {/* ── Local ── */}
        <div className="settings-subgroup">
          <span className="settings-subgroup-label">Local</span>
          <span className="settings-subgroup-sub">Runs on your machine — no code leaves your computer</span>
        </div>
        <div className="settings-provider-card">
          <button
            type="button"
            className="provider-header"
            onClick={() => setExpandedLlm(expandedLlm === "ollama" ? null : "ollama")}
            aria-expanded={expandedLlm === "ollama"}
          >
            <div className="provider-info">
              <span className="provider-icon-geom provider-icon-ollama"><OllamaMark size={14} /></span>
              <span className="provider-name">Ollama</span>
              <span className="provider-desc">Run any open model locally</span>
            </div>
            <div className="provider-actions">
              <StatusChip kind={providerStatus("ollama")} variant="card" />
              {expandedLlm === "ollama" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>
          {expandedLlm === "ollama" && (
            <div className="provider-body">
              <label className="field-label" htmlFor="ollama-endpoint">Endpoint URL</label>
              <input
                id="ollama-endpoint"
                className="input input-mono"
                value={ollamaEndpoint}
                onChange={(e) => setOllamaEndpoint(e.target.value)}
                placeholder="http://localhost:11434"
              />
              <p className="field-helper">Default Ollama port is <code>11434</code>.</p>

              <label className="field-label" htmlFor="ollama-model" style={{ marginTop: 12 }}>Default model</label>
              <input
                id="ollama-model"
                className="input"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="qwen2.5-coder:7b"
              />
              <p className="field-helper">
                Name of a model you've already pulled with <code>ollama pull</code>.
              </p>

              {ollamaTestResult && (
                <p className={`test-inline ${ollamaTestResult.ok ? "success" : "error"}`}>
                  {ollamaTestResult.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {ollamaTestResult.msg}
                </p>
              )}

              <div className="provider-footer">
                <button className="btn outline btn-sm" onClick={testOllama} disabled={ollamaTesting}>
                  {ollamaTesting ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                  <span>Test connection</span>
                </button>
                <div style={{ flex: 1 }} />
                <button
                  className="btn primary btn-sm"
                  onClick={() => {
                    saveLocal("ollama_endpoint", ollamaEndpoint);
                    saveLocal("ollama_model", ollamaModel);
                    // clean up legacy keys
                    localStorage.removeItem("ollama_host");
                    localStorage.removeItem("ollama_port");
                  }}
                >
                  <span>{saved["ollama_model"] || saved["ollama_endpoint"] ? "Saved!" : "Save"}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Cloud ── */}
        <div className="settings-subgroup settings-subgroup-cloud">
          <span className="settings-subgroup-label">Cloud</span>
          <span className="settings-subgroup-sub">Sends code to external AI service — requires API key</span>
        </div>
        <CloudProviderCard
          id="openai"
          name="OpenAI"
          iconNode={<OpenAIMark size={14} />}
          iconClass="provider-icon-openai"
          desc="GPT-4 family · most popular"
          keyValue={openaiKey}
          setKey={setOpenaiKey}
          placeholder="sk-..."
          status={providerStatus("openai")}
          expanded={expandedLlm === "openai"}
          onToggle={() => setExpandedLlm(expandedLlm === "openai" ? null : "openai")}
          onSave={() => saveLocal("openai_api_key", openaiKey)}
          onRemove={() => removeKey("openai_api_key", setOpenaiKey)}
          savedFlash={saved["openai_api_key"]}
        />
        <CloudProviderCard
          id="gemini"
          name="Gemini"
          iconNode={<GeminiMark size={14} />}
          iconClass="provider-icon-gemini"
          desc="Google's flagship models"
          keyValue={geminiKey}
          setKey={setGeminiKey}
          placeholder="AIza..."
          status={providerStatus("gemini")}
          expanded={expandedLlm === "gemini"}
          onToggle={() => setExpandedLlm(expandedLlm === "gemini" ? null : "gemini")}
          onSave={() => saveLocal("gemini_api_key", geminiKey)}
          onRemove={() => removeKey("gemini_api_key", setGeminiKey)}
          savedFlash={saved["gemini_api_key"]}
        />
      </section>

      {/* ═════════ Backend (dev / self-host) ═════════ */}
      <section className="settings-section-block">
        <header className="settings-section-header">
          <h3 className="section-title">Backend</h3>
          <StatusChip kind={backendStatus} />
        </header>
        <p className="settings-section-desc">
          Address of the analysis backend. Change this only if you're running the server somewhere other than localhost.
          {dbOk ? " Database connection is healthy." : health ? " Database is offline." : ""}
        </p>

        {/* Backend is a single config — no card wrapper, just form fields.
            AI Providers use cards because each card is an entity. */}
        <div className="settings-backend-form">
          <label className="field-label" htmlFor="api-base-url">Base URL</label>
          <input
            id="api-base-url"
            className="input input-mono"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://localhost:8000"
            onKeyDown={(e) => e.key === "Enter" && saveApiUrl()}
          />
          <p className="field-helper">Page reloads after save so the new URL takes effect.</p>

          <div className="settings-backend-footer">
            <button className="btn outline btn-sm" onClick={checkConnection} disabled={checking}>
              {checking ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              <span>Test connection</span>
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn primary btn-sm" onClick={saveApiUrl}>
              <span>{saved["api"] ? "Saved!" : "Save"}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Shared cloud-provider card (OpenAI / Gemini share the same shape) ── */
function CloudProviderCard({
  id, name, iconNode, iconClass, desc, keyValue, setKey, placeholder, status,
  expanded, onToggle, onSave, onRemove, savedFlash,
}: {
  id: string;
  name: string;
  iconNode: React.ReactNode;
  iconClass?: string;
  desc: string;
  keyValue: string;
  setKey: (v: string) => void;
  placeholder: string;
  status: StatusKind;
  expanded: boolean;
  onToggle: () => void;
  onSave: () => void;
  onRemove: () => void;
  savedFlash: boolean;
}) {
  return (
    <div className="settings-provider-card">
      <button type="button" className="provider-header" onClick={onToggle} aria-expanded={expanded}>
        <div className="provider-info">
          <span className={`provider-icon-geom ${iconClass || ""}`}>{iconNode}</span>
          <span className="provider-name">{name}</span>
          <span className="provider-desc">{desc}</span>
        </div>
        <div className="provider-actions">
          <StatusChip kind={status} variant="card" />
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>
      {expanded && (
        <div className="provider-body">
          <label className="field-label" htmlFor={`${id}-key`}>API key</label>
          <PasswordInput value={keyValue} onChange={setKey} placeholder={placeholder} />
          <p className="field-helper"><Lock size={10} /> Stored in your browser. Never sent to our servers.</p>
          <div className="provider-footer">
            {keyValue && (
              <button className="btn danger-ghost btn-sm" onClick={onRemove}>
                <Trash2 size={14} /><span>Remove</span>
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button className="btn primary btn-sm" onClick={onSave} disabled={!keyValue.trim()}>
              <span>{savedFlash ? "Saved!" : "Save"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
