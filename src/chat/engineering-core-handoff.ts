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

/** Build a bounded handoff from the current thread. Latest u¶»§q«^