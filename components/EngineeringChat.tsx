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
import { ENGINEERING_CORE_HANDOFF_EVENT, ENGINEERING_CHAT_RESULT_EVENT, buildEngineeringCoreHandoffIntent, parseEngineeringChatResultDetail } from "../src/chat/engineering-core-handof¶»§q«^