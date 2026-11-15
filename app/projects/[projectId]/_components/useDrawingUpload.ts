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
  const upload = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const selectedFile = input.file;
    if (!selectedFile || input.uploading || input.generating) return;
    input.setUploading(true);
    input.setError(null);
    input.setNotice(null);
    try {
      const drawingId = await submitDrawingUpload(input.projectId, input.modelIdentityId, selectedFile);
      input.setFile(null);
      input.setNotice("Drawing uploaded to private project storage. Preview is read-only and does not validate dimensions.");
      await input.refresh();
      input.setSelectedId(drawingId);
    } catch (cause) {
      input.setError(cause instanceof Error ? cause.message : "Drawing upload failed.");
    } finally {
      input.setUploading(false);
    }
  }, [input]);
  return upload;
}
