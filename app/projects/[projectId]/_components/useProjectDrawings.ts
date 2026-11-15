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
  const refresh = useCallback(async () => {
    actions.clearError();
    await data.refresh();
  }, [actions.clearError, data.refresh]);
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
