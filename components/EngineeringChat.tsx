"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  InMemoryThreadListAdapter,
  useAui,
  useRemoteThreadListRuntime,
  type RemoteThreadListAdapter,
  type RuntimeAdapters,
} from "@assistant-ui/react";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import { preprocessEngineeringMath } from "../src/chat/engineering-markdown.js";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { DefaultChatTransport } from "ai";
import { ArrowUpRight, Check, FileText, FolderKanban, History, LoaderCircle, MessageSquare, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Paperclip, Plus, Search, ShieldCheck, Workflow } from "lucide-react";
import type { ThreadHistoryAdapter } from "@assistant-ui/react";
import styles from "./EngineeringChat.module.css";
import { listDemoConversationIds, loadDemoConversation, rememberDemoConversationId, saveDemoConversation } from "../src/chat/demo-history.js";
import { summarizeEngineeringChatSession } from "../src/chat/session-summary.js";
import { ENGINEERING_CORE_HANDOFF_EVENT, ENGINEERING_CHAT_RESULT_EVENT, buildEngineeringCoreHandoffIntent, parseEngineeringChatResultDetail } from "../src/chat/engineering-core-handoff.js";

type StoredConversationMessage = {
  role: "engineer" | "assistant";
  text: string;
  at?: string;
};

type SessionResponse = {
  sessionId: string;
  projectId: string;
  snapshotRevision: number;
  conversation: StoredConversationMessage[];
};

const HISTORY_LIMIT = 200;
/** Keep under server MAX_MESSAGE_TEXT_LENGTH (64_000) with margin. */
const MAX_ENCODED_MESSAGE_CHARS = 60_000;

function responseError(body: unknown, fallback: string): string {
  if (body && typeof body === "object...[truncated]dPrimitive.Suggestion prompt="Explain how a hydraulic excavator system works, from the pump to the actuators." send className={styles.suggestion}>
                    <strong>Understand a system</strong>
                    <span>Trace how a machine or mechanism works</span>
                  </ThreadPrimitive.Suggestion>
                  <ThreadPrimitive.Suggestion prompt="Build a systematic troubleshooting procedure for an excavator with low hydraulic power." send className={styles.suggestion}>
                    <strong>Troubleshoot a failure</strong>
                    <span>Work from symptoms to diagnostic checks</span>
                  </ThreadPrimitive.Suggestion>
                  <ThreadPrimitive.Suggestion prompt="Derive the pump shaft power equation and explain each variable with SI units." send className={styles.suggestion}>
                    <strong>Work through an equation</strong>
                    <span>Understand derivations, units, and assumptions</span>
                  </ThreadPrimitive.Suggestion>
                  <ThreadPrimitive.Suggestion prompt="Compare two mechanical design options using performance, reliability, manufacturability, and cost." send className={styles.suggestion}>
                    <strong>Compare design options</strong>
                    <span>Make trade-offs explicit and traceable</span>
                  </ThreadPrimitive.Suggestion>
                </div>
              </div>
            </AuiIf>

            <ThreadPrimitive.Messages>
              {({ message }) => {
                if (message.role === "user") {
                  return (
                    <MessagePrimitive.Root className={styles.userMessage}>
                      <div className={styles.userBubble}><MessagePrimitive.Parts /></div>
                      <ActionBarPrimitive.Root className={styles.userActions} hideWhenRunning autohide="not-last">
                        <ActionBarPrimitive.Edit className={styles.actionButton}>Edit</ActionB...[truncated]