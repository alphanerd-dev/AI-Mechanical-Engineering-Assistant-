import { describe, expect, it } from "vitest";
import {
  ENGINEERING_CORE_HANDOFF_EVENT,
  MAX_ENGINEERING_CORE_HANDOFF_CHARACTERS,
  parseEngineeringCoreHandoffDetail,
  parseEngineeringChatResultDetail,
  buildEngineeringCoreHandoffIntent,
} from "../src/chat/engineering-core-handoff.js";

describe("Engineering Core chat handoff contract", () => {
  it("uses a stable event name and accepts a valid chat intent", () => {
    expect(ENGINEERING_CORE_HANDOFF_EVENT).toBe("engineering-core:handoff");
    expect(parseEngineeringCoreHandoffDetail({ source: "chat", intent: "  Size a shaft for 5 kW at 1500 rpm.  " }))
      .toEqual({ source: "chat", intent: "Size a shaft for 5 kW at 1500 rpm." });
  });

  it("rejects empty, malformed, or non-chat payloads", () => {
    expect(parseEngineeringCoreHandoffDetail(null)).toBeUndefined();
    expect(parseEngineeringCoreHandoffDetail({ source: "chat", intent: "   " })).toBeUndefined();
    expect(parseEngineeringCoreHandoffDetail({ source: "other", intent: "Calculate torque" })).toBeUndefined();
    expect(parseEngineeringCoreHandoffDetail({ source: "chat", intent: 42 })).toBeUndefined();
  });

  it("builds a bounded handoff with the latest user turn taking precedence", () => {
    const intent = buildEngineeringCoreHandoffIntent([
      { role: "user", content: [{ type: "text", text: "Use 5 kW at 1200 rpm." }] },
      { role: "assistant", content: [{ type: "text", text: "Earlier assistant explanation." }] },
      { role: "user", content: [{ type: "text", text: "Correction: use 7.5 kW at 1500 rpm." }] },
    ]);
    expect(intent).toContain("Latest user request (takes precedence):\nCorrection: use 7.5 kW at 1500 rpm.");
    expect(intent).toContain("Earlier user context");
    expect(intent).not.toContain("Earlier assistant explanation");
    const longLatest = "z".repeat(MAX_ENGINEERING_CORE_HANDOFF_CHARACTERS);
    expect(buildEngineeringCoreHandoffIntent([{ role: "user", content: [{ type: "text", text: "old" }] }, { role: "user", content: [{ type: "text", text: longLatest }] }])).toBe(longLatest);
  });

  it("prepares a bounded Engineering Core result for chat", () => {
    expect(parseEngineeringChatResultDetail({ source: "engineering-core", text: " Result summary " }))
      .toEqual({ source: "engineering-core", text: "Result summary" });
    expect(parseEngineeringChatResultDetail({ source: "chat", text: "Result summary" })).toBeUndefined();
  });

  it("rejects payloads that exceed the Engineering Core request limit", () => {
    expect(parseEngineeringCoreHandoffDetail({
      source: "chat",
      intent: "x".repeat(MAX_ENGINEERING_CORE_HANDOFF_CHARACTERS + 1),
    })).toBeUndefined();
  });
}
