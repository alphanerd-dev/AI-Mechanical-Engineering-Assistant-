"use client";

import { AlertCircle, FilePlus2, RefreshCw, Upload } from "lucide-react";
import ProjectDrawingList from "./ProjectDrawingList";
import ProjectDrawingPreview from "./ProjectDrawingPreview";
import { useProjectDrawings } from "./useProjectDrawings";
import styles from "./ProjectDrawingsPanel.module.css";

export type { DrawingRecord } from "./useProjectDrawings";

export default function ProjectDrawingsPanel({ projectId, models }: {
  projectId: string;
  models: Array<{ id: string; name: string }>;
}) {
  const {
    drawings, selected, selectedId, setSelectedId,
    modelIdentityId, setModelIdentityId, file, setFile,
    loading, uploading, generating, generationBlocked,
    error, notice, refresh, generateShaftDrawing, upload
  } = useProjectDrawings(projectId);

  return <section className={styles.panel}>
    <header className={styles.header}>
      <div><h2>Project drawings</h2><p>Upload and inspect PDF, safe-subset SVG and bounded ASCII DXF source drawings.</p></div>
      <button type="button" className={styles.secondary} onClick={() => void refresh()} disabled={loading}>
        <RefreshCw size={13} aria-hidden="true" /> Refresh
      </button>
    </header>
    <form onSubmit={upload} className={styles.form}>
      <div className={styles.formGrid}>
        <label className={styles.field}><span>Attach to CAD model (optional)</span>
          <select value={modelIdentityId} onChange={(event) => setModelIdentityId(event.target.value)}>
            <option value="">Project-level drawing</option>
            {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
        <label className={styles.field}><span>Drawing file · max 4 MiB</span>
          <input type="file" accept=".pdf,.svg,.dxf,application/pdf,image/svg+xml,application/dxf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={!file || uploading || generating}>
          <Upload size={13} aria-hidden="true" /> {uploading ? "Uploading…" : "Upload drawing"}
        </button>
        <button type="button" className={styles.secondary} onClick={() => void generateShaftDrawing()} disabled={generationBlocked || loading}>
          <FilePlus2 size={13} aria-hidden="true" /> {generating ? "Generating…" : "Generate preliminary shaft drawing"}
        </button>
        {file && <span className={styles.meta}>{file.name} · {(file.size / 1024).toFixed(1)} KiB</span>}
      </div>
    </form>
    {error && <p className={styles.error} role="alert"><AlertCircle size={13} />{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.contentGrid}>
      <ProjectDrawingList
        drawings={drawings}
        loading={loading}
        selectedId={selected?.id ?? selectedId}
        onSelect={setSelectedId}
      />
      <ProjectDrawingPreview selected={selected} />
    </div>
  </section>;
}
