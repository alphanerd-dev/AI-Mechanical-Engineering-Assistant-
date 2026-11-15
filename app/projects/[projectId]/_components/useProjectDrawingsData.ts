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

  return { drawings, selected, selectedId, setSelectedId, loading, error, refresh };
}
