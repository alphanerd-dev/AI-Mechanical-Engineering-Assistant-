"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getEngineeringDecisionPresentation } from "../../../../src/intent/decision-presentation.js";

type DecisionMetric = { key: string; value: number | string; unit?: string };
type Decision = {
  status: string;
  validationPassed: boolean;
  metrics: DecisionMetric[];
  evidenceIds: string[];
  nextAction?: string;
  nextQuestion?: string;
};

type AssistantResponse = {
  status: string;
  decision: Decision;
  decisionSummary: string;
  nextQuestion?: string;
  sessionRevision?: number;
};

type Message = { role: "engineer" | "assistant"; text: string; decision?: Decision; at?: string };

type RestoreState = "loading" | "ready" | "restore_failed";

const WELCOME: Message = {
  role: "assistant",
  text: "Describe the engineering task in your own words. I will reuse available session context, ask only for material missing inputs, and show the result, checks, evidence status, and next decision.",
};

function storageKey(projectId: string): string {
  return `engineering-intent-session:${projectId}`;
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `engineering-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isAssistantResponse(value: unknown): value is AssistantResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AssistantResponse>;
  const decision = candidate.decision as Partial<Decision> | undefined;
  return typeof candidate.status === "string"
    && typeof candidate.decisionSummary === "string"
    && !!decision
    && typeof decision.status === "string"
    && typeof decision.validationPassed === "boolean"
    && Array.isArray(decision.metrics)
    && Array.isArray(decision.evidenceIds);
}

function isMessageArray(value: unknown): value is Message[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const message = item as Partial<Message>;
    return (message.role === "engineer" || message.role === "assistant")
      && typeof message.text === "string"
      && message.text.trim().length > 0;
  });
}

export default function EngineeringInteraction({ projectId }: { projectId: string }) {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const sessionRevisionRef = useRef<number | undefined>(undefined);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [persistError, setPersistError] = useState<string>();
  const [sessionConflict, setSessionConflict] = useState(false);
  const [restoreState, setRestoreState] = useState<RestoreState>("loading");
  const [restoreDetail, setRestoreDetail] = useState<string>();

  const lastDecision = useMemo(
    () => [...messages].reverse().find((message) => message.decision)?.decision,
    [messages],
  );

  const decisionPresentation = lastDecision
    ? getEngineeringDecisionPresentation(lastDecision)
    : undefined;

  const persistConversation = useCallback(async (
    activeSessionId: string,
    nextMessages: Message[],
  ): Promise<boolean> => {
    try {
      const response = await fetch("/api/engineering/intent", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          sessionId: activeSessionId,
          expectedRevision: sessionRevisionRef.current ?? null,
          conversation: nextMessages.filter((message) => message.text.trim()),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSessionConflict(response.status === 409);
        setPersistError(typeof body.error === "string"
          ? body.error
          : "Conversation could not be saved. Restore the latest session before continuing.");
        return false;
      }
      if (typeof body.snapshotRevision !== "number" || !Number.isInteger(body.snapshotRevision)) {
        setPersistError("The server saved the conversation but did not confirm its snapshot revision. Refresh recovery cannot be confirmed.");
        return false;
      }
      sessionRevisionRef.current = body.snapshotRevision;
      setSessionConflict(false);
      setPersistError(undefined);
      return true;
    } catch {
      setPersistError("Conversation could not be saved. Restore the latest session before continuing.");
      return false;
    }
  }, [projectId]);

  const beginNewSession = useCallback(async () => {
    const nextId = createSessionId();

    // Persist the browser's session identity first. If storage is blocked, do not
    // create a server session that cannot be recovered after the page reloads.
    try {
      sessionStorage.setItem(storageKey(projectId), nextId);
    } catch {
      sessionRevisionRef.current = undefined;
      setSessionId(undefined);
      setRestoreState("restore_failed");
      setRestoreDetail("Browser session storage is unavailable. No new session was created because its identity could not be retained across refresh.");
      return;
    }

    sessionRevisionRef.current = undefined;
    setSessionId(nextId);
    setMessages([WELCOME]);
    setError(undefined);
    setPersistError(undefined);
    setSessionConflict(false);
    setRestoreDetail(undefined);
    setRestoreState("loading");

    const saved = await persistConversation(nextId, [WELCOME]);
    if (!saved) {
      setRestoreState("restore_failed");
      setRestoreDetail("The new session identity is retained in this browser, but the server could not save its initial snapshot. No engineering request has been sent.");
      return;
    }

    setRestoreState("ready");
  }, [persistConversation, projectId]);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      setRestoreState("loading");
      setRestoreDetail(undefined);

      let storedId: string | null;
      try {
        storedId = sessionStorage.getItem(storageKey(projectId));
      } catch {
        if (!cancelled) {
          setSessionId(undefined);
          setRestoreState("restore_failed");
          setRestoreDetail("Browser session storage is unavailable. The previous session identity could not be read, so no replacement session was started.");
        }
        return;
      }

      // No saved identity for this project → create an initial conversation.
      if (!storedId) {
        if (!cancelled) await beginNewSession();
        return;
      }

      try {
        const response = await fetch(
          `/api/engineering/intent?projectId=${encodeURIComponent(projectId)}&sessionId=${encodeURIComponent(storedId)}`,
          { method: "GET", headers: { accept: "application/json" } },
        );
        const body = await response.json().catch(() => ({}));

        if (cancelled) return;

        if (response.status === 404) {
          setSessionId(storedId);
          setRestoreState("restore_failed");
          setRestoreDetail("This browser still references a session that the server could not find. The previous session was not replaced; start a new session only if you want to continue separately.");
          return;
        }

        if (!response.ok) {
          setSessionId(storedId);
          setRestoreState("restore_failed");
          setRestoreDetail(typeof body.error === "string"
            ? body.error
            : "The previous engineering session could not be restored.");
          return;
        }

        if (
          body.schemaVersion !== 1 ||
          typeof body.snapshotRevision !== "number" ||
          !Number.isInteger(body.snapshotRevision) ||
          body.snapshotRevision < 1 ||
          !isMessageArray(body.conversation)
        ) {
          setSessionId(storedId);
          setRestoreState("restore_failed");
          setRestoreDetail("The stored session snapshot is malformed or uses an unsupported schema. No replacement session was started.");
          return;
        }

        sessionRevisionRef.current = body.snapshotRevision;
        setSessionConflict(false);
        const conversation = body.conversation as Message[];
        setSessionId(storedId);
        setMessages(conversation.length > 0 ? conversation : [WELCOME]);
        setRestoreState("ready");
      } catch {
        if (cancelled) return;
        setSessionId(storedId);
        setRestoreState("restore_failed");
        setRestoreDetail("The previous engineering session could not be restored. Storage may be unavailable.");
      }
    }

    void restore();
    return () => { cancelled = true; };
  }, [projectId, beginNewSession]);

  const restoreLatestSession = useCallback(async () => {
    if (!sessionId) return;
    setRestoreState("loading");
    setRestoreDetail(undefined);
    try {
      const response = await fetch(
        "/api/engineering/intent?projectId=" + encodeURIComponent(projectId) + "&sessionId=" + encodeURIComponent(sessionId),
        { method: "GET", headers: { accept: "application/json" } },
      );
      const body = await response.json().catch(() => ({}));
      if (
        !response.ok ||
        body.schemaVersion !== 1 ||
        typeof body.snapshotRevision !== "number" ||
        !Number.isInteger(body.snapshotRevision) ||
        body.snapshotRevision < 1 ||
        !isMessageArray(body.conversation)
      ) {
        setRestoreState("restore_failed");
        setRestoreDetail(typeof body.error === "string"
          ? body.error
          : "The latest session snapshot could not be restored.");
        return;
      }

      sessionRevisionRef.current = body.snapshotRevision;
      setMessages(body.conversation.length > 0 ? body.conversation as Message[] : [WELCOME]);
      setError(undefined);
      setPersistError(undefined);
      setSessionConflict(false);
      setRestoreState("ready");
    } catch {
      setRestoreState("restore_failed");
      setRestoreDetail("The latest session could not be restored because the server or storage is unavailable.");
    }
  }, [projectId, sessionId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rawIntent = draft.trim();
    if (!rawIntent || busy || !sessionId || restoreState !== "ready") return;

    setError(undefined);
    const engineerMessage: Message = {
      role: "engineer",
      text: rawIntent,
      at: new Date().toISOString(),
    };
    const priorMessages = messages;
    const pendingMessages = [...priorMessages, engineerMessage];
    setMessages(pendingMessages);
    setBusy(true);

    try {
      // Persist the user's turn before dispatching an engineering operation.
      const pendingSaved = await persistConversation(sessionId, pendingMessages);
      if (!pendingSaved) {
        setMessages(priorMessages);
        setDraft(rawIntent);
        setError("The engineering request was not sent because its session snapshot could not be saved. Retry after restoring or starting a session.");
        return;
      }

      setDraft("");
      const response = await fetch("/api/engineering/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, sessionId, rawIntent }),
      });
      const body = await response.json().catch(() => ({}));
      const result = isAssistantResponse(body) ? body : undefined;

      if (!response.ok && !result) {
        throw new Error(typeof body.error === "string" ? body.error : "Engineering request failed.");
      }
      if (!result) {
        throw new Error("The engineering service returned no usable decision. Your submitted turn remains saved in the session.");
      }
      if (typeof result.sessionRevision !== "number" || !Number.isInteger(result.sessionRevision) || result.sessionRevision < 1) {
        throw new Error("The service did not confirm the saved session revision. Your submitted turn remains saved, but the result was not added to durable conversation history.");
      }

      sessionRevisionRef.current = result.sessionRevision;

      const decision = result.decision;
      const followUp = decision?.nextQuestion
        ? `Required input: ${decision.nextQuestion}.`
        : decision?.nextAction
          ? `Next action: ${decision.nextAction}.`
          : "";
      const assistantMessage: Message = {
        role: "assistant",
        text: [result.decisionSummary, followUp].filter(Boolean).join(" "),
        decision,
        at: new Date().toISOString(),
      };

      const nextMessages = [...pendingMessages, assistantMessage];
      setMessages(nextMessages);
      const answerSaved = await persistConversation(sessionId, nextMessages);
      if (!answerSaved) {
        setPersistError("The engineering response is visible, but its final conversation snapshot was not saved. Restore the session before assuming it will survive a refresh.");
      }

      if (decision.status === "FAILED") setDraft(rawIntent);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Engineering request failed.";
      setError(message);
      const nextMessages: Message[] = [
        ...pendingMessages,
        {
          role: "assistant",
          text: "The engineering service did not return a usable decision. The submitted request remains in the saved conversation when storage is available.",
          at: new Date().toISOString(),
        },
      ];
      setMessages(nextMessages);
      const failureSaved = await persistConversation(sessionId, nextMessages);
      if (!failureSaved) {
        setPersistError("The failure state could not be appended because the session revision changed or storage is unavailable. Refresh to restore the server's latest session.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (restoreState === "loading") {
    return <section className="interaction">
      <div className="interactionHeader">
        <div>
          <p className="eyebrow">ENGINEERING INTERACTION</p>
          <h2>Restoring session…</h2>
        </div>
        <span className="pill">LOADING</span>
      </div>
      <p className="muted">Checking for a durable engineering session in this project.</p>
    </section>;
  }

  if (restoreState === "restore_failed") {
    return <section className="interaction">
      <div className="interactionHeader">
        <div>
          <p className="eyebrow">ENGINEERING INTERACTION</p>
          <h2>Session could not be restored</h2>
        </div>
        <span className="pill">RESTORE FAILED</span>
      </div>
      <div className="notice" role="alert">
        {restoreDetail ?? "The previous engineering session could not be restored."}
        {" "}A new session was not started automatically.
      </div>
      <div className="composerFooter" style={{ marginTop: "1rem" }}>
        <button className="button" type="button" onClick={beginNewSession}>Start new session</button>
      </div>
    </section>;
  }

  return <section className="interaction">
    <div className="interactionHeader">
      <div>
        <p className="eyebrow">ENGINEERING INTERACTION</p>
        <h2>From engineering intent to a checked result</h2>
      </div>
      <span className="pill">{busy ? "RUNNING" : error ? "REQUEST FAILED" : lastDecision?.status ?? "READY"}</span>
    </div>

    <div className="conversation" aria-live="polite">
      {messages.map((message, index) => <div className={`message ${message.role}`} key={`${index}-${message.role}`}>
        <span className="messageRole">{message.role === "engineer" ? "YOU" : "ENGINEERING CORE"}</span>
        <p>{message.text}</p>
      </div>)}
      {busy && <div className="message assistant"><span className="messageRole">ENGINEERING CORE</span><p>Processing the engineering request…</p></div>}
    </div>

    {lastDecision && decisionPresentation && <div className="decisionCard">
      <div className="decisionTop"><span className="tag">DECISION</span><strong>{lastDecision.status}</strong></div>
      <div className={`decisionOutcome decisionOutcome--${decisionPresentation.tone}`} role="status" aria-live="polite">
        <strong>{decisionPresentation.title}</strong>
        <p>{decisionPresentation.message}</p>
      </div>
      <div className="decisionGrid">
        <Metric label="Capability checks" value={lastDecision.validationPassed ? "PASS" : "NOT CONFIRMED"} />
        {lastDecision.metrics.map((metric) => <Metric
          key={metric.key}
          label={metric.key}
          value={typeof metric.value === "number"
            ? `${metric.value.toFixed(2)}${metric.unit ? ` ${metric.unit}` : ""}`
            : `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`}
        />)}
      </div>
      <div className="evidenceLine"><span>Evidence linked</span><strong>{lastDecision.evidenceIds.length} record{lastDecision.evidenceIds.length === 1 ? "" : "s"}</strong></div>
      <p className="muted">{decisionPresentation.evidenceMessage}</p>
      {lastDecision.nextQuestion && <div className="decisionFollowUp"><strong>Required input</strong><p>{lastDecision.nextQuestion}</p></div>}
      {!lastDecision.nextQuestion && lastDecision.nextAction && <div className="decisionFollowUp"><strong>Next action</strong><p>{lastDecision.nextAction}</p></div>}
    </div>}

    {error && <div className="notice" role="alert">{error}</div>}
    {persistError && <div className="notice" role="status">{persistError}</div>}
    {sessionConflict && <div className="composerFooter">
      <button className="button" type="button" disabled={busy} onClick={() => void restoreLatestSession()}>
        Restore latest session
      </button>
    </div>}

    <form className="composer" onSubmit={submit}>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Describe the engineering outcome you need, with known values and units. Example: calculate shaft torque for 5 kW at 1500 rpm…"
        rows={4}
        disabled={busy}
        aria-label="Engineering request"
      />
      <div className="composerFooter">
        <span className="muted">Known session context is reused where available; missing inputs are requested rather than guessed. Refresh restores this conversation when storage is available.</span>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button className="button" type="button" disabled={busy} onClick={beginNewSession}>New session</button>
          <button className="button" type="submit" disabled={busy || !draft.trim()}>{busy ? "Working…" : "Run engineering task"}</button>
        </div>
      </div>
    </form>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
