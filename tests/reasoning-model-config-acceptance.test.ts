import { describe, expect, it } from "vitest";
import { createConfiguredReasoningGenerator } from "../src/reasoning-frameworks/openai-compatible-generator.js";

describe("reasoning model configuration acceptance", () => {
  const valid = {
    ENGINEERING_REASONING_MODEL_URL: "https://model.example/v1/chat/completions",
    ENGINEERING_REASONING_MODEL_NAME: "reasoning-model"
  };

  it("uses the documented timeout default when timeout is absent or blank", () => {
    expect(createConfiguredReasoningGenerator(valid)).toBeDefined();
    expect(createConfiguredReasoningGenerator({
      ...valid,
      ENGINEERING_REASONING_MODEL_TIMEOUT_MS: " "
    })).toBeDefined();
  });

  it.each(["0", "999", "120001", "1.5", "not-a-number"])(
    "fails closed for invalid configured timeout %s",
    (timeout) => {
      expect(() => createConfiguredReasoningGenerator({
        ...valid,
        ENGINEERING_REASONING_MODEL_TIMEOUT_MS: timeout
      })).toThrow(/timeout must be an integer from 1000 to 120000 milliseconds/);
    }
  );

  it("fails closed for a configured endpoint with an embedded credential", () => {
    expect(() => createConfiguredReasoningGenerator({
      ...valid,
      ENGINEERING_REASONING_MODEL_URL: "https://user:secret@model.example/v1/chat/completions"
    })).toThrow(/without embedded credentials/);
  });
});
