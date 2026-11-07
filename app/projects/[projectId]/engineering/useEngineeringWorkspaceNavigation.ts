"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ENGINEERING_CORE_HANDOFF_EVENT,
  ENGINEERING_CHAT_RESULT_EVENT,
} from "../../../../src/chat/engineering-core-handoff.js";

export type WorkspaceView = "chat" | "core";

export function useEngineeringWorkspaceNavigation(projectId: string) {
  const [activeView, setActiveView] = useState<WorkspaceView>("chat");
  const focusRequestedRef = useRef(false);
  const chatPanelRef = useRef<HTMLElement>(null);
  const corePanelRef = useRef<HTMLElement>(null);

  const focusActivePanel = useCallback(() => {
    const panel = activeView === "chat" ? chatPanelRef.current : corePanelRef.current;
    panel?.focus({ preventScroll: true });
  }, [activeView]);

  useEffect(() => {
    if (projectId === "demo") return;

    function showCore() {
      focusRequestedRef.current = true;
      setActiveView("core");
    }
    function showChat() {
      focusRequestedRef.current = true;
      setActiveView("chat");
    }

    window.addEventListener(ENGINEERING_CORE_HANDOFF_EVENT, showCore);
    window.addEventListener(ENGINEERING_CHAT_RESULT_EVENT, showChat);
    return () => {
      window.removeEventListener(ENGINEERING_CORE_HANDOFF_EVENT, showCore);
      window.removeEventListener(ENGINEERING_CHAT_RESULT_EVENT, showChat);
    };
  }, [projectId]);

  useEffect(() => {
    if (!focusRequestedRef.current) return;
    focusRequestedRef.current = false;
    focusActivePanel();
  }, [activeView, focusActivePanel]);

  return { activeView, setActiveView, chatPanelRef, corePanelRef };
}
