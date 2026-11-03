type SummarizableConversationMessage = { role: "engineer" | "assistant"; text: string };

export interface EngineeringChatSessionSummary {
  sessionId: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

const visibleTextKeys = ["content", "parts", "message", "messages", "blocks", "value", "data"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}

function firstVisibleTextInArray(values: unknown[], depth: number): string | undefined {
  for (const item of values) {
    const found = firstVisibleText(item, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function firstVisibleTextInRecord(record: Record<string, unknown>, depth: number): string | undefined {
  const direct = normalizedText(record.text);
  if (direct) return direct;
  for (const key of visibleTextKeys) {
    const found = firstVisibleText(record[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

function firstVisibleText(value: unknown, depth = 0): string | undefined {
  if (depth > 12 || value === null || value === undefined) return undefined;
  const direct = normalizedText(value);
  if (direct) return direct;
  if (Array.isArray(value)) return firstVisibleTextInArray(value, depth);
  return isRecord(value) ? firstVisibleTextInRecord(value, depth) : undefined;
}

function firstEngineerMessageText(message: SummarizableConversationMessage): string | undefined {
  try {
    return firstVisibleText(JSON.parse(message.text)) ?? (message.text.trim() || undefined);
  } catch {
    return message.text.trim() || undefined;
  }
}

export function summarizeEngineeringChatSession(session: {
  sessionId: string;
  conversation: SummarizableConversationMessage[];
  updatedAt: string;
}): EngineeringChatSessionSummary {
  const firstEngineerMessage = session.conversation.find(message => message.role === "engineer");
  const normalized = firstEngineerMessageText(firstEngineerMessage ?? { role: "engineer", text: "" })?.replace(/\s+/g, " ").trim();
  const title = normalized
    ? normalized.length > 62 ? normalized.slice(0, 59).trimEnd() + "…" : normalized
    : "New conversation";
  return {
    sessionId: session.sessionId,
    title,
    updatedAt: session.updatedAt,
    messageCount: session.conversation.length,
  };
}
