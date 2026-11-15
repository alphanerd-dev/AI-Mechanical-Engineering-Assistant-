import { useCallback, useState } from "react";
import { useDrawingUpload } from "./useDrawingUpload";
import { useShaftDrawingGeneration } from "./useShaftDrawingGeneration";

export function useProjectDrawingActions(input: {
  projectId: string;
  modelIdentityId: string;
  file: File | null;
  setFile: (file: File | null) => void;
  refresh: () => Promise<void>;
  setSelectedId: (drawingId: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generationBlocked = !input.modelIdentityId || generating || uploading;
  const clearError = useCallback(() => setError(null), []);
  const upload = useDrawingUpload({
    ...input, uploading, generating, setUploading, setError, setNotice
  });
  const generateShaftDrawing = useShaftDrawingGeneration({
    projectId: input.projectId,
    modelIdentityId: input.modelIdentityId,
    blocked: generationBlocked,
    setGenerating, setError, setNotice,
    refresh: input.refresh,
    setSelectedId: input.setSelectedId
  });
  return { uploading, generating, generationBlocked, error, notice, clearError, upload, generateShaftDrawing };
}
