"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [persistError, setPersistError] = useState<string>();
  const [restoreState, setRestoreState] = useState<RestoreState>("loading");
  const [restoreDetail, setRestoreDetail] = useState<string>();

  const lastDecision = useMemo(
    () => [...messages].reverse().find((message) => message.decision)?.decision,
    [messages],
  );

  const beginNewSession = useCallback(() => {
    const nextId = createSessionId();
    setSessionId(nextId);
    setMessages([WELCOME]);
    setError(undefined);
    setPersistError(undefined);
    setRestoreDetail(undefined);
    setRestoreState("ready");
    try {
      sessionStorage.setItem(storageKey(projectId), nextId);
    } catch {
      // sessionStorage may be unavailable; server identity still works for this page load.
    }
  }, [projectId]);

  const persistConversation = useCallback(async (activeSessionId: string, nextMessages: Message[]) => {
    try {
      const response = await fetch("/api/engineering/intent", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          sessionId: activeSessionId,
          conversation: nextMessages.filter((message) => message.text.trim()),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPersistError(typeof body.error === "string"
          ? body.error
          : "Conversation could not be saved. Your current view remains available.");
        return;
      }
      setPersistError(undefined);
    } catch {
      setPersistError("Conversation could not be saved. Your current view remains available.");
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      setRestoreState("loading");
      setRestoreDetail(undefined);

      let storedId: string | null = null;
      try {
        storedId = sessionStorage.getItem(storageKey(projectId));
      } catch {
        storedId = null;
      }

      // No prior session identity → start a new conversation explicitly.
      if (!storedId) {
        if (!cancelled) beginNewSession();
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
          // Prior session was deleted or never persisted — start clean without pretending restore succeeded.
          beginNewSession();
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

        const conversation = isMessageArray(body.conversation) ? body.conversation : [];
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
    setMessages((current) => [...current, engineerMessage]);
    setBusy(true);

    try {
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
        throw new Error("The engineering service returned no usable decision. Your draft is still available.");
      }

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

      setMessages((current) => {
        const next = [...current, assistantMessage];
        void persistConversation(sessionId, next);
        return next;
      });

      if (decision.status !== "FAILED") setDraft("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Engineering request failed.";
      setError(message);
      setMessages((current) => {
        const next: Message[] = [
          ...current,
          {
            role: "assistant",
            text: "No usable engineering decision was returned. Your draft is still available to edit or retry.",
            at: new Date().toISOString(),
          },
        ];
        void persistConversation(sessionId, next);
        return next;
      });
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

    {lastDecision && <div className="decisionCard">
      <div className="decisionTop"><span className="tag">DECISION</span><strong>{lastDecision.status}</strong></div>
      <div className="decisionGrid">
        <Metric label="Validation" value={lastDecision.validationPassed ? "PASS" : "NOT VERIFIED"} />
        {lastDecision.metrics.map((metric) => <Metric
          key={metric.key}
          label={metric.key}
          value={typeof metric.value === "number"
            ? `${metric.value.toFixed(2)}${metric.unit ? ` ${metric.unit}` : ""}`
            : `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`}
        />)}
      </div>
      <div className="evidenceLine"><span>Evidence linked</span><strong>{lastDecision.evidenceIds.length} record{lastDecision.evidenceIds.length === 1 ? "" : "s"}</strong></div>
      {lastDecision.evidenceIds.length === 0 && <p className="muted">No evidence is attached to this result. It is not verified unless and until the required checks and evidence contract are satisfied.</p>}
    </div>}

    {error && <div className="notice" role="alert">{error}</div>}
    {persistError && <div className="notice" role="status">{persistError}</div>}

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
