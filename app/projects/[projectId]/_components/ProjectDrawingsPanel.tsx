"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, FilePlus2, FileText, RefreshCw, Upload } from "lucide-react";
import ProjectDrawingList from "./ProjectDrawingList";
import ProjectDrawingPreview from "./ProjectDrawingPreview";
import styles from "./ProjectDrawingsPanel.module.css";

export type DrawingRecord = {
  id: string;
  projectId: string;
  modelIdentityId: string | null;
  displayName: string;
  format: "PDF" | "SVG" | "DXF";
  mediaType: string;
  byteSize: number;
  sha256: string;
  parserVersion: string;
  units: string | null;
  entityCount: number | null;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  warnings: string[];
  createdAt: string;
  signedUrl: string | null;
  isStale?: boolean | null;
  sourceRevisionNumber?: number | null;
  generatorId?: string | null;
};

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  if (typeof value !== "object") return null;
  if (Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function drawingUploadIdFromBody(body: unknown): string | null {
  const record = asObjectRecord(body);
  if (!record) return null;
  const drawing = asObjectRecord(record.drawing);
  if (!drawing) return null;
  const id = drawing.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function drawingUploadError(body: unknown): string {
  const record = asObjectRecord(body);
  if (!record) return "Drawing upload failed.";
  const error = record.error;
  if (typeof error === "string") return error;
  return "Drawing upload failed.";
}

async function readDrawingUploadId(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => ({}));
  const id = drawingUploadIdFromBody(body);
  if (response.ok && id) return id;
  throw new Error(drawingUploadError(body));
}

async function submitDrawingUpload(projectId: string, modelIdentityId: string, file: File): Promise<string> {
  const form = new FormData();
  form.set("projectId", projectId);
  if (modelIdentityId) form.set("modelIdentityId", modelIdentityId);
  form.set("file", file);
  const response = await fetch("/api/cad/drawings", { method: "POST", body: form });
  return readDrawingUploadId(response);
}

async function submitShaftDrawingGeneration(projectId: string, modelIdentityId: string): Promise<string> {
  const response = await fetch("/api/cad/drawings/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, modelIdentityId })
  });
  const body: unknown = await response.json().catch(() => ({}));
  const record = asObjectRecord(body);
  const drawing = asObjectRecord(record?.drawing);
  if (response.ok && typeof drawing?.id === "string") return drawing.id;
  throw new Error(typeof record?.error === "string" ? record.error : "Preliminary shaft drawing generation failed.");
}

export default function ProjectDrawingsPanel({ projectId, models }: {
  projectId: string;
  models: Array<{ id: string; name: string }>;
}) {
  const [drawings, setDrawings] = useState<DrawingRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [modelIdentityId, setModelIdentityId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const generationBlocked = !modelIdentityId || generating || uploading;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = useMemo(() => drawings.find((item) => item.id === selectedId) ?? drawings[0] ?? null, [drawings, selectedId]);

  const loadDrawings = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(
        "/api/cad/drawings?projectId=" + encodeURIComponent(projectId),
        { cache: "no-store", signal }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body.drawings)) {
        throw new Error(typeof body.error === "string" ? body.error : "Project drawings could not be loaded.");
      }
      const items = body.drawings as DrawingRecord[];
      setDrawings(items);
      setSelectedId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? "");
      setError(null);
    } catch (cause) {
      if (!signal?.aborted) {
        setError(cause instanceof Error ? cause.message : "Project drawings could not be loaded.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [projectId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await loadDrawings();
  }, [loadDrawings]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDrawings(controller.signal);
    return () => controller.abort();
  }, [loadDrawings]);

  const generateShaftDrawing = async () => {
    if (generationBlocked) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const drawingId = await submitShaftDrawingGeneration(projectId, modelIdentityId);
      setNotice("Preliminary shaft drawing generated from the current accepted geometry revision. Not for manufacture.");
      await refresh();
      setSelectedId(drawingId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preliminary shaft drawing generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const drawingId = await submitDrawingUpload(projectId, modelIdentityId, file);
      setFile(null);
      setNotice("Drawing uploaded to private project storage. Preview is read-only and does not validate dimensions.");
      await refresh();
      setSelectedId(drawingId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Drawing upload failed.");
    } finally {
      setUploading(false);
    }
  };

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
        selectedId={selected?.id ?? ""}
        onSelect={setSelectedId}
      />
      <ProjectDrawingPreview selected={selected} />
    </div>
  </section>;
}
