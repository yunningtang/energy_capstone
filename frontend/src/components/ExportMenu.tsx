import React from "react";
import { Download, ChevronDown } from "lucide-react";

interface Props {
  onCsv: () => void;
  onJson: () => void;
  onMarkdown: () => void;
}

export default function ExportMenu({ onCsv, onJson, onMarkdown }: Props) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(fn: () => void) {
    fn();
    setOpen(false);
  }

  return (
    <div className="export-menu" ref={ref}>
      <button
        className="btn outline btn-sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={14} />
        <span>Export</span>
        <ChevronDown size={12} style={{ opacity: 0.6, marginLeft: 2 }} />
      </button>
      {open && (
        <div className="export-menu-pop" role="menu">
          <button role="menuitem" className="export-menu-item" onClick={() => pick(onMarkdown)}>
            <span className="export-menu-item-label">Markdown report</span>
            <span className="export-menu-item-hint">.md · human-readable</span>
          </button>
          <button role="menuitem" className="export-menu-item" onClick={() => pick(onJson)}>
            <span className="export-menu-item-label">JSON</span>
            <span className="export-menu-item-hint">.json · raw data</span>
          </button>
          <button role="menuitem" className="export-menu-item" onClick={() => pick(onCsv)}>
            <span className="export-menu-item-label">CSV</span>
            <span className="export-menu-item-hint">.csv · table view</span>
          </button>
        </div>
      )}
    </div>
  );
}
