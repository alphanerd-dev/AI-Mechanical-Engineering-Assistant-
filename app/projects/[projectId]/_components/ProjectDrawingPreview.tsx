import DrawingViewer from "../../../../src/drawings/DrawingViewer";
import type { DrawingRecord } from "./project-drawings-types";
import styles from "./ProjectDrawingsPanel.module.css";

export default function ProjectDrawingPreview({ selected }: { selected: DrawingRecord | null }) {
  return <div className="moduleStack">
    <h3>Read-only preview</h3>
    {selected?.signedUrl ? <DrawingViewer key={selected.id} src={selected.signedUrl} mediaType={selected.mediaType} label={selected.displayName} /> :
      <div className={styles.empty}><span aria-hidden="true">▤</span><strong>No drawing selected</strong><p>Choose an uploaded drawing with an available short-lived access URL.</p></div>}
    {selected?.isStale && <p className={styles.warning} role="status">This drawing was generated from an older geometry revision. Do not use it as the current model drawing; regenerate from the latest accepted revision.</p>}
    {selected && <p className={styles.meta}>
      SHA-256 {selected.sha256.slice(0, 16)}… · {selected.entityCount === null ? selected.parserVersion : selected.entityCount + " parsed entities"} · {selected.generatorId ? "Generated from revision " + selected.sourceRevisionNumber + ". " : ""}Source drawing is not a validated CAD model.
    </p>}
  </div>;
}
