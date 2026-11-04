"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
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
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return fallback;
}

function getSupportedRole(message: unknown): "user" | "assistant" {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("Only user and assistant messages can be persisted.");
  }
  const role = (message as Record<string, unknown>).role;
  if (role !== "user" && role !== "assistant") {
    throw new Error("Only user and assistant messages can be persisted.");
  }
  return role;
}

function createSessionId(): string {
  if (typeof crypto === "undefined") {
    throw new Error("Secure browser randomness is unavailable; no chat session was created.");
  }
  if (typeof crypto.randomUUID === "function") return "engineering-chat-" + crypto.randomUUID();
  if (typeof crypto.getRandomValues !== "function") {
    throw new Error("Secure browser randomness is unavailable; no chat session was created.");
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
  return "engineering-chat-" + uuid;
}

function createEngineeringChatHistoryAdapter(
  projectId: string,
  onError: (message: string | undefined) => void,
  selectedSessionId?: string,
): ThreadHistoryAdapter {
  const state: {
    sessionId?: string;
    revision?: number;
    conversation: StoredConversationMessage[];
    initialized: boolean;
  } = { sessionId: selectedSessionId, conversation: [], initialized: false };

  let queue: Promise<void> = Promise.resolve();
  const api = "/api/engineering/intent";

  async function readSession(sessionId: string): Promise<SessionResponse | undefined> {
    const query = new URLSearchParams({ projectId, sessionId });
    const response = await fetch(api + "?" + query.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const body: unknown = await response.json().catch(() => ({}));

    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(responseError(body, "Could not restore durable chat history."));
    return body as SessionResponse;
  }

  async function readLatestChatSession(): Promise<SessionResponse | undefined> {
    const query = new URLSearchParams({ projectId, latest: "chat" });
    const response = await fetch(api + "?" + query.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const body: unknown = await response.json().catch(() => ({}));

    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(responseError(body, "Could not discover the latest saved engineering chat."));
    return body as SessionResponse;
  }

  async function createSession(sessionId: string): Promise<SessionResponse> {
    const response = await fetch(api, {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        projectId,
        sessionId,
        expectedRevision: null,
        conversation: [],
      }),
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseError(body, "Could not initialize durable chat history."));
    return body as SessionResponse;
  }

  function assertSessionResponse(body: unknown, expectedSessionId?: string): asserts body is SessionResponse {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("The saved engineering chat session has an unsupported shape.");
    }
    const session = body as Partial<SessionResponse>;
    if (
      session.projectId !== projectId ||
      typeof session.sessionId !== "string" ||
      !session.sessionId.startsWith("engineering-chat-") ||
      (expectedSessionId !== undefined && session.sessionId !== expectedSessionId) ||
      !Number.isInteger(session.snapshotRevision) ||
      (session.snapshotRevision ?? 0) < 1 ||
      !Array.isArray(session.conversation)
    ) {
      throw new Error("The saved engineering chat session has an unsupported shape.");
    }
  }

  function readSavedSessionId(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function persistSessionId(key: string, sessionId: string): void {
    try {
      window.localStorage.setItem(key, sessionId);
    } catch {
      // Recover registered project history from the server on the next load.
    }
  }

  async function initializeDemoSession(key: string, savedId: string | null): Promise<void> {
    const demoSessionId = selectedSessionId || savedId || createSessionId();
    state.sessionId = demoSessionId;
    if (!savedId) {
      try {
        window.localStorage.setItem(key, demoSessionId);
      } catch {
        state.sessionId = undefined;
        throw new Error("Browser local storage is blocked; local demo history cannot be retained.");
      }
    }
    state.conversation = loadDemoConversation(window.localStorage, demoSessionId);
    state.revision = 1;
    state.initialized = true;
    onError(undefined);
  }

  async function resolveRegisteredSession(savedId: string | null): Promise<{ body: SessionResponse; expectedSessionId?: string }> {
    const savedChatId = selectedSessionId ?? (savedId?.startsWith("engineering-chat-") ? savedId : undefined);
    let body: SessionResponse | undefined;
    let expectedSessionId = savedChatId;

    if (savedChatId) {
      state.sessionId = savedChatId;
      body = await readSession(savedChatId);
    }
    if (!body && !selectedSessionId) {
      expectedSessionId = undefined;
      body = await readLatestChatSession();
      if (body?.sessionId) state.sessionId = body.sessionId;
    }
    if (!body && selectedSessionId) {
      throw new Error("The selected conversation could not be restored. Refresh the chat list and select it again.");
    }
    if (!body) {
      const newSessionId = savedChatId ?? createSessionId();
      state.sessionId = newSessionId;
      expectedSessionId = newSessionId;
      body = await createSession(newSessionId);
    }
    return { body, expectedSessionId };
  }

  let initializationPromise: Promise<void> | undefined;

  async function initializeOnce(): Promise<void> {
    try {
      if (typeof window === "undefined") throw new Error("Chat history can only be initialized in the browser.");
      const key = "engineering-chat-session:" + projectId;
      const savedId = readSavedSessionId(key);
      if (projectId === "demo") {
        await initializeDemoSession(key, savedId);
        return;
      }

      const { body, expectedSessionId } = await resolveRegisteredSession(savedId);
      assertSessionResponse(body, expectedSessionId);
      state.sessionId = body.sessionId;
      state.revision = body.snapshotRevision;
      state.conversation = body.conversation;
      persistSessionId(key, state.sessionId);
      state.initialized = true;
      onError(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat history is unavailable.";
      onError(message);
      throw error;
    }
  }

  function initialize(): Promise<void> {
    if (state.initialized) return Promise.resolve();

    // Multiple runtime consumers can request history initialization while the
    // active remote thread is being resolved. Share the in-flight restore so
    // transient storage failures do not trigger duplicate reads or session creation.
    if (!initializationPromise) {
      initializationPromise = Promise.resolve()
        .then(initializeOnce)
        .finally(() => {
          initializationPromise = undefined;
        });
    }

    return initializationPromise;
  }

  async function saveConversation(next: StoredConversationMessage[]): Promise<void> {
    if (next.length > HISTORY_LIMIT) throw new Error("This chat reached its 200-message history limit. Start a new session to continue.");
    if (!state.sessionId) throw new Error("The chat session is not ready to save.");

    if (projectId === "demo") {
      saveDemoConversation(window.localStorage, state.sessionId, next);
      state.conversation = next;
      state.revision = 1;
      return;
    }

    if (!Number.isInteger(state.revision)) throw new Error("The chat session is not ready to save.");
    const response = await fetch(api, {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        projectId,
        sessionId: state.sessionId,
        expectedRevision: state.revision,
        conversation: next,
      }),
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(responseError(body, response.status === 409
        ? "Chat history changed in another request. Refresh to restore the latest session."
        : "The assistant reply could not be saved to project history."));
    }
    if (!body || typeof body !== "object" || !("snapshotRevision" in body) ||
      typeof body.snapshotRevision !== "number" || !Number.isInteger(body.snapshotRevision)) {
      throw new Error("The server did not confirm the saved chat revision.");
    }
    state.revision = body.snapshotRevision;
    state.conversation = next;
  }

  function persistMutation(mutate: () => Promise<void>): Promise<void> {
    const run = queue.then(mutate, mutate);
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    scopeId: projectId,
    async load() {
      return { headId: null, messages: [] };
    },
    async append() {},
    withFormat: (format) => ({
      async load() {
        await initialize();
        const messages = [];
        let skipped = 0;
        for (const entry of state.conversation) {
          try {
            const row = JSON.parse(entry.text) as Parameters<typeof format.decode>[0];
            messages.push(format.decode(row));
          } catch {
            skipped += 1;
          }
        }
        if (skipped > 0 && messages.length === 0) {
          const message = "Saved chat history could not be decoded; it was not overwritten.";
          onError(message);
          throw new Error(message);
        }
        if (skipped > 0) {
          onError(`Restored ${messages.length} message(s); skipped ${skipped} unreadable entr${skipped === 1 ? "y" : "ies"}.`);
        } else {
          onError(undefined);
        }
        return { messages };
      },
      async append(item) {
        await persistMutation(async () => {
          await initialize();
          const role = getSupportedRole(item.message);
          const row = {
            id: format.getId(item.message),
            parent_id: item.parentId,
            format: format.format,
            content: format.encode(item),
          };
          const encoded = JSON.stringify(row);
          if (encoded.length > MAX_ENCODED_MESSAGE_CHARS) {
            throw new Error("This message is too large to store in the engineering session.");
          }
          const next = [...state.conversation, {
            role: role === "user" ? "engineer" as const : "assistant" as const,
            text: encoded,
            at: new Date().toISOString(),
          }];
          await saveConversation(next);
          onError(undefined);
        }).catch((error) => {
          const message = error instanceof Error ? error.message : "Chat history could not be saved.";
          onError(message);
          throw error;
        });
      },
      async update(item) {
        await persistMutation(async () => {
          await initialize();
          const id = format.getId(item.message);
          const existingIndex = state.conversation.findIndex((entry) => {
            try {
              const row = JSON.parse(entry.text) as { id?: unknown };
              return row.id === id;
            } catch {
              return false;
            }
          });
          const role = getSupportedRole(item.message);
          const row = {
            id,
            parent_id: item.parentId,
            format: format.format,
            content: format.encode(item),
          };
          const encoded = JSON.stringify(row);
          if (encoded.length > MAX_ENCODED_MESSAGE_CHARS) {
            throw new Error("This message is too large to store in the engineering session.");
          }
          const replacement: StoredConversationMessage = {
            role: role === "user" ? "engineer" : "assistant",
            text: encoded,
            at: new Date().toISOString(),
          };
          const next = [...state.conversation];
          if (existingIndex < 0) next.push(replacement);
          else next[existingIndex] = replacement;
          await saveConversation(next);
          onError(undefined);
        }).catch((error) => {
          const message = error instanceof Error ? error.message : "Chat history could not be updated.";
          onError(message);
          throw error;
        });
      },
      async delete(items) {
        await persistMutation(async () => {
          await initialize();
          const ids = new Set(items.map((item) => format.getId(item.message)));
          const next = state.conversation.filter((entry) => {
            try {
              const row = JSON.parse(entry.text) as { id?: unknown };
              return typeof row.id !== "string" || !ids.has(row.id);
            } catch {
              return true;
            }
          });
          await saveConversation(next);
          onError(undefined);
        }).catch((error) => {
          const message = error instanceof Error ? error.message : "Chat history could not be updated.";
          onError(message);
          throw error;
        });
      },
    }),
  };
}

const CHAT_MARKDOWN_PLUGINS = {
  code,
  math: createMathPlugin({ singleDollarTextMath: true }),
};
const CHAT_MARKDOWN_REPAIR = {
  links: true,
  images: true,
  linkMode: "protocol" as const,
  bold: true,
  italic: true,
  boldItalic: true,
  inlineCode: true,
  strikethrough: true,
  katex: true,
  setextHeadings: true,
  singleTilde: true,
};

function AssistantMarkdown() {
  return (
    <StreamdownTextPrimitive
      plugins={CHAT_MARKDOWN_PLUGINS}
      preprocess={preprocessEngineeringMath}
      remend={CHAT_MARKDOWN_REPAIR}
      controls={false}
      shikiTheme={["github-light", "github-dark"]}
      containerClassName={styles.markdown}
      defer
    />
  );
}

type ChatSessionSummary = {
  sessionId: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

type ChatSessionListResponse = {
  projectId: string;
  sessions: ChatSessionSummary[];
};

function readSelectedChatId(projectId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(`engineering-chat-active-session:${projectId}`)
      ?? window.localStorage.getItem(`engineering-chat-session:${projectId}`)
      ?? undefined;
  } catch {
    return undefined;
  }
}

function rememberSelectedChatId(projectId: string, sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`engineering-chat-active-session:${projectId}`, sessionId);
    if (projectId === "demo") window.localStorage.setItem("engineering-chat-session:demo", sessionId);
  } catch {
    // Registered project chats remain available through the server list if browser storage is disabled.
  }
}

async function fetchProjectChatSessions(projectId: string): Promise<ChatSessionSummary[]> {
  const query = new URLSearchParams({ projectId, list: "chat" });
  const response = await fetch("/api/engineering/intent?" + query.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as Partial<ChatSessionListResponse> & { error?: string };
  if (!response.ok || body.projectId !== projectId || !Array.isArray(body.sessions)) {
    throw new Error(body.error || "Saved project conversations could not be loaded.");
  }
  return body.sessions.filter(session =>
    session && typeof session.sessionId === "string" &&
    typeof session.title === "string" &&
    typeof session.updatedAt === "string" &&
    Number.isInteger(session.messageCount),
  );
}

async function createProjectChatSession(projectId: string): Promise<ChatSessionSummary> {
  const sessionId = createSessionId();
  const response = await fetch("/api/engineering/intent", {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ projectId, sessionId, expectedRevision: null, conversation: [] }),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(responseError(body, "A new project conversation could not be created."));
  if (!body || typeof body !== "object" || !((body as Record<string, unknown>).sessionId === sessionId) ||
    (body as Record<string, unknown>).projectId !== projectId) {
    throw new Error("The server did not confirm the new conversation identity.");
  }
  return {
    sessionId,
    title: "New conversation",
    updatedAt: new Date().toISOString(),
    messageCount: 0,
  };
}

function formatSessionDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";
  const now = new Date();
  const sameDay = parsed.toDateString() === now.toDateString();
  return sameDay
    ? parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : parsed.toLocaleDateString([], { month: "short", day: "numeric" });
}

function EngineeringChatThread({
  projectId,
  sessionId,
  onConversationSaved,
}: {
  projectId: string;
  sessionId: string;
  onConversationSaved: () => void;
}) {
  const [historyError, setHistoryError] = useState<string>();
  const [chatError, setChatError] = useState<string>();
  const history = useMemo(
    () => createEngineeringChatHistoryAdapter(projectId, setHistoryError, sessionId),
    [projectId, sessionId],
  );
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/projects/" + encodeURIComponent(projectId) + "/engineering/chat",
    }),
    [projectId],
  );
  const runtime = useChatRuntime({
    // Keep assistant-ui's runtime thread identity aligned with the durable
    // project session. Without this, every mount generates a new chat id even
    // though the history adapter is restoring a previously selected session.
    id: sessionId,
    // assistant-ui's controlled thread identity is distinct from the AI SDK chat id.
    // Pin both to the durable session so a keyed remount cannot attach history to a default thread.
    threadId: sessionId,
    transport,
    // scopeId identifies the owning project/workspace; id identifies its chat.
    scopeId: projectId,
    adapters: { history },
    joinStrategy: "none",
    onError: (error) => {
      const detail = error instanceof Error && error.message.trim()
        ? error.message.trim().slice(0, 220)
        : "Unknown streaming transport error.";
      setChatError("Assistant request failed: " + detail);
    },
    onFinish: () => {
      setChatError(undefined);
      onConversationSaved();
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className={styles.panel} aria-labelledby="engineering-assistant-title">
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <span className={styles.headerMark} aria-hidden="true"><Workflow size={18} strokeWidth={2.1} /></span>
            <div className={styles.headerText}>
              <h2 id="engineering-assistant-title">Engineering Assistant</h2>
              <p>Project conversation · Saved automatically</p>
            </div>
          </div>
          <span className={styles.status}>
            <ShieldCheck size={13} aria-hidden="true" />
            Guidance only
          </span>
        </header>

        {historyError && (
          <p className={styles.error} role="alert">Chat history issue: {historyError}</p>
        )}
        {chatError && (
          <p className={styles.error} role="alert">{chatError}</p>
        )}

        <ThreadPrimitive.Root className={styles.thread}>
          <ThreadPrimitive.Viewport className={styles.viewport} turnAnchor="bottom">
            <AuiIf condition={(state) => state.thread.isEmpty}>
              <div className={styles.emptyState}>
                <span className={styles.emptyMark} aria-hidden="true"><Workflow size={22} /></span>
                <p className={styles.emptyEyebrow}>ENGINEERING, WITH CLARITY</p>
                <h3>What are we solving today?</h3>
                <p className={styles.emptyDescription}>
                  Explore mechanical systems, troubleshoot failures, work through equations, and compare design decisions.
                </p>
                <div className={styles.suggestionGrid}>
                  <ThreadPrimitive.Suggestion prompt="Explain how a hydraulic excavator system works, from the pump to the actuators." send className={styles.suggestion}>
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
                        <ActionBarPrimitive.Edit className={styles.actionButton}>Edit</ActionBarPrimitive.Edit>
                      </ActionBarPrimitive.Root>
                    </MessagePrimitive.Root>
                  );
                }
                return (
                  <MessagePrimitive.Root className={styles.assistantMessage}>
                    <div className={styles.assistantAvatar} aria-hidden="true"><Workflow size={15} /></div>
                    <div className={styles.assistantContent}>
                      <div className={styles.assistantIdentity}>
                        <strong>Forge</strong>
                        <span>Engineering assistant</span>
                      </div>
                      <div className={styles.assistantBubble}>
                        <MessagePrimitive.Parts components={{ Text: AssistantMarkdown }} />
                      </div>
                      <ActionBarPrimitive.Root className={styles.assistantActions} hideWhenRunning autohide="not-last">
                        <ActionBarPrimitive.Copy className={styles.actionButton} copiedDuration={1800}>Copy</ActionBarPrimitive.Copy>
                        <ActionBarPrimitive.Reload className={styles.actionButton}>Regenerate</ActionBarPrimitive.Reload>
                      </ActionBarPrimitive.Root>
                    </div>
                  </MessagePrimitive.Root>
                );
              }}
            </ThreadPrimitive.Messages>

            <ThreadPrimitive.ViewportFooter className={styles.footer}>
              <ComposerPrimitive.Root className={styles.composer}>
                <ComposerPrimitive.Input
                  className={styles.input}
                  placeholder="Message the Engineering Assistant…"
                  aria-label="Message the engineering assistant"
                  rows={1}
                  submitMode="enter"
                  unstable_insertNewlineOnTouchEnter
                />
                <div className={styles.composerBottom}>
                  <span className={styles.composerHint}>
                    <span>{projectId === "demo" ? "Demo chat · Local browser history" : "This conversation is saved to the project"}</span>
                    <small>AI proposes · Engineering workflows execute and validate</small>
                  </span>
                  <AuiIf condition={(state) => state.composer.canCancel}>
                    <ComposerPrimitive.Cancel className={styles.stopButton} aria-label="Stop generating">
                      <span aria-hidden="true">■</span> Stop
                    </ComposerPrimitive.Cancel>
                  </AuiIf>
                  <AuiIf condition={(state) => !state.composer.canCancel}>
                    <ComposerPrimitive.Send className={styles.sendButton} aria-label="Send message">
                      <span aria-hidden="true">↑</span>
                    </ComposerPrimitive.Send>
                  </AuiIf>
                </div>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </section>
    </AssistantRuntimeProvider>
  );
}

export default function EngineeringChat({ projectId }: { projectId: string }) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string>();
  const [retryCount, setRetryCount] = useState(0);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function initialize() {
      setListLoading(true);
      setListError(undefined);
      try {
        if (projectId === "demo") {
          const storedIds = listDemoConversationIds(window.localStorage);
          const preferredId = readSelectedChatId(projectId);
          const sessionId = preferredId && (storedIds.includes(preferredId) || storedIds.length === 0)
            ? preferredId
            : storedIds[0] ?? createSessionId();
          const orderedIds = rememberDemoConversationId(window.localStorage, sessionId);
          rememberSelectedChatId(projectId, sessionId);
          if (!mounted) return;
          setSessions(orderedIds.map(id => {
            const conversation = loadDemoConversation(window.localStorage, id);
            const updatedAt = conversation.at(-1)?.at ?? new Date(0).toISOString();
            return summarizeEngineeringChatSession({ sessionId: id, conversation, updatedAt });
          }));
          setActiveSessionId(sessionId);
          return;
        }
        const existing = await fetchProjectChatSessions(projectId);
        if (!mounted) return;
        let selected = readSelectedChatId(projectId);
        if (!selected || !existing.some(item => item.sessionId === selected)) {
          selected = existing[0]?.sessionId;
        }
        let nextSessions = existing;
        if (!selected) {
          const created = await createProjectChatSession(projectId);
          if (!mounted) return;
          selected = created.sessionId;
          nextSessions = [created];
        }
        rememberSelectedChatId(projectId, selected);
        if (!mounted) return;
        setSessions(nextSessions);
        setActiveSessionId(selected);
      } catch (error) {
        if (mounted) setListError(error instanceof Error ? error.message : "Project chat history could not be restored.");
      } finally {
        if (mounted) setListLoading(false);
      }
    }
    void initialize();
    return () => { mounted = false; };
  }, [projectId, retryCount]);

  async function handleNewConversation() {
    if (creating) return;
    setCreating(true);
    setListError(undefined);
    try {
      if (projectId === "demo") {
        const sessionId = createSessionId();
        const ids = rememberDemoConversationId(window.localStorage, sessionId);
        rememberSelectedChatId(projectId, sessionId);
        const next = ids.map(id => {
          const conversation = loadDemoConversation(window.localStorage, id);
          return summarizeEngineeringChatSession({ sessionId: id, conversation, updatedAt: conversation.at(-1)?.at ?? new Date(0).toISOString() });
        });
        setSessions(next);
        setActiveSessionId(sessionId);
      } else {
        const created = await createProjectChatSession(projectId);
        setSessions(current => [created, ...current.filter(item => item.sessionId !== created.sessionId)].slice(0, 50));
        rememberSelectedChatId(projectId, created.sessionId);
        setActiveSessionId(created.sessionId);
      }
      setMobileHistoryOpen(false);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "A new conversation could not be created.");
    } finally {
      setCreating(false);
    }
  }

  async function handleConversationSaved() {
    if (projectId === "demo" && activeSessionId) {
      try {
        const conversation = loadDemoConversation(window.localStorage, activeSessionId);
        const summary = summarizeEngineeringChatSession({
          sessionId: activeSessionId,
          conversation,
          updatedAt: conversation.at(-1)?.at ?? new Date().toISOString(),
        });
        setSessions(current => [summary, ...current.filter(item => item.sessionId !== activeSessionId)]);
      } catch (error) {
        setListError(error instanceof Error ? error.message : "Demo chat metadata could not be refreshed.");
      }
      return;
    }
    try {
      const next = await fetchProjectChatSessions(projectId);
      setSessions(next);
    } catch {
      // The individual history adapter already reports save failures; a metadata refresh is secondary.
    }
  }

  const visibleSessions = sessions.filter(session => session.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const activeSession = sessions.find(session => session.sessionId === activeSessionId);

  return (
    <div className={styles.chatWorkspace}>
      <aside className={`${styles.historySidebar} ${mobileHistoryOpen ? styles.historySidebarOpen : ""}`} aria-label="Conversation history">
        <div className={styles.historyHeader}>
          <div className={styles.historyTitle}><History size={15} aria-hidden="true" /><span>Project chats</span></div>
          <button className={styles.newConversationButton} type="button" onClick={handleNewConversation} disabled={creating || listLoading}>
            {creating ? <LoaderCircle size={14} className={styles.spin} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
            <span>New chat</span>
          </button>
        </div>
        {projectId !== "demo" && (
          <label className={styles.historySearch}>
            <Search size={14} aria-hidden="true" />
            <span className={styles.srOnly}>Search conversations</span>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search conversations" />
          </label>
        )}
        <div className={styles.historySectionLabel}>RECENT</div>
        <nav className={styles.historyList} aria-label="Saved project conversations">
          {listLoading && <p className={styles.historyLoading}><LoaderCircle size={14} className={styles.spin} />Loading conversations…</p>}
          {!listLoading && listError && <p className={styles.historyError} role="alert">{listError}</p>}
          {!listLoading && !listError && visibleSessions.length === 0 && <p className={styles.historyEmpty}>{search.trim() ? "No conversations match this search." : "No saved conversations yet."}</p>}
          {visibleSessions.map(session => (
            <button
              key={session.sessionId}
              type="button"
              className={`${styles.historyItem} ${session.sessionId === activeSessionId ? styles.historyItemActive : ""}`}
              aria-current={session.sessionId === activeSessionId ? "page" : undefined}
              onClick={() => {
                setActiveSessionId(session.sessionId);
                rememberSelectedChatId(projectId, session.sessionId);
                setMobileHistoryOpen(false);
              }}
            >
              <span className={styles.historyItemIcon}><MessageSquare size={14} aria-hidden="true" /></span>
              <span className={styles.historyItemText}>
                <strong>{session.title}</strong>
                <small>{session.messageCount} messages · {session.messageCount === 0 ? "New" : formatSessionDate(session.updatedAt)}</small>
              </span>
              {session.sessionId === activeSessionId && <span className={styles.historyItemActiveMark} aria-label="Selected"><Check size={12} /></span>}
            </button>
          ))}
        </nav>
        <div className={styles.historyFooter}>
          <span>Project-scoped history</span>
          <small>Separate from calculations, CAD and solver runs.</small>
        </div>
      </aside>

      <div className={styles.chatMain}>
        <div className={styles.mobileHistoryBar}>
          <div className={styles.mobileChatControls}>
            <button type="button" onClick={() => setMobileHistoryOpen(value => !value)} aria-expanded={mobileHistoryOpen} aria-label={mobileHistoryOpen ? "Hide conversation history" : "Show conversation history"}>
              {mobileHistoryOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
              <span>Threads</span>
            </button>
            <button type="button" onClick={() => setMobileContextOpen(value => !value)} aria-expanded={mobileContextOpen} aria-label={mobileContextOpen ? "Hide conversation context" : "Show conversation context"}>
              {mobileContextOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              <span>Context</span>
            </button>
          </div>
          <span>{activeSession?.title ?? "Engineering chat"}</span>
        </div>
        {activeSessionId ? (
          <EngineeringChatThread
            key={`${projectId}:${activeSessionId}`}
            projectId={projectId}
            sessionId={activeSessionId}
            onConversationSaved={handleConversationSaved}
          />
        ) : listError ? (
          <div className={styles.chatLoadingState} role="alert">
            <div className={styles.chatInitializationError}>
              <strong>Conversation could not be loaded</strong>
              <p>{listError}</p>
              <button type="button" onClick={() => setRetryCount(value => value + 1)} disabled={listLoading}>
                {listLoading ? "Retrying…" : "Retry loading chat"}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.chatLoadingState} role="status"><LoaderCircle size={18} className={styles.spin} />Preparing project conversation…</div>
        )}
      </div>

      <aside className={`${styles.contextSidebar} ${mobileContextOpen ? styles.contextSidebarOpen : ""}`} aria-label="Context for this conversation">
        <header className={styles.contextHeader}>
          <ShieldCheck size={16} aria-hidden="true" />
          <div><strong>Context for this conversation</strong><small>Explicit project scope</small></div>
        </header>
        <div className={styles.contextSources}>
          <div className={styles.contextSource}>
            <FolderKanban size={15} aria-hidden="true" />
            <div><strong>Project identity</strong><small>{projectId === "demo" ? "Demo sandbox · not persisted" : projectId}</small></div>
            <span>Scope</span>
          </div>
          <div className={styles.contextSource}>
            <MessageSquare size={15} aria-hidden="true" />
            <div><strong>Conversation history</strong><small>{activeSessionId ? `Session ${activeSessionId.slice(0, 18)}…` : "Selecting a conversation"}</small></div>
            <span>{projectId === "demo" ? "Local" : "Saved"}</span>
          </div>
          <div className={styles.contextSource}>
            <Paperclip size={15} aria-hidden="true" />
            <div><strong>Attached artifacts</strong><small>No files are attached to this conversation.</small></div>
            <span>None</span>
          </div>
        </div>
        <section className={styles.contextActions} aria-labelledby="chat-context-actions">
          <h3 id="chat-context-actions">Suggested actions</h3>
          <Link href={`/projects/${encodeURIComponent(projectId)}/files`}><FileText size={14} aria-hidden="true" /><span>Browse project files</span><ArrowUpRight size={13} aria-hidden="true" /></Link>
          <Link href={`/projects/${encodeURIComponent(projectId)}/requirements`}><FolderKanban size={14} aria-hidden="true" /><span>Review requirements</span><ArrowUpRight size={13} aria-hidden="true" /></Link>
        </section>
        <div className={styles.contextTrust}>
          <ShieldCheck size={15} aria-hidden="true" />
          <div><strong>Trust boundary</strong><p>AI guidance only. This conversation does not execute CAD, FEA or solver jobs. Execution, validation and human approval remain separate controlled states.</p></div>
        </div>
      </aside>
    </div>
  );
}
