import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

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
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function drawingUploadIdFromBody(body: unknown): string | null {
  const record = asObjectRecord(body);
  const drawing = asObjectRecord(record?.drawing);
  return typeof drawing?.id === "string" && drawing.id.length > 0 ? drawing.id : null;
}

function drawingUploadError(body: unknown): string {
  const error = asObjectRecord(body)?.error;
  return typeof error === "string" ? error : "Drawing upload failed.";
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

export function useProjectDrawings(projectId: string) {
  const [drawings, setDrawings] = useState<DrawingRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [modelIdentityId, setModelIdentityId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generationBlocked = !modelIdentityId || generating || uploading;
  const selected = useMemo(
    () => drawings.find((item) => item.id === selectedId) ?? drawings[0] ?? null,
    [drawings, selectedId]
  );

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

  return {
    drawings, selectedId, setSelectedId, modelIdentityId, setModelIdentityId,
    file, setFile, loading, uploading, generating, generationBlocked,
    error, notice, refresh, generateShaftDrawing, upload, selected
  };
}
