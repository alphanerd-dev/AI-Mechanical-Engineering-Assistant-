"use client";

import { useRef, type KeyboardEvent } from "react";
import { MessageSquare, Workflow } from "lucide-react";
import type { WorkspaceView } from "./useEngineeringWorkspaceNavigation";
import styles from "./EngineeringPage.module.css";

const VIEW_ORDER: WorkspaceView[] = ["chat", "core"];

function nextWorkspaceView(current: WorkspaceView, key: string): WorkspaceView | undefined {
  if (key === "ArrowRight") return current === "chat" ? "core" : "chat";
  if (key === "ArrowLeft") return current === "core" ? "chat" : "core";
  if (key === "Home") return "chat";
  if (key === "End") return "core";
  return undefined;
}

export default function EngineeringWorkspaceTabs({
  activeView,
  onViewChange,
}: {
  activeView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
}) {
  const chatTabRef = useRef<HTMLButtonElement>(null);
  const coreTabRef = useRef<HTMLButtonElement>(null);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: WorkspaceView) {
    const next = nextWorkspaceView(current, event.key);
    if (!next) return;
    event.preventDefault();
    onViewChange(next);
    (next === "chat" ? chatTabRef : coreTabRef).current?.focus();
  }

  return (
    <div className={styles.workspaceTabs} role="tablist" aria-label="Engineering workspace view">
      <button
        ref={chatTabRef}
        type="button"
        role="tab"
        id="engineering-chat-tab"
        aria-selected={activeView === "chat"}
        aria-controls="engineering-chat-view"
        tabIndex={activeView === "chat" ? 0 : -1}
        className={activeView === "chat" ? styles.workspaceTabActive : styles.workspaceTab}
        onClick={() => onViewChange("chat")}
        onKeyDown={(event) => handleTabKeyDown(event, "chat")}
      >
        <MessageSquare size={15} aria-hidden="true" />
        <span>Chat</span>
        <small>Guidance</small>
      </button>
      <button
        ref={coreTabRef}
        type="button"
        role="tab"
        id="engineering-core-tab"
        aria-selected={activeView === "core"}
        aria-controls="engineering-core-view"
        tabIndex={activeView === "core" ? 0 : -1}
        className={activeView === "core" ? styles.workspaceTabActive : styles.workspaceTab}
        onClick={() => onViewChange("core")}
        onKeyDown={(event) => handleTabKeyDown(event, "core")}
      >
        <Workflow size={15} aria-hidden="true" />
        <span>Engineering Core</span>
        <small>Execution</small>
      </button>
    </div>
  );
}
