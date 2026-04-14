import React from "react";
import { Link } from "react-router-dom";
import { FolderPlus, Upload, Search, FileText } from "lucide-react";
import SeverityBadge from "../components/SeverityBadge";
import { Severity, severityOf } from "../lib/severity";

interface Rule {
  short: string;
  full: string;
  summary: string;
  whyItDrains: string;
  badExample: string;
  goodExample: string;
  refs: string[];
}

const RULES: Rule[] = [
  {
    short: "DW",
    full: "Durable Wakelock",
    summary:
      "A PowerManager.WakeLock is acquired but not released on every code path, keeping the CPU awake indefinitely.",
    whyItDrains:
      "Once the wake lock is held the device cannot enter deep sleep. A leaked wake lock in a long-running service can drain a full battery within hours even while the screen is off.",
    badExample: `wakeLock.acquire();
// work...
// no release() on exception paths`,
    goodExample: `wakeLock.acquire(10 * 60 * 1000L);
try {
  doTrackingWork();
} finally {
  if (wakeLock.isHeld())
    wakeLock.release();
}`,
    refs: ["TQRG taxonomy: DW", "Pathak et al. 2012"],
  },
  {
    short: "HAS",
    full: "Heavy AsyncTask",
    summary:
      "onPreExecute / onPostExecute / onProgressUpdate perform blocking I/O, network, or long CPU work — these run on the UI thread.",
    whyItDrains:
      "A blocked UI thread misses VSYNC deadlines, forcing the GPU/CPU to stay in high-frequency states and visibly stutters the app.",
    badExample: `protected void onPostExecute(Result r) {
  database.writeAll(r.rows);   // I/O on UI thread
}`,
    goodExample: `protected void onPostExecute(Result r) {
  executor.submit(() -> database.writeAll(r.rows));
}`,
    refs: ["Android docs: AsyncTask", "Liu et al. 2014"],
  },
  {
    short: "IOD",
    full: "Init OnDraw",
    summary:
      "Allocations (new Paint(), new Rect(), new Bitmap()) happen inside View.onDraw() — that runs on every frame.",
    whyItDrains:
      "Object churn triggers GC pauses tens of times per second. On a mid-tier phone this doubles the GC CPU budget and cuts battery life during any custom-drawn UI.",
    badExample: `public void onDraw(Canvas c) {
  Paint p = new Paint();       // allocated 60× per second
  c.drawCircle(cx, cy, r, p);
}`,
    goodExample: `private final Paint p = new Paint();
public void onDraw(Canvas c) {
  c.drawCircle(cx, cy, r, p);
}`,
    refs: ["Android custom views guide", "Hecht et al. 2016"],
  },
  {
    short: "HMU",
    full: "HashMap Usage",
    summary:
      "java.util.HashMap is used where ArrayMap or SparseArray would be more memory-efficient on Android.",
    whyItDrains:
      "HashMap autoboxes keys and allocates a bucket entry per insert. For small maps (< 1k entries) ArrayMap uses roughly half the memory and has better cache locality, reducing GC pressure.",
    badExample: `Map<Integer, String> cache =
    new HashMap<>();`,
    goodExample: `SparseArray<String> cache =
    new SparseArray<>();`,
    refs: ["Android Performance: ArrayMap/SparseArray"],
  },
  {
    short: "NLMR",
    full: "No Low-Memory Resolver",
    summary:
      "An Activity or Service does not override onTrimMemory() / onLowMemory(), so the OS has no hint to reclaim from this process before killing it.",
    whyItDrains:
      "When the system is under memory pressure, processes that don't respond to trim callbacks are killed first. The user pays the battery cost of relaunching (cold-start), which is many times more expensive than a live process servicing the same request.",
    badExample: `public class MyService extends Service {
  // no onTrimMemory / onLowMemory
}`,
    goodExample: `public class MyService extends Service {
  @Override public void onTrimMemory(int level) {
    if (level >= TRIM_MEMORY_RUNNING_MODERATE) {
      imageCache.evictAll();
    }
  }
}`,
    refs: ["Android docs: onTrimMemory", "Carette et al. 2017"],
  },
];

export default function Rules() {
  return (
    <div className="page">
      <h2>Guide &amp; Rules</h2>
      <p className="rules-intro">
        Five energy anti-patterns from the Android Test-Quality Research Group (TQRG) taxonomy.
        Each rule is classified into one of three severity tiers based on its typical impact on
        battery life and app responsiveness.
      </p>

      {/* ── Getting Started — 4-step walkthrough ─── */}
      <section id="getting-started" className="guide-getting-started">
        <h3 className="guide-section-title">Getting started</h3>
        <p className="guide-section-sub">
          A typical end-to-end flow takes about a minute for a handful of files.
        </p>
        <ol className="guide-steps">
          <li className="guide-step">
            <span className="guide-step-icon"><FolderPlus size={16} /></span>
            <div>
              <div className="guide-step-title">1 · Create a project</div>
              <p className="guide-step-body">
                Go to <Link to="/" className="guide-inline-link">Projects</Link> →
                <strong> New project</strong>. Projects group related runs so you can track
                an app's energy profile over time.
              </p>
            </div>
          </li>
          <li className="guide-step">
            <span className="guide-step-icon"><Upload size={16} /></span>
            <div>
              <div className="guide-step-title">2 · Start a run</div>
              <p className="guide-step-body">
                Click <strong>New Run</strong> inside your project. Either paste a public
                GitHub / GitLab / Bitbucket URL, or upload <code>.java</code> files /
                a <code>.zip</code> archive. We analyze Java sources only.
              </p>
            </div>
          </li>
          <li className="guide-step">
            <span className="guide-step-icon"><Search size={16} /></span>
            <div>
              <div className="guide-step-title">3 · Wait for analysis</div>
              <p className="guide-step-body">
                Each file is checked against the five rules below via an LLM
                (configured in <Link to="/settings" className="guide-inline-link">Settings</Link>).
                Progress refreshes every few seconds. A typical 20-file run finishes in
                under a minute.
              </p>
            </div>
          </li>
          <li className="guide-step">
            <span className="guide-step-icon"><FileText size={16} /></span>
            <div>
              <div className="guide-step-title">4 · Review &amp; export</div>
              <p className="guide-step-body">
                Use <strong>Table view</strong> for a matrix of files × rules, or
                <strong> Code view</strong> to see each finding inline with the source.
                Every issue ships with a diagnosis, a suggested fix, and an
                <strong> Export</strong> menu (CSV / JSON / Markdown) for sharing.
              </p>
            </div>
          </li>
        </ol>
        <div className="guide-jump-to-rules">
          <a href="#rule-DW" className="guide-jump-link">Jump to the rule reference ↓</a>
        </div>
      </section>

      <nav className="rules-toc" aria-label="On this page">
        <span className="rules-toc-label">On this page</span>
        <ul>
          {RULES.map((r) => (
            <li key={r.short}>
              <a href={`#rule-${r.short}`}>
                {r.full} <span className="rules-toc-short">({r.short})</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="rules-grid">
        {RULES.map((r) => {
          const sev: Severity = severityOf(r.short);
          return (
            <article key={r.short} id={`rule-${r.short}`} className="rule-card">
              <header className="rule-card-header">
                <div className="rule-card-heading">
                  <span className="rule-card-title">{r.full}</span>
                  <span className="rule-card-chip">{r.short}</span>
                </div>
                <SeverityBadge severity={sev} />
              </header>
              <p className="rule-card-body">{r.summary}</p>
              <div>
                <div className="rule-card-label">Why it drains battery</div>
                <p className="rule-card-body">{r.whyItDrains}</p>
              </div>
              <div className="rule-code-grid">
                <div>
                  <div className="rule-card-label">Anti-pattern</div>
                  <pre className="rule-code rule-code-bad">{r.badExample}</pre>
                </div>
                <div>
                  <div className="rule-card-label">Fix</div>
                  <pre className="rule-code rule-code-good">{r.goodExample}</pre>
                </div>
              </div>
              <div className="rule-card-refs">Refs: {r.refs.join(" · ")}</div>
            </article>
          );
        })}
      </div>

      <div className="rules-caveat">
        <strong>Methodology note.</strong> Severity is derived from pattern type, not call-site
        context. A HashMap in a hot loop is strictly worse than one in one-shot init code, but
        this classifier does not weight occurrence frequency. The Energy Grade formula is:{" "}
        <code>weighted = 3·critical + 2·major + 1·minor</code>, normalized per 1000 lines of
        code; A / B / C / D / F at density thresholds 0 / ≤2 / ≤4 / ≤7 / &gt;7.
      </div>
    </div>
  );
}
