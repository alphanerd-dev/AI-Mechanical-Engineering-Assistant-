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
  return useCallback(async () => {
    if (input.blocked) return;
    input.setGenerating(true);
    input.setError(null);
    input.setNotice(null);
    try {
      const drawingId = await submitShaftDrawingGeneration(input.projectId, input.modelIdentityId);
      input.setNotice("Preliminary shaft drawing generated from the current accepted geometry revision. Not for manufacture.");
      await input.refresh();
      input.setSelectedId(drawingId);
    } catch (cause) {
      input.setError(cause instanceof Error ? cause.message : "Preliminary shaft drawing generation failed.");
    } finally {
      input.setGenerating(false);
    }
  }, [input]);
}
