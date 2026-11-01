export type DemoConversationMessage = {
  role: "engineer" | "assistant";
  text: string;
  at?: string;
};

type BrowserStoragePort = Pick<Storage, "getItem" | "setItem">;

const HISTORY_LIMIT = 200;
const MESSAGE_LIMIT = 7_900;

function storageKey(sessionId: string): string {
  if (!sessionId.trim() || sessionId.length > 128) {
    throw new Error("The demo chat session ID is invalid.");
  }
  return "engineering-chat-history:demo:" + sessionId;
}

function parseMessages(value: unknown): DemoConversationMessage[] {
  if (!Array.isArray(value) || value.length > HISTORY_LIMIT) {
    throw new Error("Saved demo chat history has an unsupported shape; it was not overwritten.");
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Saved demo chat history has an unsupported shape; it was not overwritten.");
    }
    const row = item as Record<string, unknown>;
    if (row.role !== "engineer" && row.role !== "assistant") {
      throw new Error(`Saved demo chat message ${index + 1} has an unsupported role; it was not overwritten.`);
    }
    if (typeof row.text !== "string" || row.text.length === 0 || row.text.length > MESSAGE_LIMIT) {
      throw new Error(`Saved demo chat message ${index + 1} has invalid content; it was not overwritten.`);
    }
    if (row.at !== undefined && (typeof row.at !== "string" || Number.isNaN(Date.parse(row.at)))) {
      throw new Error(`Saved demo chat message ${index + 1} has an invalid timestamp; it was not overwritten.`);
    }
    return { role: row.role, text: row.text, ...(typeof row.at === "string" ? { at: row.at } : {}) };
  });
}

/** Loads demo chat from browser-local storage; demo conversations are not project records. */
export function loadDemoConversation(storage: BrowserStoragePort, sessionId: string): DemoConversationMessage[] {
  const raw = storage.getItem(storageKey(sessionId));
  if (raw === null) return [];
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error("Saved demo chat history is unreadable; it was not overwritten."); }
  return parseMessages(value);
}

/** Saves validated demo history in localStorage so it survives refresh and browser restarts. */
export function saveDemoConversation(storage: BrowserStoragePort, sessionId: string, conversation: DemoConversationMessage[]): void {
  const validated = parseMessages(conversation);
  try { storage.setItem(storageKey(sessionId), JSON.stringify(validated)); }
  catch { throw new Error("Demo chat could not be saved in this browser tab. Check browser storage and available space, then retry."); }
}