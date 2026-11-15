import type { DrawingRecord } from "./ProjectDrawingsPanel";
import styles from "./ProjectDrawingsPanel.module.css";

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

export default function ProjectDrawingList({
  drawings, loading, selectedId, onSelect
}: {
  drawings: DrawingRecord[];
  loading: boolean;
  selectedId: string;
  onSelect: (drawingId: string) => void;
}) {
  return <div className={styles.column}>
    <h3>Stored drawings · {drawings.length}</h3>
    {loading ? <p className={styles.meta}>Loading project drawings…</p> :
      drawings.length === 0 ? <div className={styles.empty}><span><span aria-hidden="true">＋</span></span><strong>No drawings uploaded</strong><p>Upload a PDF, safe-subset SVG or ASCII DXF to begin.</p></div> :
      drawings.map((drawing) => <button key={drawing.id} type="button" className={styles.drawingRow} aria-pressed={selectedId === drawing.id} onClick={() => onSelect(drawing.id)}>
        <span aria-hidden="true">▤</span>
        <span><strong>{drawing.displayName}</strong><small>{drawing.format} · {dateLabel(drawing.createdAt)} · {drawing.units ?? "units not recorded"}{drawing.isStale ? " · STALE SOURCE" : drawing.generatorId ? " · GENERATED" : ""}</small></span>
      </button>)}
  </div>;
}
