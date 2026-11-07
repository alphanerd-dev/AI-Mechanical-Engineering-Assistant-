"use client";

import EngineeringWorkspaceHeader from "./EngineeringWorkspaceHeader";
import {
  EngineeringChatPanel,
  EngineeringCorePanel,
} from "./EngineeringWorkspacePanels";
import { useEngineeringWorkspaceNavigation } from "./useEngineeringWorkspaceNavigation";
import styles from "./EngineeringPage.module.css";

export default function EngineeringWorkspace({ projectId }: { projectId: string }) {
  const navigation = useEngineeringWorkspaceNavigation(projectId);
  const hasEngineeringCore = projectId !== "demo";

  return (
    <div className={styles.workspace}>
      {hasEngineeringCore && (
        <EngineeringWorkspaceHeader
          activeView={navigation.activeView}
          onViewChange={navigation.setActiveView}
        />
      )}
      <EngineeringChatPanel
        projectId={projectId}
        panelRef={navigation.chatPanelRef}
        hidden={hasEngineeringCore && navigation.activeView !== "chat"}
      />
      {hasEngineeringCore && (
        <EngineeringCorePanel
          projectId={projectId}
          panelRef={navigation.corePanelRef}
          hidden={navigation.activeView !== "core"}
        />
      )}
    </div>
  );
}
