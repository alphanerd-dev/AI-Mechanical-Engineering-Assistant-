/** Explicit, same-page handoff from conversational chat to deterministic execution. */
export const ENGINEERING_CORE_HANDOFF_EVENT = "engineering-core:handoff";
export const MAX_ENGINEERING_CORE_HANDOFF_CHARACTERS = 12_000;

export type EngineeringCoreHandoffDetail = {
  intent: string;
  source: "chat";
};

export function parseEngineeringCoreHandoffDetail(value: unknown): EngineeringCoreHandoffDetail | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.source !== "chat" || typeof candidate.intent !== "string") return undefined;
  const intent = candidate.intent.trim();
  if (!intent || intent.length > MAX_ENGINEERING_CORE_HANDOFF_CHARACTERS) return undefined;
  return { intent, source: "chat" };
}

export const ENGINEERING_CHAT_RESULT_EVENT = "engineering-chat:result";

export type EngineeringChatResultDetail = {
  text: string;
  source: "engineering-core";
};

export function parseEngineeringChatResultDetail(value: unknown): EngineeringChatResultDetail | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.source !== "engineering-core" || typeof candidate.text !== "string") return undefined;
  const text = candidate.text.trim();
  if (!text || text.length > 20_000) return undefined;
  return { text, source: "engineering-core" };
}

/** Build a bounded handoff from the current thread. Latest user turn wins; earlier user turns provide context. */
export function buildEngineeringCoreHandoffIntent(messages: readonly unknown[]): string | undefined {
  const userTurns = messages.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const message = value as { role?: unknown; content?: unknown };
    if (message.role !== "user" || !Array.isArray(message.content)) return [];
    const text = message.content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const item = part as { type?: unknown; text?: unknown };
      return item.type === "text" && typeof item.text === "string" ? [item.text] : [];
    }).join("\n").trim();
    return text ? [text] : [];
  });
  const latest = userTurns.at(-1);
  if (!latest || latest.length > MAX_ENGINEERING_CORE_HANDOFF_CHARACTERS) return undefined;
  const earlier = userTurns.slice(0, -1).join("\n\n");
  if (!earlier) return latest;
  const prefix = "Latest user request (takes precedence):\n";
  const contextHeader = "\n\nEarlier user context (older turns; use only where not superseded):\n";
  if (prefix.length + latest.length + contextHeader.length >= MAX_ENGINEERING_CORE_HANDOFF_CHARACTERS) return latest;
  const available = MAX_ENGINEERING_CORE_HANDOFF_CHARACTERS - prefix.length - latest.length - contextHeader.length;
  const context = available > 0 ? earlier.slice(-available) : "";
  return `${prefix}${latest}${context ? `${contextHeader}${context}` : ""}`;
}
