import type { ModelReasoningGenerationRequest, ModelReasoningGenerator } from "./model-adapter.js";
import type { StructuredModelGenerationRequest, StructuredModelGenerator } from "../agents/runtime.js";

export interface OpenAICompatibleGeneratorOptions {
  endpoint: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type ModelTransportErrorCode =
  | "MODEL_NETWORK_ERROR"
  | "MODEL_REQUEST_TIMEOUT"
  | "MODEL_HTTP_ERROR"
  | "MODEL_INVALID_RESPONSE_JSON"
  | "MODEL_MISSING_RESPONSE_CONTENT"
  | "MODEL_INVALID_PROPOSAL_JSON";

export class ModelTransportError extends Error {
  constructor(message: string, readonly code: ModelTransportErrorCode) {
    super(message);
    this.name = "ModelTransportError";
  }
}

/**
 * Server-side transport for OpenAI Chat Completions and native Gemini
 * generateContent endpoints. Provider credentials never come from request input.
 *
 * The structured generation method is deliberately generic. Callers still own
 * their own strict output parser and backend authorization boundary.
 */
export class OpenAICompatibleModelReasoningGenerator implements ModelReasoningGenerator, StructuredModelGenerator {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly protocol: "openai" | "gemini";

  constructor(options: OpenAICompatibleGeneratorOptions) {
    if (!options || typeof options.endpoint !== "string" || !options.endpoint.trim()) {
      throw new Error("A configured reasoning model endpoint is required.");
    }
    if (typeof options.model !== "string" || !options.model.trim()) {
      throw new Error("A configured reasoning model name is required.");
    }

    let url: URL;
    try {
      url = new URL(options.endpoint);
    } catch {
      throw new Error("Reasoning model endpoint must be an absolute HTTP(S) URL.");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Reasoning model endpoint must use HTTP(S) without embedded credentials.");
    }

    const timeout = options.timeoutMs ?? 45_000;
    if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
      throw new Error("Reasoning model timeout must be an integer from 1000 to 120000 milliseconds.");
    }

    // Accept both an explicit Chat Completions URL and Google's documented
    // OpenAI-compatible API base URL. A base URL ending in /v1beta/openai
    // otherwise receives a POST at the collection root and returns HTTP 404.
    if (
      url.hostname === "generativelanguage.googleapis.com" &&
      /^\/v1beta\/openai\/?$/.test(url.pathname)
    ) {
      url.pathname = "/v1beta/openai/chat/completions";
    }

    this.endpoint = url.toString();
    this.model = options.model.trim();
    this.apiKey = options.apiKey?.trim() || undefined;
    this.timeoutMs = timeout;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.protocol = isGeminiEndpoint(url) ? "gemini" : "openai";
  }

  async generate(request: ModelReasoningGenerationRequest): Promise<unknown> {
    return this.generateStructured({
      instructions: request.instructions,
      input: {
        task: request.task,
        framework: request.framework,
        inputs: request.inputs,
        trustedEvidenceReferences: request.trustedEvidenceReferences ?? []
      },
      maxOutputTokens: 1800
    });
  }

  async generateStructured(request: StructuredModelGenerationRequest): Promise<unknown> {
    const inputJson = serializeStructuredInput(request);
    const response = await sendStructuredRequest({
      endpoint: this.endpoint,
      model: this.model,
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      protocol: this.protocol,
      instructions: request.instructions,
      inputJson,
      maxOutputTokens: request.maxOutputTokens ?? 1800
    });
    if (!response.ok) {
      throw new ModelTransportError(
        `The configured reasoning model endpoint returned HTTP ${response.status}.`,
        "MODEL_HTTP_ERROR"
      );
    }
    return parseStructuredModelResponse(response, this.protocol);
  }
}

interface StructuredTransportRequest {
  endpoint: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  protocol: "openai" | "gemini";
  instructions: string;
  inputJson: string;
  maxOutputTokens: number;
}

function validateStructuredInstructions(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Structured model instructions are required.");
  }
}

function validateOutputTokenLimit(value: number): void {
  if (!Number.isInteger(value) || value < 128 || value > 8192) {
    throw new Error("Structured model output limit must be an integer from 128 to 8192 tokens.");
  }
}

function stringifyStructuredInput(value: unknown): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("Structured model input must be JSON serializable.");
  }
  if (serialized === undefined || serialized.length > 256_000) {
    throw new Error("Structured model input must be defined and no larger than 256 KB.");
  }
  return serialized;
}

function serializeStructuredInput(request: StructuredModelGenerationRequest): string {
  validateStructuredInstructions(request?.instructions);
  validateOutputTokenLimit(request.maxOutputTokens ?? 1800);
  return stringifyStructuredInput(request.input);
}

async function sendStructuredRequest(request: StructuredTransportRequest): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json"
  };
  if (request.protocol === "gemini") {
    if (request.apiKey) headers["x-goog-api-key"] = request.apiKey;
  } else if (request.apiKey) {
    headers.authorization = `Bearer ${request.apiKey}`;
  }

  const body = request.protocol === "gemini"
    ? buildGeminiRequest(request.instructions, request.inputJson, request.maxOutputTokens)
    : buildOpenAIRequest(request.model, request.instructions, request.inputJson, request.maxOutputTokens);
  const requestInit: RequestInit = {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(request.timeoutMs),
    body: JSON.stringify(body)
  };
  try {
    return await request.fetchImpl(request.endpoint, requestInit);
  } catch {
    if (requestInit.signal?.aborted) {
      throw new ModelTransportError(
        "The configured reasoning model request exceeded the configured timeout.",
        "MODEL_REQUEST_TIMEOUT"
      );
    }
    throw new ModelTransportError(
      "The configured reasoning model request failed before an HTTP response was received.",
      "MODEL_NETWORK_ERROR"
    );
  }
}

async function parseStructuredModelResponse(
  response: Response,
  protocol: "openai" | "gemini"
): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ModelTransportError(
      "The configured reasoning model endpoint did not return valid JSON.",
      "MODEL_INVALID_RESPONSE_JSON"
    );
  }
  const responseContent = protocol === "gemini"
    ? extractGeminiContent(payload)
    : extractMessageContent(payload);
  if (!responseContent) {
    throw new ModelTransportError(
      "The configured reasoning model response did not contain a message.",
      "MODEL_MISSING_RESPONSE_CONTENT"
    );
  }
  try {
    const parsed: unknown = JSON.parse(stripJsonCodeFence(responseContent));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object.");
    }
    return parsed;
  } catch {
    throw new ModelTransportError(
      "The reasoning model did not return a valid JSON proposal object.",
      "MODEL_INVALID_PROPOSAL_JSON"
    );
  }
}

function isGeminiEndpoint(url: URL): boolean {
  // Select the wire protocol from the endpoint path, not the host. Google's
  // /v1beta/openai/chat/completions endpoint is OpenAI-compatible even though
  // it shares a hostname with native Gemini generateContent endpoints.
  return url.pathname.includes(":generateContent");
}

function buildOpenAIRequest(model: string, instructions: string, inputJson: string, maxOutputTokens: number) {
  return {
    model,
    temperature: 0.2,
    max_tokens: maxOutputTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: inputJson }
    ]
  };
}

function buildGeminiRequest(instructions: string, inputJson: string, maxOutputTokens: number) {
  return {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{
      role: "user",
      parts: [{ text: inputJson }]
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens,
      responseMimeType: "application/json"
    }
  };
}

function extractMessageContent(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const choices = (value as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || !choices.length) return undefined;
  const first = choices[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) return undefined;
  const message = (first as Record<string, unknown>).message;
  if (typeof message !== "object" || message === null || Array.isArray(message)) return undefined;
  const content = (message as Record<string, unknown>).content;
  return typeof content === "string" && content.trim() ? content.trim() : undefined;
}

function extractGeminiContent(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const candidates = (value as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates) || !candidates.length) return undefined;
  const first = candidates[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) return undefined;
  const content = (first as Record<string, unknown>).content;
  if (typeof content !== "object" || content === null || Array.isArray(content)) return undefined;
  const parts = (content as Record<string, unknown>).parts;
  if (!Array.isArray(parts)) return undefined;
  const text = parts
    .filter((part): part is Record<string, unknown> => typeof part === "object" && part !== null && !Array.isArray(part))
    .map((part) => part.text)
    .find((text): text is string => typeof text === "string" && text.trim().length > 0);
  return text?.trim();
}

function stripJsonCodeFence(content: string): string {
  return content.replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "").trim();
}

export function createConfiguredReasoningGenerator(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch
): OpenAICompatibleModelReasoningGenerator | undefined {
  const endpoint = env.ENGINEERING_REASONING_MODEL_URL?.trim();
  const model = env.ENGINEERING_REASONING_MODEL_NAME?.trim();
  if (!endpoint || !model) return undefined;
  return new OpenAICompatibleModelReasoningGenerator({
    endpoint,
    model,
    apiKey: env.ENGINEERING_REASONING_MODEL_API_KEY,
    timeoutMs: parseTimeout(env.ENGINEERING_REASONING_MODEL_TIMEOUT_MS),
    fetchImpl
  });
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 45_000;
  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
    throw new Error("Reasoning model timeout must be an integer from 1000 to 120000 milliseconds.");
  }
  return timeout;
}
