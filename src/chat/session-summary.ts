type SummarizableConversationMessage = { role: "engineer" | "assistant"; text: string };

export interface EngineeringChatSessionSummary {
  sessionId: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

function firstVisibleText(value: unknown, depth = 0): string | undefined {
  if (depth > 12 || value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstVisibleText(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string" && record.text.trim()) return record.text.trim();
  for (const key of ["content", "parts", "message", "messages", "blocks", "value", "data"]) {
    if (!(key in record)) continue;
    const found = firstVisibleText(record[key], depth + 1);
    if (found) return found;
  }
  return undefined;
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
