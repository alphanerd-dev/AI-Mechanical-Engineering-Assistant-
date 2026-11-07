"use client";

import EngineeringChat from "../../../../components/EngineeringChat";
import EngineeringInteraction from "./EngineeringInteraction";
import styles from "./EngineeringPage.module.css";
import type { RefObject } from "react";

export function EngineeringChatPanel({
  projectId,
  panelRef,
  hidden,
}: {
  projectId: string;
  panelRef: RefObject<HTMLElement | null>;
  hidden: boolean;
}) {
  return (
    <section
      ref={panelRef}
      id="engineering-chat-view"
      role={projectId === "demo" ? undefined : "tabpanel"}
      aria-labelledby={projectId === "demo" ? undefined : "engineering-chat-tab"}
      aria-label={projectId === "demo" ? undefined : "Chat guidance workspace"}
      tabIndex={-1}
      hidden={hidden}
      className={styles.workspaceView}
    >
      <EngineeringChat projectId={projectId} />
    </section>
  );
}

export function EngineeringCorePanel({
  projectId,
  panelRef,
  hidden,
}: {
  projectId: string;
  panelRef: RefObject<HTMLElement | null>;
  hidden: boolean;
}) {
  return (
    <section
      ref={panelRef}
      id="engineering-core-view"
      role="tabpanel"
      aria-labelledby="engineering-core-tab"
      tabIndex={-1}
      hidden={hidden}
      className={`${styles.workspaceView} ${styles.coreView}`}
    >
      <div className={styles.coreSurface}>
        <EngineeringInteraction projectId={projectId} />
      </div>
    </section>
  );
}
