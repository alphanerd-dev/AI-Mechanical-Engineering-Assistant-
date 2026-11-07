"use client";

import { ShieldCheck } from "lucide-react";
import type { WorkspaceView } from "./useEngineeringWorkspaceNavigation";
import EngineeringWorkspaceTabs from "./EngineeringWorkspaceTabs";
import styles from "./EngineeringPage.module.css";

export default function EngineeringWorkspaceHeader({
  activeView,
  onViewChange,
}: {
  activeView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
}) {
  return (
    <header className={styles.workspaceBar}>
      <div className={styles.workspaceIntro}>
        <div>
          <strong>Engineering workspace</strong>
          <span>One workspace, two controlled modes.</span>
        </div>
        <p className={styles.workspaceTrust}>
          <ShieldCheck size={13} aria-hidden="true" />
          Execution, validation and approval remain separate
        </p>
      </div>
      <EngineeringWorkspaceTabs activeView={activeView} onViewChange={onViewChange} />
    </header>
  );
}
