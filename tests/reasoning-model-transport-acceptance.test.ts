import { describe, expect, it, vi } from "vitest";
import { ModelTransportError, OpenAICompatibleModelReasoningGenerator } from "../src/reasoning-frameworks/openai-compatible-generator.js";
import type { ModelReasoningGenerationRequest } from "../src/reasoning-frameworks/model-adapter.js";
import { ModelBackedTaskReasoningProposer } from "../src/reasoning-frameworks/model-adapter.js";
import { executeTaskReasoning } from "../src/task-graph/reasoning-execution.js";
import { routeTaskReasoning } from "../src/task-graph/reasoning.js";
import type { EngineeringTaskGraph } from "../src/task-graph/types.js";

const NOW = "2026-10-09T08:00:00.000Z";
const ENDPOINT = "https://models.example.test/v1/chat/completions";
const API_KEY = "test-secret-do-not-log";
const MODEL = "acceptance-model";

const framework = {
  schemaVersion: 1 as const,
  id: "first-principles",
  version: "1.0.0",
  name: "First-Principles Thinking",
  purpose: "Separate foundational facts, assumptions, and derived constraints.",
  suitableFor: ["problem-framing"],
  requiredInputs: ["task"],
  outputKind: "REASONING_RECORD" as const
};

const task = {
  id: "live-test-task",
  projectId: "live-test-project",
  name: "Model transport acceptance",
  goal: "Outline safe acceptance checks for a model API integration without claiming engineering verification.",
  risk: "LOW" as const,
  input: {},
  status: "PROPOSED" as const,
  createdAt: NOW,
  updatedAt: NOW
};

const request: ModelReasoningGenerationRequest = {
  task,
  framework,
  inputs: { task: task.goal },
  instructions: "Return a bounded advisory reasoning proposal as JSON."
};

const validProposal = {
  status: "PROPOSED",
  assumptions: ["The configured endpoint is the intended test service."],
  output: { nextStep: "Validate the structured response before using it." },
  limitations: ["No engineering validation has been performed."],
  evidenceReferences: [],
  requiredGates: []
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function generatorWith(fetchImpl: typeof fetch): OpenAICompatibleModelReasoningGenerator {
  return new OpenAICompatibleModelReasoningGenerator({
    endpoint: ENDPOINT,
    model: MODEL,
    apiKey: API_KEY,
    timeoutMs: 5_000,
    fetchImpl
  });
}

function makeGraph(): EngineeringTaskGraph {
  return {
    id: "live-test-graph",
    projectId: task.projectId,
    revision: 1,
    tasks: [{ ...task, input: {} }]
  };
}

function routedGraph(): EngineeringTaskGraph {
  return routeTaskReasoning(makeGraph(), task.id, {
    taskType: "problem-framing",
    requestedFramework: framework.id,
    requestedFrameworkVersion: framework.version,
    required: true,
    now: NOW
  }).graph;
}

describe("reasoning model transport acceptance", () => {
  it("sends a server-configured JSON-mode request and parses a proposal object", async () => {
    let capturedUrl: RequestInfo | URL | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse({ choices: [{ message: { content: JSON.stringify(validProposal) } }] });
    }) as unknown as typeof fetch;
    const generator = generatorWith(fetchImpl);

    const output = await generator.generate(request);
    const sent = JSON.parse(String(capturedInit?.body));

    expect(String(capturedUrl)).toBe(ENDPOINT);
    expect(capturedInit?.method).toBe("POST");
    expect((capturedInit?.headers as Record<string, string>).authorization).toBe(`Bearer ${API_KEY}`);
    expect(sent.model).toBe(MODEL);
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.messages).toHaveLength(2);
    expect(output).toEqual(validProposal);
    expect(JSON.stringify(sent)).not.toContain(API_KEY);
    expect(sent).not.toHaveProperty("endpoint");
    expect(sent).not.toHaveProperty("apiKey");
  });

  it("converts upstream HTTP failures to bounded errors without exposing provider response bodies", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      error: { message: "private upstream details and secret material" }
    }, 401)) as unknown as typeof fetch;
    const generator = generatorWith(fetchImpl);

    let message = "";
    let failureCode: string | undefined;
    try {
      await generator.generate(request);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      if (error instanceof ModelTransportError) failureCode = error.code;
    }

    expect(message).toContain("HTTP 401");
    expect(message).not.toContain("private upstream details");
    expect(message).not.toContain("secret material");
    expect(failureCode).toBe("MODEL_HTTP_ERROR");
  });

  it("converts network failures to a bounded transport error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("private network and credential details");
    }) as unknown as typeof fetch;
    const generator = generatorWith(fetchImpl);

    let message = "";
    let failureCode: string | undefined;
    try {
      await generator.generate(request);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      if (error instanceof ModelTransportError) failureCode = error.code;
    }
    expect(message).toContain("failed before an HTTP response was received");
    expect(message).not.toContain("credential details");
    expect(failureCode).toBe("MODEL_NETWORK_ERROR");
  });

  it("rejects invalid response envelopes and malformed proposal JSON", async () => {
    const invalidEnvelope = generatorWith(
      vi.fn(async () => new Response("not-json", { status: 200 })) as unknown as typeof fetch
    );
    await expect(invalidEnvelope.generate(request)).rejects.toThrow(
      "did not return valid JSON"
    );

    const malformedProposal = generatorWith(
      vi.fn(async () => jsonResponse({
        choices: [{ message: { content: "{not-json" } }]
      })) as unknown as typeof fetch
    );
    await expect(malformedProposal.generate(request)).rejects.toThrow(
      "valid JSON proposal object"
    );
  });

  it("rejects a response with no message content", async () => {
    const generator = generatorWith(
      vi.fn(async () => jsonResponse({ choices: [{ message: { content: "" } }] })) as unknown as typeof fetch
    );
    await expect(generator.generate(request)).rejects.toThrow(
      "did not contain a message"
    );
  });

  it("routes a live-shaped provider response through controlled validation and preserves task state", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: JSON.stringify(validProposal) } }]
    })) as unknown as typeof fetch;
    const proposer = new ModelBackedTaskReasoningProposer(generatorWith(fetchImpl));
    const initial = routedGraph();

    const result = await executeTaskReasoning(initial, task.id, proposer, {
      now: NOW,
      recordId: "live-test-reasoning-record"
    });

    expect(result.record).toMatchObject({
      recordId: "live-test-reasoning-record",
      taskId: task.id,
      projectId: task.projectId,
      frameworkId: framework.id,
      frameworkVersion: framework.version,
      status: "PROPOSED",
      validationStatus: "NOT_PERFORMED"
    });
    expect(result.record.limitations).toContain(
      "Reasoning output is advisory and does not establish engineering correctness."
    );
    expect(result.graph.tasks[0].status).toBe("PROPOSED");
    expect(initial.tasks[0].reasoning?.records ?? []).toHaveLength(0);
    expect(result.graph.tasks[0].reasoning?.records).toHaveLength(1);
  });

  it("rejects provider attempts to assert verification or add control fields", async () => {
    const maliciousProposals = [
      { ...validProposal, status: "VERIFIED" },
      { ...validProposal, validationStatus: "VERIFIED" },
      { ...validProposal, projectId: "attacker-project" }
    ];

    for (const malicious of maliciousProposals) {
      const fetchImpl = vi.fn(async () => jsonResponse({
        choices: [{ message: { content: JSON.stringify(malicious) } }]
      })) as unknown as typeof fetch;
      const proposer = new ModelBackedTaskReasoningProposer(generatorWith(fetchImpl));
      await expect(executeTaskReasoning(routedGraph(), task.id, proposer, {
        now: NOW,
        recordId: "must-not-be-created"
      })).rejects.toThrow(/unsupported fields|VERIFIED is not allowed/);
    }
  });
  it("converts an actual AbortSignal timeout into a bounded transport error", async () => {
    let observedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        observedSignal = init?.signal as AbortSignal;
        if (observedSignal.aborted) {
          reject(observedSignal.reason);
          return;
        }
        observedSignal.addEventListener("abort", () => reject(observedSignal?.reason), { once: true });
      })
    ) as unknown as typeof fetch;
    const generator = new OpenAICompatibleModelReasoningGenerator({
      endpoint: ENDPOINT,
      model: MODEL,
      apiKey: API_KEY,
      timeoutMs: 1_000,
      fetchImpl
    });

    await expect(generator.generate(request)).rejects.toMatchObject({
      name: "ModelTransportError",
      code: "MODEL_REQUEST_TIMEOUT",
      message: "The configured reasoning model request exceeded the configured timeout."
    });
    expect(observedSignal).toBeDefined();
    expect(observedSignal?.aborted).toBe(true);
  });

});
