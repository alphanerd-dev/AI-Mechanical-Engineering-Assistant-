import { describe, expect, it } from "vitest";
import {
  createConfiguredReasoningGenerator,
  ModelTransportError,
  OpenAICompatibleModelReasoningGenerator
} from "../src/reasoning-frameworks/openai-compatible-generator.js";
import type { ModelReasoningGenerationRequest } from "../src/reasoning-frameworks/model-adapter.js";

const generationRequest: ModelReasoningGenerationRequest = {
  task: {
    id: "task-1",
    projectId: "project-1",
    name: "Frame a design problem",
    goal: "List facts and constraints.",
    risk: "MEDIUM",
    input: {},
    status: "PROPOSED",
    createdAt: "2026-10-09T08:00:00.000Z",
    updatedAt: "2026-10-09T08:00:00.000Z"
  },
  framework: {
    schemaVersion: 1,
    id: "first-principles",
    version: "1.0.0",
    name: "First-Principles Thinking",
    purpose: "Separate facts and assumptions.",
    suitableFor: ["novel-design"],
    requiredInputs: ["task"],
    outputKind: "REASONING_RECORD"
  },
  inputs: { task: "List facts and constraints." },
  instructions: "Return JSON only."
};

describe("OpenAI-compatible reasoning transport", () => {
  it("sends a server-side JSON-mode request and parses the returned proposal object", async () => {
    let capturedUrl: RequestInfo | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const proposal = {
      status: "PROPOSED",
      assumptions: [],
      output: { nextStep: "List facts." },
      limitations: ["Not validated."],
      evidenceReferences: [],
      requiredGates: []
    };
    const fetchImpl: typeof fetch = async (input, init) => {
      capturedUrl = input;
      capturedInit = init;
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(proposal) } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const generator = new OpenAICompatibleModelReasoningGenerator({
      endpoint: "https://model.example/v1/chat/completions",
      model: "reasoning-model",
      apiKey: "server-secret",
      fetchImpl
    });
    const result = await generator.generate(generationRequest);
    expect(result).toEqual(proposal);
    expect(capturedUrl).toBe("https://model.example/v1/chat/completions");
    expect(capturedInit?.method).toBe("POST");
    expect((capturedInit?.headers as Record<string, string>).authorization).toBe("Bearer server-secret");
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.model).toBe("reasoning-model");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toContain("Return JSON only");
    expect(JSON.parse(body.messages[1].content).framework.version).toBe("1.0.0");
  });

  it("uses OpenAI-compatible protocol for Gemini's OpenAI chat-completions endpoint", async () => {
    let capturedInit: RequestInit | undefined;
    const proposal = {
      status: "PROPOSED",
      assumptions: [],
      output: { nextStep: "List facts." },
      limitations: ["Not validated."],
      evidenceReferences: [],
      requiredGates: []
    };
    const generator = new OpenAICompatibleModelReasoningGenerator({
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: "gemini-3.8-flash",
      apiKey: "placeholder-test-key",
      fetchImpl: async (_input, init) => {
        capturedInit = init;
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify(proposal) } }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });

    expect(await generator.generate(generationRequest)).toEqual(proposal);
    expect((capturedInit?.headers as Record<string, string>).authorization).toBe("Bearer placeholder-test-key");
    expect((capturedInit?.headers as Record<string, string>)["x-goog-api-key"]).toBeUndefined();
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.model).toBe("gemini-3.8-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toHaveLength(2);
    expect(body).not.toHaveProperty("systemInstruction");
    expect(body).not.toHaveProperty("contents");
  });

  it("keeps native Gemini generateContent requests on the native protocol", async () => {
    let capturedInit: RequestInit | undefined;
    const proposal = {
      status: "PROPOSED",
      assumptions: [],
      output: { nextStep: "List facts." },
      limitations: ["Not validated."],
      evidenceReferences: [],
      requiredGates: []
    };
    const generator = new OpenAICompatibleModelReasoningGenerator({
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
      model: "gemini-test",
      apiKey: "placeholder-test-key",
      fetchImpl: async (_input, init) => {
        capturedInit = init;
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(proposal) }] } }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    });

    expect(await generator.generate(generationRequest)).toEqual(proposal);
    expect((capturedInit?.headers as Record<string, string>)["x-goog-api-key"]).toBe("placeholder-test-key");
    expect((capturedInit?.headers as Record<string, string>).authorization).toBeUndefined();
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.systemInstruction.parts[0].text).toBe("Return JSON only.");
    expect(body.contents).toHaveLength(1);
    expect(body).not.toHaveProperty("messages");
    expect(body).not.toHaveProperty("model");
  });

  it("fails closed when transport output is missing or malformed", async () => {
    const noMessage = new OpenAICompatibleModelReasoningGenerator({
      endpoint: "https://model.example/v1/chat/completions",
      model: "reasoning-model",
      fetchImpl: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })
    });
    await expect(noMessage.generate(generationRequest)).rejects.toMatchObject({
      name: "ModelTransportError",
      code: "MODEL_MISSING_RESPONSE_CONTENT"
    });

    const malformed = new OpenAICompatibleModelReasoningGenerator({
      endpoint: "https://model.example/v1/chat/completions",
      model: "reasoning-model",
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { content: "{not-json" } }]
      }), { status: 200 })
    });
    await expect(malformed.generate(generationRequest)).rejects.toMatchObject({
      name: "ModelTransportError",
      code: "MODEL_INVALID_PROPOSAL_JSON",
      message: expect.stringMatching(/valid JSON proposal object/)
    });
  });

  it("rejects embedded credentials and invalid timeout values", () => {
    expect(() => new OpenAICompatibleModelReasoningGenerator({
      endpoint: "https://user:password@model.example/v1/chat/completions",
      model: "reasoning-model"
    })).toThrow(/without embedded credentials/);
    expect(() => new OpenAICompatibleModelReasoningGenerator({
      endpoint: "https://model.example/v1/chat/completions",
      model: "reasoning-model",
      timeoutMs: 10
    })).toThrow(/timeout must be an integer/);
  });

  it("returns no production transport until endpoint and model are configured", () => {
    expect(createConfiguredReasoningGenerator({})).toBeUndefined();
    expect(createConfiguredReasoningGenerator({
      ENGINEERING_REASONING_MODEL_URL: "https://model.example/v1/chat/completions",
      ENGINEERING_REASONING_MODEL_NAME: "reasoning-model"
    })).toBeInstanceOf(OpenAICompatibleModelReasoningGenerator);
  });
});
