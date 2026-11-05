import { describe, expect, it } from "vitest";
import { summarizeEngineeringChatSession } from "../src/chat/session-summary";

describe("engineering chat session summaries", () => {
  it("uses the first engineer message as the thread title", () => {
    const summary = summarizeEngineeringChatSession({
      sessionId: "engineering-chat-1",
      updatedAt: "2026-10-31T10:00:00.000Z",
      conversation: [
        { role: "assistant", text: "Opening context" },
        { role: "engineer", text: "  Design a safer pump bracket within the existing envelope  " },
      ],
    });
    expect(summary.title).toBe("Design a safer pump bracket within the existing envelope");
    expect(summary.messageCount).toBe(2);
  });

  it("extracts the first readable text from assistant-ui encoded history records", () => {
    const encoded = JSON.stringify({
      id: "message-1",
      parent_id: null,
      format: "json",
      content: { message: { parts: [{ type: "text", text: "Review the shaft bending load" }] } },
    });
    expect(summarizeEngineeringChatSession({
      sessionId: "engineering-chat-2",
      updatedAt: "2026-10-31T10:00:00.000Z",
      conversation: [{ role: "engineer", text: encoded }],
    }).title).toBe("Review the shaft bending load");
  });

  it("handles empty sessions and truncates long titles", () => {
    expect(summarizeEngineeringChatSession({
      sessionId: "engineering-chat-3", updatedAt: "2026-10-31T10:00:00.000Z", conversation: [],
    }).title).toBe("New conversation");
    expect(summarizeEngineeringChatSession({
      sessionId: "engineering-chat-4", updatedAt: "2026-10-31T10:00:00.000Z",
      conversation: [{ role: "engineer", text: "A".repeat(100) }],
    }).title).toHaveLength(60);
  });
});
