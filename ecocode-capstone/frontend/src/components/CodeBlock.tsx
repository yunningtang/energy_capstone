import React from "react";

/**
 * Lightweight Java syntax highlighter + line numbering + line highlighting.
 * No external dependencies.
 */

const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "instanceof", "int", "interface", "long", "native", "new", "null",
  "package", "private", "protected", "public", "return", "short", "static",
  "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
  "transient", "try", "void", "volatile", "while", "true", "false",
]);

type Token = { type: string; value: string };

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    const ch = line[i];

    // Line comment
    if (ch === "/" && line[i + 1] === "/") {
      tokens.push({ type: "comment", value: line.slice(i) });
      break;
    }

    // Block comment markers (single-line only — full block handled at line level)
    if (ch === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      if (end !== -1) {
        tokens.push({ type: "comment", value: line.slice(i, end + 2) });
        i = end + 2;
        continue;
      }
      tokens.push({ type: "comment", value: line.slice(i) });
      break;
    }

    // String literal
    if (ch === '"') {
      let j = i + 1;
      while (j < len && line[j] !== '"') {
        if (line[j] === "\\") j++;
        j++;
      }
      tokens.push({ type: "string", value: line.slice(i, Math.min(j + 1, len)) });
      i = j + 1;
      continue;
    }

    // Char literal
    if (ch === "'") {
      let j = i + 1;
      while (j < len && line[j] !== "'") {
        if (line[j] === "\\") j++;
        j++;
      }
      tokens.push({ type: "string", value: line.slice(i, Math.min(j + 1, len)) });
      i = j + 1;
      continue;
    }

    // Annotation
    if (ch === "@") {
      let j = i + 1;
      while (j < len && /[A-Za-z0-9_]/.test(line[j])) j++;
      tokens.push({ type: "annotation", value: line.slice(i, j) });
      i = j;
      continue;
    }

    // Number
    if (/\d/.test(ch)) {
      let j = i;
      while (j < len && /[\d.xXa-fA-FlLfF]/.test(line[j])) j++;
      tokens.push({ type: "number", value: line.slice(i, j) });
      i = j;
      continue;
    }

    // Identifier / keyword
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < len && /[A-Za-z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (JAVA_KEYWORDS.has(word)) {
        tokens.push({ type: "keyword", value: word });
      } else if (/^[A-Z]/.test(word)) {
        tokens.push({ type: "type", value: word });
      } else {
        tokens.push({ type: "ident", value: word });
      }
      i = j;
      continue;
    }

    // Everything else (operators, punctuation, whitespace)
    tokens.push({ type: "plain", value: ch });
    i++;
  }

  return tokens;
}

function renderTokens(tokens: Token[], keyPrefix: string): React.ReactNode {
  return tokens.map((t, idx) => {
    if (t.type === "plain") return <span key={`${keyPrefix}-${idx}`}>{t.value}</span>;
    return (
      <span key={`${keyPrefix}-${idx}`} className={`tok-${t.type}`}>{t.value}</span>
    );
  });
}

export interface LineAnnotation {
  /** Short tag shown at end of line, e.g. "DW" */
  tag: string;
  /** Tooltip text shown on hover */
  message: string;
  /** Severity controls the underline color */
  severity?: "error" | "warning";
}

interface Props {
  code: string;
  highlightLines?: Set<number>;  // 1-indexed line numbers to highlight
  focusLine?: number;             // scroll into view
  /** Map from 1-indexed line number to annotation(s). Adds a spell-checker-style wavy underline. */
  annotations?: Map<number, LineAnnotation[]>;
}

export default function CodeBlock({ code, highlightLines, focusLine, annotations }: Props) {
  const lines = code.split("\n");
  const preRef = React.useRef<HTMLPreElement>(null);

  React.useEffect(() => {
    if (focusLine && preRef.current) {
      const el = preRef.current.querySelector<HTMLElement>(`[data-line="${focusLine}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusLine]);

  // For each tag, find the first annotated line number so we can render
  // the pill only there (the rest of the range keeps the underline but
  // drops the repeated label — eliminates the "NLMR×10" visual noise).
  const firstLineForTag = React.useMemo(() => {
    const m = new Map<string, number>();
    if (!annotations) return m;
    const sorted = Array.from(annotations.keys()).sort((a, b) => a - b);
    for (const ln of sorted) {
      const anns = annotations.get(ln) ?? [];
      for (const a of anns) {
        if (!m.has(a.tag)) m.set(a.tag, ln);
      }
    }
    return m;
  }, [annotations]);

  // Track multi-line block comment state
  let inBlockComment = false;

  return (
    <div className="code-block-wrapper">
      <pre className="code-block-pre" ref={preRef}>
        {lines.map((line, i) => {
          const lineNum = i + 1;
          const isHighlighted = highlightLines?.has(lineNum);
          const isFocus = focusLine === lineNum;
          const lineAnns = annotations?.get(lineNum);

          // Handle block comments spanning multiple lines
          let rendered: React.ReactNode;
          if (inBlockComment) {
            const end = line.indexOf("*/");
            if (end !== -1) {
              rendered = (
                <>
                  <span className="tok-comment">{line.slice(0, end + 2)}</span>
                  {renderTokens(tokenizeLine(line.slice(end + 2)), `l${lineNum}`)}
                </>
              );
              inBlockComment = false;
            } else {
              rendered = <span className="tok-comment">{line}</span>;
            }
          } else {
            // Check if this line starts a block comment that continues
            const blockStart = line.indexOf("/*");
            const blockEnd = line.indexOf("*/", blockStart + 2);
            if (blockStart !== -1 && blockEnd === -1) {
              rendered = (
                <>
                  {renderTokens(tokenizeLine(line.slice(0, blockStart)), `l${lineNum}`)}
                  <span className="tok-comment">{line.slice(blockStart)}</span>
                </>
              );
              inBlockComment = true;
            } else {
              rendered = renderTokens(tokenizeLine(line), `l${lineNum}`);
            }
          }

          const hasAnn = !!lineAnns && lineAnns.length > 0;
          const severity = lineAnns?.[0]?.severity ?? "error";

          return (
            <div
              key={lineNum}
              data-line={lineNum}
              className={`code-line ${isHighlighted ? "code-line-hl" : ""} ${isFocus ? "code-line-focus" : ""} ${hasAnn ? `code-line-ann code-line-ann-${severity}` : ""}`}
            >
              <span className="code-line-num">{lineNum}</span>
              <span className="code-line-content">
                <span className="code-line-text">{rendered}</span>
                {hasAnn && lineAnns && (
                  <span className="code-line-ann-tags">
                    {lineAnns
                      .filter((a) => firstLineForTag.get(a.tag) === lineNum)
                      .map((a, ai) => (
                        <span
                          key={ai}
                          className={`code-ann-tag code-ann-${a.severity ?? "error"}`}
                          title={a.message}
                        >
                          {a.tag}
                        </span>
                      ))}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

/**
 * Parse line_range strings like "42", "42-47", "L42-L47", "lines 42-47" into a Set<number>.
 */
export function parseLineRange(range: string | undefined): Set<number> {
  const result = new Set<number>();
  if (!range) return result;
  const re = /(\d+)(?:\s*[-–]\s*(\d+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(range)) !== null) {
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : start;
    for (let n = start; n <= end; n++) result.add(n);
  }
  return result;
}
