"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import {
  StreamdownTextPrimitive,
  escapeCurrencyDollars,
  normalizeMathDelimiters,
} from "@assistant-ui/react-streamdown";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { DefaultChatTransport } from "ai";
import type { ThreadHistoryAdapter } from "@assistant-ui/react";
import styles from "./EngineeringChat.module.css";
import { loadDemoConversation, saveDemoConversation } from "../src/chat/demo-history.js";
import { createProjectThreadListAdapter } from "../src/chat/project-thread-list.js";

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
): ThreadHistoryAdapter {
  const state: {
    sessionId?: string;
    revision?: number;
    conversation: StoredConversationMessage[];
    initialized: boolean;
  } = { conversation: [], initialized: false };

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

  let initializationPromise: Promise<void> | undefined;

  async function initializeOnce(): Promise<void> {
    try {
      if (typeof window === "undefined") throw new Error("Chat history can only be initialized in the browser.");
      const key = "engineering-chat-session:" + projectId;
      let savedId: string | null = null;
      try {
        savedId = window.localStorage.getItem(key);
      } catch {
        // Registered project history is server-backed. Local storage is only a fast
        // identity hint; the server can recover the latest chat session if it is blocked.
      }

      if (projectId === "demo") {
        const demoSessionId = savedId || createSessionId();
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
        return;
      }

      let body: SessionResponse | undefined;
      let expectedSessionId: string | undefined;
      const savedChatId = typeof savedId === "string" && savedId.startsWith("engineering-chat-")
        ? savedId
        : undefined;
      if (savedChatId) {
        state.sessionId = savedChatId;
        expectedSessionId = savedChatId;
        body = await readSession(savedChatId);
      }

      // Recover server-side if the browser identity was cleared, blocked, or stale.
      // The API only returns sessions with the engineering-chat- prefix, never task sessions.
      if (!body) {
        expectedSessionId = undefined;
        body = await readLatestChatSession();
        if (body && typeof body.sessionId === "string") {
          state.sessionId = body.sessionId;
        }
      }

      if (!body) {
        const newSessionId = savedChatId ?? createSessionId();
        state.sessionId = newSessionId;
        expectedSessionId = newSessionId;
        body = await createSession(newSessionId);
      }

      assertSessionResponse(body, expectedSessionId);
      state.sessionId = body.sessionId;
      state.revision = body.snapshotRevision;
      state.conversation = body.conversation;

      // Keep the fast path when storage is available; failure is recoverable via
      // readLatestChatSession on the next page load.
      try {
        window.localStorage.setItem(key, state.sessionId);
      } catch {
        // Intentionally non-fatal for registered projects.
      }

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

function preprocessEngineeringMath(text: string): string {
  return escapeCurrencyDollars(normalizeMathDelimiters(text));
}

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

export default function EngineeringChat({ projectId }: { projectId: string }) {
  const [historyError, setHistoryError] = useState<string>();
  const [chatError, setChatError] = useState<string>();
  const history = useMemo(
    () => createEngineeringChatHistoryAdapter(projectId, setHistoryError),
    [projectId],
  );
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/projects/" + encodeURIComponent(projectId) + "/engineering/chat",
    }),
    [projectId],
  );
  // assistant-ui only hydrates external history after the active thread has a
  // remote ID. This workspace has one durable conversation per project.
  const threadListAdapter = useMemo(
    () => createProjectThreadListAdapter(projectId),
    [projectId],
  );
  const runtimeHook = useCallback(function useProjectChatRuntime() {
    return useChatRuntime({
      transport,
      scopeId: projectId,
      adapters: { history },
      joinStrategy: "none",
      onError: (error) => {
        const detail = error instanceof Error && error.message.trim()
          ? error.message.trim().slice(0, 220)
          : "Unknown streaming transport error.";
        setChatError("Assistant request failed: " + detail);
      },
      onFinish: () => setChatError(undefined),
    });
  }, [history, projectId, transport]);
  const runtime = useRemoteThreadListRuntime({
    runtimeHook,
    adapter: threadListAdapter,
    threadId: projectId,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className={styles.panel} aria-labelledby="engineering-assistant-title">
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <span className={styles.headerMark} aria-hidden="true">F</span>
            <div className={styles.headerText}>
              <h2 id="engineering-assistant-title">Engineering Assistant</h2>
              <p>Think through the problem. Validate before execution.</p>
            </div>
          </div>
          <span className={styles.status}>
            <span className={styles.statusDot} aria-hidden="true" />
            Conversation
          </span>
        </header>

        {historyError && (
          <p className={styles.error} role="alert">
            Chat history issue: {historyError}
          </p>
        )}
        {chatError && (
          <p className={styles.error} role="alert">
            Assistant response issue: {chatError}
          </p>
        )}

        <ThreadPrimitive.Root className={styles.thread}>
          <ThreadPrimitive.Viewport className={styles.viewport} turnAnchor="bottom">
            <AuiIf condition={(state) => state.thread.isEmpty}>
              <div className={styles.emptyState}>
                <span className={styles.emptyMark} aria-hidden="true">F</span>
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
                    <div className={styles.assistantAvatar} aria-hidden="true">F</div>
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
                    <span>{projectId === "demo" ? "Demo chat · Local browser history" : "Project chat · History saved automatically"}</span>
                    <small>Engineering guidance only · Verify before acting</small>
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
