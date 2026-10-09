import { describe, expect, it } from "vitest";
import {
  AcceptanceConfigurationError,
  validateLiveProviderConfiguration
} from "../scripts/lib/reasoning-model-live-acceptance-config.js";

const validEnvironment: Record<string, string | undefined> = {
  ENGINEERING_REASONING_MODEL_URL:
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  ENGINEERING_REASONING_MODEL_NAME: "gemini-3.8-flash",
  ENGINEERING_REASONING_MODEL_API_KEY: "placeholder-test-key",
  ENGINEERING_REASONING_MODEL_TIMEOUT_MS: "60000"
};

describe("live reasoning provider configuration", () => {
  it("accepts the explicitly configured HTTPS provider and timeout", () => {
    expect(validateLiveProviderConfiguration(validEnvironment)).toEqual({
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: "gemini-3.8-flash",
      apiKey: "placeholder-test-key",
      timeoutMs: 60_000
    });
  });

  it("reports each missing required environment variable by name only", () => {
    const required = [
      "ENGINEERING_REASONING_MODEL_URL",
      "ENGINEERING_REASONING_MODEL_NAME",
      "ENGINEERING_REASONING_MODEL_API_KEY",
      "ENGINEERING_REASONING_MODEL_TIMEOUT_MS"
    ] as const;

    for (const key of required) {
      const env = { ...validEnvironment, [key]: "   " };
      expect(() => validateLiveProviderConfiguration(env))
        .toThrow(new RegExp(key));
    }
  });

  it("rejects HTTP endpoints and URLs containing embedded credentials", () => {
    expect(() => validateLiveProviderConfiguration({
      ...validEnvironment,
      ENGINEERING_REASONING_MODEL_URL: "http://model.example/v1/chat/completions"
    })).toThrow(AcceptanceConfigurationError);

    expect(() => validateLiveProviderConfiguration({
      ...validEnvironment,
      ENGINEERING_REASONING_MODEL_URL: "https://user:password@model.example/v1/chat/completions"
    })).toThrow(/without embedded credentials/);

    expect(() => validateLiveProviderConfiguration({
      ...validEnvironment,
      ENGINEERING_REASONING_MODEL_URL: "not-a-url"
    })).toThrow(/absolute HTTPS URL/);
  });

  it("rejects timeout values outside the supported integer range", () => {
    for (const value of ["0", "999", "120001", "60000ms", "1.5", "NaN"]) {
      expect(() => validateLiveProviderConfiguration({
        ...validEnvironment,
        ENGINEERING_REASONING_MODEL_TIMEOUT_MS: value
      })).toThrow(/integer from 1000 to 120000/);
    }
  });

  it("normalizes whitespace around non-empty values without logging secrets", () => {
    const normalized = validateLiveProviderConfiguration({
      ...validEnvironment,
      ENGINEERING_REASONING_MODEL_URL:
        " https://generativelanguage.googleapis.com/v1beta/openai/chat/completions ",
      ENGINEERING_REASONING_MODEL_NAME: " gemini-3.8-flash ",
      ENGINEERING_REASONING_MODEL_API_KEY: " placeholder-test-key "
    });

    expect(normalized.model).toBe("gemini-3.8-flash");
    expect(normalized.apiKey).toBe("placeholder-test-key");
  });
});
