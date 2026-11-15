import { useState } from "react";
import { useProjectDrawingActions } from "./useProjectDrawingActions";
import { useProjectDrawingsData } from "./useProjectDrawingsData";
import type { DrawingRecord } from "./project-drawings-types";

export type { DrawingRecord } from "./project-drawings-types";

export function useProjectDrawings(projectId: string) {
  const [modelIdentityId, setModelIdentityId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const data = useProjectDrawingsData(projectId);
  const actions = useProjectDrawingActions({
    projectId,
    modelIdentityId,
    file,
    setFile,
    refresh: data.refresh,
    setSelectedId: data.setSelectedId
  });
  return {
    ...data,
    ...actions,
    modelIdentityId,
    setModelIdentityId,
    file,
    setFile,
    error: actions.error ?? data.error
  };
}
