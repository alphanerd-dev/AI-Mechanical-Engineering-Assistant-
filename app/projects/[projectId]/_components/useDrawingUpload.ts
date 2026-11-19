import { useCallback, type FormEvent } from "react";
import { submitDrawingUpload } from "./project-drawings-api";

export function useDrawingUpload(input: {
  projectId: string;
  modelIdentityId: string;
  file: File | null;
  setFile: (file: File | null) => void;
  uploading: boolean;
  generating: boolean;
  setUploading: (value: boolean) => void;
  setError: (value: string | null) => void;
  setNotice: (value: string | null) => void;
  refresh: () => Promise<void>;
  setSelectedId: (drawingId: string) => void;
}) {
  const {
    projectId, modelIdentityId, file, setFile, uploading, generating,
    setUploading, setError, setNotice, refresh, setSelectedId
  } = input;
  return useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    if (uploading) return;
    if (generating) return;
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
  }, [
    file, uploading, generating, projectId, modelIdentityId, setFile,
    setUploading, setError, setNotice, refresh, setSelectedId
  ]);
}
