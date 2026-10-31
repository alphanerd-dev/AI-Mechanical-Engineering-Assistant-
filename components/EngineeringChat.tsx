"use client";

import { useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { DefaultChatTransport } from "ai";
import type { ThreadHistoryAdapter } from "@assistant-ui/react";
import styles from "./EngineeringChat.module.css";
import { loadDemoConversation, saveDemoConversation } from "../src/chat/demo-history.js";

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

  async function initialize(): Promise<void> {
    if (state.initialized) return;
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
  const runtime = useChatRuntime({
    transport,
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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className={styles.panel} aria-labelledby="engineering-assistant-title">
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>STREAMING ENGINEERING ASSISTANT</p>
            <h2 id="engineering-assistant-title">Explore the problem before you execute</h2>
            <p className={styles.description}>
              Ask questions, compare approaches, and identify missing inputs. Validated calculations and CAD operations still run through the engineering core below.
            </p>
          </div>
          <span className={styles.status}>CONVERSATIONAL</span>
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
                <h3>What are you trying to solve?</h3>
                <p>Describe the mechanism, system, failure, or design trade-off. The assistant will help frame the problem without pretending it has run a simulation.</p>
              </div>
            </AuiIf>

            <ThreadPrimitive.Messages>
              {({ message }) => {
                if (message.role === "user") {
                  return (
                    <MessagePrimitive.Root className={styles.userMessage}>
                      <span className={styles.messageLabel}>YOU</span>
                      <div className={styles.userBubble}><MessagePrimitive.Parts /></div>
                    </MessagePrimitive.Root>
                  );
                }
                return (
                  <MessagePrimitive.Root className={styles.assistantMessage}>
                    <span className={styles.messageLabel}>ENGINEERING ASSISTANT</span>
                    <div className={styles.assistantBubble}><MessagePrimitive.Parts /></div>
                  </MessagePrimitive.Root>
                );
              }}
            </ThreadPrimitive.Messages>

            <ThreadPrimitive.ViewportFooter className={styles.footer}>
              <ComposerPrimitive.Root className={styles.composer}>
                <ComposerPrimitive.Input
                  className={styles.input}
                  placeholder="Ask about a mechanical system, calculation, failure, or design decision…"
                  aria-label="Message the engineering assistant"
                  rows={3}
                />
                <div className={styles.composerBottom}>
                  <span>
                    {projectId === "demo"
                      ? "Text only · Local demo history"
                      : "Text only · Project history (survives refresh)"}
                  </span>
                  <ComposerPrimitive.Send className={styles.sendButton}>Send ↑</ComposerPrimitive.Send>
                </div>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </section>
    </AssistantRuntimeProvider>
  );
}
