"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MessageSquare, Workflow, ShieldCheck } from "lucide-react";
import EngineeringChat from "../../../../components/EngineeringChat";
import EngineeringInteraction from "./EngineeringInteraction";
import {
  ENGINEERING_CORE_HANDOFF_EVENT,
  ENGINEERING_CHAT_RESULT_EVENT,
} from "../../../../src/chat/engineering-core-handoff.js";
import styles from "./EngineeringPage.module.css";

type WorkspaceView = "chat" | "core";
const VIEW_ORDER: WorkspaceView[] = ["chat", "core"];

export default function EngineeringWorkspace({ projectId }: { projectId: string }) {
  const [activeView, setActiveView] = useState<WorkspaceView>("chat");
  const focusActivePanelRef = useRef(false);
  const chatTabRef = useRef<HTMLButtonElement>(null);
  const coreTabRef = useRef<HTMLButtonElement>(null);
  const chatPanelRef = useRef<HTMLElement>(null);
  const corePanelRef = useRef<HTMLElement>(null);

  const focusActivePanel = useCallback(() => {
    const panel = activeView === "chat" ? chatPanelRef.current : corePanelRef.current;
    panel?.focus({ preventScroll: true });
  }, [activeView]);

  useEffect(() => {
    if (projectId === "demo") return;

    const showCore = () => {
      focusActivePanelRef.current = true;
      setActiveView("core");
    };
    const showChat = () => {
      focusActivePanelRef.current = true;
      setActiveView("chat");
    };

    window.addEventListener(ENGINEERING_CORE_HANDOFF_EVENT, showCore);
    window.addEventListener(ENGINEERING_CHAT_RESULT_EVENT, showChat);
    return () => {
      window.removeEventListener(ENGINEERING_CORE_HANDOFF_EVENT, showCore);
      window.removeEventListener(ENGINEERING_CHAT_RESULT_EVENT, showChat);
    };
  }, [projectId]);

  useEffect(() => {
    if (!focusActivePanelRef.current) return;
    focusActivePanelRef.current = false;
    focusActivePanel();
  }, [activeView, focusActivePanel]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: WorkspaceView) => {
    let next: WorkspaceView | undefined;
    if (event.key === "ArrowRight") {
      next = VIEW_ORDER[(VIEW_ORDER.indexOf(current) + 1) % VIEW_ORDER.length];
    } else if (event.key === "ArrowLeft") {
      next = VIEW_ORDER[(VIEW_ORDER.indexOf(current) - 1 + VIEW_ORDER.length) % VIEW_ORDER.length];
    } else if (event.key === "Home") {
      next = VIEW_ORDER[0];
    } else if (event.key === "End") {
      next = VIEW_ORDER[VIEW_ORDER.length - 1];
    }

    if (!next) return;
    event.preventDefault();
    setActiveView(next);
    (next === "chat" ? chatTabRef : coreTabRef).current?.focus();
  };

  return (
    <div className={styles.workspace}>
      {projectId !== "demo" && (
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
              onClick={() => setActiveView("chat")}
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
              onClick={() => setActiveView("core")}
              onKeyDown={(event) => handleTabKeyDown(event, "core")}
            >
              <Workflow size={15} aria-hidden="true" />
              <span>Engineering Core</span>
              <small>Execution</small>
            </button>
          </div>
        </header>
      )}

      <section
        ref={chatPanelRef}
        id="engineering-chat-view"
        role={projectId === "demo" ? undefined : "tabpanel"}
        aria-labelledby={projectId === "demo" ? undefined : "engineering-chat-tab"}
        aria-label={projectId === "demo" ? undefined : "Chat guidance workspace"}
        tabIndex={-1}
        hidden={projectId !== "demo" && activeView !== "chat"}
        className={styles.workspaceView}
      >
        <EngineeringChat projectId={projectId} />
      </section>

      {projectId !== "demo" && (
        <section
          ref={corePanelRef}
          id="engineering-core-view"
          role="tabpanel"
          aria-labelledby="engineering-core-tab"
          tabIndex={-1}
          hidden={activeView !== "core"}
          className={`${styles.workspaceView} ${styles.coreView}`}
        >
          <div className={styles.coreSurface}>
            <EngineeringInteraction projectId={projectId} />
          </div>
        </section>
      )}
    </div>
  );
}
