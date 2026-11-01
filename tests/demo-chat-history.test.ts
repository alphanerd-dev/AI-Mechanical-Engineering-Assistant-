import { describe, expect, it } from "vitest";
import { loadDemoConversation, saveDemoConversation, type DemoConversationMessage } from "../src/chat/demo-history.js";

function createStorage() {
  const values = new Map<string, string>();
  return { values, getItem(key: string) { return values.get(key) ?? null; }, setItem(key: string, value: string) { values.set(key, value); } };
}

const SESSION = "engineering-chat-test-session";
const conversation: DemoConversationMessage[] = [
  { role: "engineer", text: JSON.stringify({ id: "u1", content: "hello" }), at: "2026-10-29T18:00:00.000Z" },
  { role: "assistant", text: JSON.stringify({ id: "a1", content: "world" }), at: "2026-10-29T18:00:01.000Z" },
];

describe("demo chat browser-session history", () => {
  it("restores the same transcript after refresh using the same session storage", () => {
    const storage = createStorage();
    saveDemoConversation(storage, SESSION, conversation);
    expect(loadDemoConversation(storage, SESSION)).toEqual(conversation);
  });
  it("does not overwrite unreadable history", () => {
    const storage = createStorage();
    storage.setItem("engineering-chat-history:demo:" + SESSION, "{broken json");
    expect(() => loadDemoConversation(storage, SESSION)).toThrow(/unreadable/);
    expect(storage.getItem("engineering-chat-history:demo:" + SESSION)).toBe("{broken json");
  });
  it("rejects transcripts beyond the supported history limit", () => {
    const storage = createStorage();
    const tooMany = Array.from({ length: 201 }, (_, index) => ({ role: "engineer" as const, text: `message-${index}` }));
    expect(() => saveDemoConversation(storage, SESSION, tooMany)).toThrow(/unsupported shape/);
  });
});