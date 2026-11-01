export type EngineeringChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface ParsedEngineeringChatHistory {
  messages: EngineeringChatMessage[];
  originalMessageCount: number;
  droppedMessageCount: number;
  droppedCharacterCount: number;
  retainedCharacterCount: number;
}

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARACTERS = 6_000;
const MAX_TOTAL_CHARACTERS = 24_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extracts a bounded, contiguous recent suffix of the conversation.
 *
 * The newest user message is never silently truncated. Older turns may be
 * compacted or dropped to keep a long-running project chat usable, while
 * system/tool roles remain rejected and the server continues to own policy.
 */
export function parseEngineeringChatHistory(value: unknown): ParsedEngineeringChatHistory {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("messages must contain at least one chat turn.");
  }

  const originalMessageCount = value.length;
  const recent = value.slice(-MAX_MESSAGES);
  let droppedMessageCount = originalMessageCount - recent.length;
  let droppedCharacterCount = 0;

  if (!isRecord(recent[recent.length - 1]) || recent[recent.length - 1].role !== "user") {
    throw new Error("The last chat message must be a user message.");
  }

  const parsed: EngineeringChatMessage[] = [];
  for (let index = 0; index < recent.length; index += 1) {
    const message = recent[index];
    if (!isRecord(message) || (message.role !== "user" && message.role !== "assistant")) {
      throw new Error(`messages[${index}] has an unsupported role.`);
    }
    if (!Array.isArray(message.parts) || message.parts.length === 0 || message.parts.length > 16) {
      throw new Error(`messages[${index}] must contain between 1 and 16 content parts.`);
    }

    const textParts: string[] = [];
    for (const part of message.parts) {
      if (isRecord(part) && part.type === "text" && typeof part.text === "string") {
        textParts.push(part.text);
      }
      // Non-text parts are ignored; the client cannot provide tools or execution instructions.
    }

    let content = textParts.join("\n");
    const isLatestUserMessage = index === recent.length - 1;
    if (!content.trim()) {
      if (isLatestUserMessage) throw new Error("The latest user message must contain text.");
      droppedMessageCount += 1;
      continue;
    }

    if (content.length > MAX_MESSAGE_CHARACTERS) {
      if (isLatestUserMessage) {
        throw new Error(`The latest user message exceeds the ${MAX_MESSAGE_CHARACTERS}-character limit.`);
      }
      const originalLength = content.length;
      const marker = "[Earlier portion of this older message omitted to fit the chat context budget.]\n";
      content = marker + content.slice(-(MAX_MESSAGE_CHARACTERS - marker.length));
      droppedCharacterCount += originalLength - content.length;
    }

    parsed.push({ role: message.role, content });
  }

  if (parsed.length === 0 || parsed[parsed.length - 1]?.role !== "user") {
    throw new Error("The last chat message must be a user message.");
  }

  let retainedCharacterCount = parsed.reduce((total, message) => total + message.content.length, 0);
  while (retainedCharacterCount > MAX_TOTAL_CHARACTERS && parsed.length > 1) {
    const removed = parsed.shift()!;
    retainedCharacterCount -= removed.content.length;
    droppedCharacterCount += removed.content.length;
    droppedMessageCount += 1;
  }

  // Do not begin a compacted transcript with an orphaned assistant response.
  const transcriptWasCompacted = originalMessageCount > MAX_MESSAGES || droppedMessageCount > 0 || droppedCharacterCount > 0;
  while (transcriptWasCompacted && parsed.length > 1 && parsed[0]?.role === "assistant") {
    const removed = parsed.shift()!;
    retainedCharacterCount -= removed.content.length;
    droppedCharacterCount += removed.content.length;
    droppedMessageCount += 1;
  }

  return {
    messages: parsed,
    originalMessageCount,
    droppedMessageCount,
    droppedCharacterCount,
    retainedCharacterCount
  };
}

/** Backwards-compatible convenience API used by request validation tests. */
export function parseEngineeringChatMessages(value: unknown): EngineeringChatMessage[] {
  return parseEngineeringChatHistory(value).messages;
}

export function resolveOpenAICompatibleBaseURL(endpoint: string): string {
  if (typeof endpoint !== "string" || !endpoint.trim()) {
    throw new Error("A server-configured chat model endpoint is required.");
  }

  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    throw new Error("The server-configured chat model endpoint must be an absolute URL.");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The model endpoint must not embed credentials, query parameters, or fragments.");
  }
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new Error("The model endpoint must use HTTPS, except for local development.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/chat\/completions$/i, "");
  return url.toString().replace(/\/+$/, "");
}

/**
 * Total request budget for the engineering chat model call.
 * Default is 58s so Gemini has room under the Vercel function maxDuration of 60s.
 */
export function resolveEngineeringChatTimeout(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 58_000;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 58_000) {
    throw new Error("ENGINEERING_REASONING_MODEL_TIMEOUT_MS must be an integer from 1000 to 58000.");
  }
  return timeout;
}
