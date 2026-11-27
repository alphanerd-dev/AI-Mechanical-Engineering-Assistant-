"use client";

import { RefreshCw } from "lucide-react";
import ProjectDrawingList from "./ProjectDrawingList";
import ProjectDrawingPreview from "./ProjectDrawingPreview";
import ProjectDrawingUploadForm from "./ProjectDrawingUploadForm";
import { useProjectDrawings } from "./useProjectDrawings";
import styles from "./ProjectDrawingsPanel.module.css";

export type { DrawingRecord } from "./useProjectDrawings";

export default function ProjectDrawingsPanel({ projectId, models }: {
  projectId: string;
  models: Array<{ id: string; name: string }>;
}) {
  const state = useProjectDrawings(projectId);
  return <section id="project-drawings" className={styles.panel} aria-labelledby="project-drawings-heading">
    <header className={styles.header}>
      <div><h2 id="project-drawings-heading">Project drawings</h2><p>Upload and inspect PDF, safe-subset SVG and bounded ASCII DXF source drawings.</p></div>
      <button type="button" className={styles.secondary} onClick={() => void state.refresh()} disabled={state.loading}>
        <RefreshCw size={13} aria-hidden="true" /> Refresh
      </button>
    </header>
    <ProjectDrawingUploadForm models={models} state={state} />
    <div className={styles.contentGrid}>
      <ProjectDrawingList
        drawings={state.drawings}
        loading={state.loading}
        selectedId={state.selected?.id ?? state.selectedId}
        onSelect={state.setSelectedId}
      />
      <ProjectDrawingPreview selected={state.selected} />
    </div>
  </section>;
}
