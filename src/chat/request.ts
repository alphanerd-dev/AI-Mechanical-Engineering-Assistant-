export type EngineeringChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARACTERS = 6_000;
const MAX_TOTAL_CHARACTERS = 24_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accept only user/assistant turns and extract text content for the model.
 * Non-text parts (metadata, tool stubs, etc. that assistant-ui may attach to
 * history) are ignored. Client messages never define system instructions,
 * tools, model names, provider configuration, or files for execution.
 */
export function parseEngineeringChatMessages(value: unknown): EngineeringChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    throw new Error("messages must contain between 1 and 40 chat turns.");
  }

  let totalCharacters = 0;
  const messages = value.map((message, index): EngineeringChatMessage => {
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
      // Non-text parts are ignored (history adapters may attach metadata).
    }

    const text = textParts.join("\n");
    if (!text.trim() || text.length > MAX_MESSAGE_CHARACTERS) {
      throw new Error(`messages[${index}] text must contain 1-6000 characters.`);
    }
    totalCharacters += text.length;
    if (totalCharacters > MAX_TOTAL_CHARACTERS) {
      throw new Error("The conversation exceeds the 24000-character context limit.");
    }
    return { role: message.role, content: text };
  });

  if (messages[messages.length - 1]?.role !== "user") {
    throw new Error("The last chat message must be a user message.");
  }
  return messages;
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
 * Default is 55s so Gemini has room under the Vercel function maxDuration of 60s.
 */
export function resolveEngineeringChatTimeout(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 55_000;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 58_000) {
    throw new Error("ENGINEERING_REASONING_MODEL_TIMEOUT_MS must be an integer from 1000 to 58000.");
  }
  return timeout;
}
