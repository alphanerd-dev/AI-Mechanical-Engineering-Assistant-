import { useCallback, useState } from "react";
import { useProjectDrawingActions } from "./useProjectDrawingActions";
import { useProjectDrawingsData } from "./useProjectDrawingsData";
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
  const clearActionError = actions.clearError;
  const refreshDrawingData = data.refresh;
  const refresh = useCallback(async () => {
    clearActionError();
    await refreshDrawingData();
  }, [clearActionError, refreshDrawingData]);
  return {
    ...data,
    ...actions,
    modelIdentityId,
    setModelIdentityId,
    file,
    setFile,
    error: actions.error ?? data.error,
    refresh
  };
}
