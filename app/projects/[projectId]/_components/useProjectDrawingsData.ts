import { useCallback, useEffect, useMemo, useState } from "react";
import type { DrawingRecord } from "./project-drawings-types";

async function fetchProjectDrawings(projectId: string, signal?: AbortSignal): Promise<DrawingRecord[]> {
  const response = await fetch(
    "/api/cad/drawings?projectId=" + encodeURIComponent(projectId),
    { cache: "no-store", signal }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.drawings)) {
    throw new Error(typeof body.error === "string" ? body.error : "Project drawings could not be loaded.");
  }
  return body.drawings as DrawingRecord[];
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

function completeLoad(
  signal: AbortSignal | undefined,
  setLoading: (loading: boolean) => void
): void {
  if (!signal?.aborted) setLoading(false);
}

export function useProjectDrawingsData(projectId: string) {
  const [drawings, setDrawings] = useState<DrawingRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(
    () => drawings.find((item) => item.id === selectedId) ?? drawings[0] ?? null,
    [drawings, selectedId]
  );

  const loadDrawings = useCallback(async (signal?: AbortSignal) => {
    try {
      const items = await fetchProjectDrawings(projectId, signal);
      setDrawings(items);
      setSelectedId((current) => selectedDrawingId(items, current));
      setError(null);
    } catch (cause) {
      recordLoadFailure(cause, signal, setError);
    } finally {
      completeLoad(signal, setLoading);
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

  return { drawings, selected, selectedId, setSelectedId, loading, error, refresh };
}
