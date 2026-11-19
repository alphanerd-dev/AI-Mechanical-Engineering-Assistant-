import { useCallback, useEffect, useMemo, useState } from "react";
import type { DrawingRecord } from "./project-drawings-types";

function isDrawingResponseRecord(value: unknown): value is Record<string, unknown> {
  if (value === null) return false;
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  return true;
}

function parseProjectDrawingList(responseOk: boolean, body: unknown): DrawingRecord[] {
  if (!isDrawingResponseRecord(body)) throw new Error("Project drawings could not be loaded.");
  if (!responseOk) {
    throw new Error(typeof body.error === "string" ? body.error : "Project drawings could not be loaded.");
  }
  if (!Array.isArray(body.drawings)) throw new Error("Project drawings could not be loaded.");
  return body.drawings as DrawingRecord[];
}

async function fetchProjectDrawings(projectId: string, signal?: AbortSignal): Promise<DrawingRecord[]> {
  const response = await fetch(
    "/api/cad/drawings?projectId=" + encodeURIComponent(projectId),
    { cache: "no-store", signal }
  );
  const body: unknown = await response.json().catch(() => null);
  return parseProjectDrawingList(response.ok, body);
}

function selectedDrawingId(items: DrawingRecord[], currentId: string): string {
  return items.some((item) => item.id === currentId) ? currentId : items[0]?.id ?? "";
}

function recordLoadFailure(
  cause: unknown,
  signal: AbortSignal | undefined,
  setError: (message: string) => void
): void {
  if (signal?.aborted) return;
  setError(cause instanceof Error ? cause.message : "Project drawings could not be loaded.");
}

export function useProjectDrawingsData(projectId: string) {
  const [drawings, setDrawings] = useState<DrawingRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loading = refreshing || loadedProjectId !== projectId;
  const selected = useMemo(
    () => drawings.find((item) => item.id === selectedId) ?? drawings[0] ?? null,
    [drawings, selectedId]
  );

  const applyDrawings = useCallback((items: DrawingRecord[]) => {
    setDrawings(items);
    setSelectedId((current) => selectedDrawingId(items, current));
    setError(null);
  }, []);

  const applyLoadFailure = useCallback((cause: unknown, signal?: AbortSignal) => {
    recordLoadFailure(cause, signal, setError);
  }, []);

  const markProjectLoaded = useCallback(() => {
    setLoadedProjectId(projectId);
  }, [projectId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const items = await fetchProjectDrawings(projectId);
      applyDrawings(items);
    } catch (cause) {
      applyLoadFailure(cause);
    } finally {
      markProjectLoaded();
      setRefreshing(false);
    }
  }, [projectId, applyDrawings, applyLoadFailure, markProjectLoaded]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchProjectDrawings(projectId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) applyDrawings(items);
      })
      .catch((cause: unknown) => applyLoadFailure(cause, controller.signal))
      .finally(() => {
        if (!controller.signal.aborted) markProjectLoaded();
      });
    return () => controller.abort();
  }, [projectId, applyDrawings, applyLoadFailure, markProjectLoaded]);

  return { drawings, selected, selectedId, setSelectedId, loading, error, refresh };
}
