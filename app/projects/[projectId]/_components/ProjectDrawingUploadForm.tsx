import { FilePlus2, Upload } from "lucide-react";
import type { useProjectDrawings } from "./useProjectDrawings";
import styles from "./ProjectDrawingsPanel.module.css";

type DrawingState = ReturnType<typeof useProjectDrawings>;

export default function ProjectDrawingUploadForm({
  models, state
}: {
  models: Array<{ id: string; name: string }>;
  state: DrawingState;
}) {
  return <>
    <form onSubmit={state.upload} className={styles.form}>
      <div className={styles.formGrid}>
        <label className={styles.field}><span>Attach to CAD model (optional)</span>
          <select value={state.modelIdentityId} onChange={(event) => state.setModelIdentityId(event.target.value)}>
            <option value="">Project-level drawing</option>
            {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
        <label className={styles.field}><span>Drawing file · max 4 MiB</span>
          <input type="file" accept=".pdf,.svg,.dxf,application/pdf,image/svg+xml,application/dxf" onChange={(event) => state.setFile(event.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={!state.file || state.uploading || state.generating}>
          <Upload size={13} aria-hidden="true" /> {state.uploading ? "Uploading…" : "Upload drawing"}
        </button>
        <button type="button" className={styles.secondary} onClick={() => void state.generateShaftDrawing()} disabled={state.generationBlocked || state.loading}>
          <FilePlus2 size={13} aria-hidden="true" /> {state.generating ? "Generating…" : "Generate preliminary shaft drawing"}
        </button>
        {state.file && <span className={styles.meta}>{state.file.name} · {(state.file.size / 1024).toFixed(1)} KiB</span>}
      </div>
    </form>
    {state.error && <p className={styles.error} role="alert">{state.error}</p>}
    {state.notice && <p className={styles.notice} role="status">{state.notice}</p>}
  </>;
}
