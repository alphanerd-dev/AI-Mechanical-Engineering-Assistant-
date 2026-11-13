"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, FilePlus2, FileText, RefreshCw, Upload } from "lucide-react";
import DrawingViewer from "../../../../src/drawings/DrawingViewer";
import type { CadModel } from "./ProjectModuleWorkspace.types";
import styles from "./ProjectModuleWorkspace.module.css";

type DrawingRecord = {
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
};

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = useMemo(() => drawings.find((item) => item.id === selectedId) ?? drawings[0] ?? null, [drawings, selectedId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cad/drawings?projectId=" + encodeURIComponent(projectId), { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body.drawings)) throw new Error(typeof body.error === "string" ? body.error : "Project drawings could not be loaded.");
      setDrawings(body.drawings as DrawingRecord[]);
      setSelectedId((current) => body.drawings.some((item: DrawingRecord) => item.id === current) ? current : body.drawings[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project drawings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("projectId", projectId);
      if (modelIdentityId) form.set("modelIdentityId", modelIdentityId);
      form.set("file", file);
      const response = await fetch("/api/cad/drawings", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.drawing) throw new Error(typeof body.error === "string" ? body.error : "Drawing upload failed.");
      setFile(null);
      setNotice("Drawing uploaded to private project storage. Preview is read-only and does not validate dimensions.");
      await refresh();
      if (body.drawing.id) setSelectedId(body.drawing.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Drawing upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return <section className="modulePanel">
    <header className="modulePanelHeader">
      <div><h2>Project drawings</h2><p>Upload and inspect PDF, safe-subset SVG and bounded ASCII DXF source drawings.</p></div>
      <button type="button" className="button secondaryButton" onClick={() => void refresh()} disabled={loading}>
        <RefreshCw size={13} aria-hidden="true" /> Refresh
      </button>
    </header>
    <form onSubmit={upload} className="moduleStack">
      <div className="moduleTwoColumn">
        <label className="moduleField"><span>Attach to CAD model (optional)</span>
          <select value={modelIdentityId} onChange={(event) => setModelIdentityId(event.target.value)}>
            <option value="">Project-level drawing</option>
            {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
        <label className="moduleField"><span>Drawing file · max 4 MiB</span>
          <input type="file" accept=".pdf,.svg,.dxf,application/pdf,image/svg+xml,application/dxf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className="moduleHeaderActions">
        <button type="submit" className="button workspacePrimaryAction" disabled={!file || uploading}>
          <Upload size={13} aria-hidden="true" /> {uploading ? "Uploading…" : "Upload drawing"}
        </button>
        {file && <span className="moduleSmallNote">{file.name} · {(file.size / 1024).toFixed(1)} KiB</span>}
      </div>
    </form>
    {error && <p className="moduleError" role="alert"><AlertCircle size={13} />{error}</p>}
    {notice && <p className="moduleNotice" role="status">{notice}</p>}
    <div className="moduleTwoColumn">
      <div className="moduleStack">
        <h3>Stored drawings · {drawings.length}</h3>
        {loading ? <p className="moduleSmallNote">Loading project drawings…</p> :
          drawings.length === 0 ? <div className="moduleEmptyState"><span className="moduleEmptyIcon"><FilePlus2 size={20} /></span><strong>No drawings uploaded</strong><p>Upload a PDF, safe-subset SVG or ASCII DXF to begin.</p></div> :
          drawings.map((drawing) => <button key={drawing.id} type="button" className="moduleArtifactRow" aria-pressed={selected?.id === drawing.id} onClick={() => setSelectedId(drawing.id)}>
            <FileText size={15} aria-hidden="true" />
            <span><strong>{drawing.displayName}</strong><small>{drawing.format} · {dateLabel(drawing.createdAt)} · {drawing.units ?? "units not recorded"}</small></span>
          </button>)}
      </div>
      <div className="moduleStack">
        <h3>Read-only preview</h3>
        {selected?.signedUrl ? <DrawingViewer key={selected.id} src={selected.signedUrl} mediaType={selected.mediaType} label={selected.displayName} /> :
          <div className="moduleEmptyState"><span className="moduleEmptyIcon"><FileText size={20} /></span><strong>No drawing selected</strong><p>Choose an uploaded drawing with an available short-lived access URL.</p></div>}
        {selected && <p className="moduleSmallNote">
          SHA-256 {selected.sha256.slice(0, 16)}… · {selected.entityCount === null ? selected.parserVersion : selected.entityCount + " parsed entities"} · Source drawing is not a validated CAD model.
        </p>}
      </div>
    </div>
  </section>;
}
