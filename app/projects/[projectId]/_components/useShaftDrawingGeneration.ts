import { useCallback } from "react";
import { submitShaftDrawingGeneration } from "./project-drawings-api";

export function useShaftDrawingGeneration(input: {
  projectId: string;
  modelIdentityId: string;
  blocked: boolean;
  setGenerating: (value: boolean) => void;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
  refresh: () => Promise<void>;
  setSelectedId: (drawingId: string) => void;
}) {
  const {
    projectId, modelIdentityId, blocked, setGenerating,
    setError, setNotice, refresh, setSelectedId
  } = input;
  return useCallback(async () => {
    if (blocked) return;
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
  }, [
    blocked, projectId, modelIdentityId, setGenerating,
    setError, setNotice, refresh, setSelectedId
  ]);
}
