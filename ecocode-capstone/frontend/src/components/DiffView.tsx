import React from "react";

/**
 * Minimal side-by-side diff viewer.
 * Uses a Myers-style LCS to align lines, then renders two columns
 * (Before / After) with added/removed/unchanged cell states.
 * No external dependencies.
 */

type LineOp = "equal" | "remove" | "add";
type DiffRow = { op: LineOp; left: string | null; right: string | null };

function tokenize(s: string): string[] {
  return s.split(/\r?\n/);
}

/**
 * Classic LCS dynamic programming over line arrays.
 * Returns an array of DiffRow tuples, each representing one aligned position.
 */
function lineDiff(beforeText: string, afterText: string): DiffRow[] {
  const a = tokenize(beforeText);
  const b = tokenize(afterText);
  const n = a.length;
  const m = b.length;

  // DP table of LCS lengths.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build the diff rows.
  const rows: DiffRow[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      rows.unshift({ op: "equal", left: a[i - 1], right: b[j - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      rows.unshift({ op: "remove", left: a[i - 1], right: null });
      i--;
    } else {
      rows.unshift({ op: "add", left: null, right: b[j - 1] });
      j--;
    }
  }
  while (i > 0) { rows.unshift({ op: "remove", left: a[--i + 1 - 1], right: null }); i; break; }
  // Fix the above (cleaner loop):
  while (i > 0) {
    rows.unshift({ op: "remove", left: a[i - 1], right: null });
    i--;
  }
  while (j > 0) {
    rows.unshift({ op: "add", left: null, right: b[j - 1] });
    j--;
  }

  return rows;
}

interface Props {
  before: string;
  after: string;
  startLine?: number;  // optional — if provided, shows real line numbers
}

export default function DiffView({ before, after, startLine }: Props) {
  const rows = React.useMemo(() => lineDiff(before, after), [before, after]);

  // Separate row-number counters for the two columns.
  let leftNum = startLine ?? 1;
  let rightNum = startLine ?? 1;

  return (
    <div className="diff-view">
      <div className="diff-view-head">
        <div className="diff-view-head-cell">Before</div>
        <div className="diff-view-head-cell">After</div>
      </div>
      <div className="diff-view-body">
        {rows.map((row, idx) => {
          const leftNumDisplay = row.left !== null ? leftNum++ : "";
          const rightNumDisplay = row.right !== null ? rightNum++ : "";
          return (
            <div key={idx} className={`diff-row diff-row-${row.op}`}>
              <div className="diff-cell diff-cell-left">
                <span className="diff-line-num">{leftNumDisplay}</span>
                <span className="diff-line-marker">
                  {row.op === "remove" ? "\u2212" : row.op === "equal" ? "\u00a0" : ""}
                </span>
                <span className="diff-line-content">{row.left ?? ""}</span>
              </div>
              <div className="diff-cell diff-cell-right">
                <span className="diff-line-num">{rightNumDisplay}</span>
                <span className="diff-line-marker">
                  {row.op === "add" ? "+" : row.op === "equal" ? "\u00a0" : ""}
                </span>
                <span className="diff-line-content">{row.right ?? ""}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
