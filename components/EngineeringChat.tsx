"use client";

import { useMemo, useState } from "react";
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import type { ThreadHistoryAdapter } from "@assistant-ui/react";
import styles from "./EngineeringChat.module.css";

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

function responseError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return fallback;
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return "engineering-chat-" + crypto.randomUUID();
  return "engineering-chat-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
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

  async function readSession(): Promise<SessionResponse> {
    const query = new URLSearchParams({ projectId, sessionId: state.sessionId! });
    const response = await fetch(api + "?" + query.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const body: unknown = await response.json().catch(() => ({}));

    if (response.status === 404) {
      const created = await fetch(api, {
        method: "PUT",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          projectId,
          sessionId: state.sessionId,
          expectedRevision: null,
          conversation: [],
        }),
      });
      const createdBody: unknown = await created.json().catch(() => ({}));
      if (!created.ok) throw new Error(responseError(createdBody, "Could not initialize durable chat history."));
      return createdBody as SessionResponse;
    }

    if (!response.ok) throw new Error(responseError(body, "Could not restore durable chat history."));
    return body as SessionResponse;
  }

  async function initialize(): Promise<void> {
    if (state.initialized) return;
    try {
      if (typeof window === "undefined") throw new Error("Chat history can only be initialized in the browser.");
      const key = "engineering-chat-session:" + projectId;
      let savedId: string | null;
      try {
        savedId = window.sessionStorage.getItem(key);
      } catch {
        throw new Error("Browser session storage is blocked; durable chat identity cannot be retained.");
      }

      state.sessionId = savedId || createSessionId();
      if (!savedId) {
        try {
          window.sessionStorage.setItem(key, state.sessionId);
        } catch {
          state.sessionId = undefined;
          throw new Error("Browser session storage is blocked; no chat session was created.");
        }
      }

      const body = await readSession();
      if (
        body.projectId !== projectId ||
        body.sessionId !== state.sessionId ||
        !Number.isInteger(body.snapshotRevision) ||
        body.snapshotRevision < 1 ||
        !Array.isArray(body.conversation)
      ) {
        throw new Error("The saved engineering chat session has an unsupported shape.");
      }
      state.revision = body.snapshotRevision;
      state.conversation = body.conversation;
      state.initialized = true;
      onError(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Durable chat history is unavailable.";
      onError(message);
      throw error;
    }
  }

  async function saveConversation(next: StoredConversationMessage[]): Promise<void> {
    if (!state.sessionId || !Number.isInteger(state.revision)) throw new Error("The chat session is not ready to save.");
    if (next.length > HISTORY_LIMIT) throw new Error("This chat reached its 200-message history limit. Start a new session to continue.");

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
        try {
          return {
            messages: state.conversation.map((entry) => {
              const row = JSON.parse(entry.text) as Parameters<typeof format.decode>[0];
              return format.decode(row);
            }),
          };
        } catch {
          const message = "Saved chat history could not be decoded; it was not overwritten.";
          onError(message);
          throw new Error(message);
        }
      },
      async append(item) {
        await persistMutation(async () => {
          await initialize();
          const role = item.message.role;
          if (role !== "user" && role !== "assistant") {
            throw new Error("Only user and assistant text turns can be persisted.");
          }
          const row = {
            id: format.getId(item.message),
            parent_id: item.parentId,
            format: format.format,
            content: format.encode(item),
          };
          const encoded = JSON.stringify(row);
          if (encoded.length > 7_900) throw new Error("This message is too large to store in the engineering session.");
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
          const role = item.message.role;
          if (role !== "user" && role !== "assistant") throw new Error("Unsupported message role.");
          const row = {
            id,
            parent_id: item.parentId,
            format: format.format,
            content: format.encode(item),
          };
          const replacement: StoredConversationMessage = {
            role: role === "user" ? "engineer" : "assistant",
            text: JSON.stringify(row),
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
  const history = useMemo(
    () => createEngineeringChatHistoryAdapter(projectId, setHistoryError),
    [projectId],
  );
  const transport = useMemo(
    () => new AssistantChatTransport({
      api: "/api/projects/" + encodeURIComponent(projectId) + "/engineering/chat",
    }),
    [projectId],
  );
  const runtime = useChatRuntime({
    transport,
    adapters: { history },
    joinStrategy: "none",
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
                  <span>Text only · Project-scoped history</span>
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
