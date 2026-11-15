import { useCallback, useState, type FormEvent } from "react";
import { submitDrawingUpload, submitShaftDrawingGeneration } from "./project-drawings-api";

function actionErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error) return cause.message;
  return fallback;
}

export function useProjectDrawingActions(input: {
  projectId: string;
  modelIdentityId: string;
  file: File | null;
  setFile: (file: File | null) => void;
  refresh: () => Promise<void>;
  setSelectedId: (drawingId: string) => void;
}) {
  const {
    projectId, modelIdentityId, file, setFile, refresh, setSelectedId
  } = input;
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generationBlocked = !modelIdentityId || generating || uploading;

  const generateShaftDrawing = useCallback(async () => {
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
      setError(actionErrorMessage(cause, "Preliminary shaft drawing generation failed."));
    } finally {
      setGenerating(false);
    }
  }, [generationBlocked, projectId, modelIdentityId, refresh, setSelectedId]);

  const upload = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedFile = file;
    if (!selectedFile || uploading) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const drawingId = await submitDrawingUpload(projectId, modelIdentityId, selectedFile);
      setFile(null);
      setNotice("Drawing uploaded to private project storage. Preview is read-only and does not validate dimensions.");
      await refresh();
      setSelectedId(drawingId);
    } catch (cause) {
      setError(actionErrorMessage(cause, "Drawing upload failed."));
    } finally {
      setUploading(false);
    }
  }, [file, uploading, projectId, modelIdentityId, setFile, refresh, setSelectedId]);

  return { uploading, generating, generationBlocked, error, notice, generateShaftDrawing, upload };
}
