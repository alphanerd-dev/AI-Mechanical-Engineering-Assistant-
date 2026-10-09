import type { ModelReasoningGenerationRequest, ModelReasoningGenerator } from "./model-adapter.js";

export interface OpenAICompatibleGeneratorOptions {
  endpoint: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class ModelTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelTransportError";
  }
}

/**
 * Server-side transport for OpenAI Chat Completions and native Gemini
 * generateContent endpoints. Provider credentials never come from request input.
 */
export class OpenAICompatibleModelReasoningGenerator implements ModelReasoningGenerator {
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

    this.endpoint = url.toString();
    this.model = options.model.trim();
    this.apiKey = options.apiKey?.trim() || undefined;
    this.timeoutMs = timeout;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.protocol = isGeminiEndpoint(url) ? "gemini" : "openai";
  }

  async generate(request: ModelReasoningGenerationRequest): Promise<unknown> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json"
    };
    if (this.protocol === "gemini") {
      if (this.apiKey) headers["x-goog-api-key"] = this.apiKey;
    } else if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }

    const body = this.protocol === "gemini"
      ? buildGeminiRequest(request)
      : buildOpenAIRequest(this.model, request);

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify(body)
      });
    } catch {
      throw new ModelTransportError("The configured reasoning model endpoint could not be reached within the allowed time.");
    }

    if (!response.ok) {
      throw new ModelTransportError(`The configured reasoning model endpoint returned HTTP ${response.status}.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ModelTransportError("The configured reasoning model endpoint did not return valid JSON.");
    }

    const content = this.protocol === "gemini"
      ? extractGeminiContent(payload)
      : extractMessageContent(payload);
    if (!content) {
      throw new ModelTransportError("The configured reasoning model response did not contain a message.");
    }

    try {
      const parsed: unknown = JSON.parse(stripJsonCodeFence(content));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Expected a JSON object.");
      }
      return parsed;
    } catch {
      throw new ModelTransportError("The reasoning model did not return a valid JSON proposal object.");
    }
  }
}

function isGeminiEndpoint(url: URL): boolean {
  return url.hostname === "generativelanguage.googleapis.com" || url.pathname.includes(":generateContent");
}

function buildOpenAIRequest(model: string, request: ModelReasoningGenerationRequest) {
  return {
    model,
    temperature: 0.2,
    max_tokens: 1800,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: request.instructions },
      {
        role: "user",
        content: JSON.stringify({
          task: request.task,
          framework: request.framework,
          inputs: request.inputs,
          trustedEvidenceReferences: request.trustedEvidenceReferences ?? []
        })
      }
    ]
  };
}

function buildGeminiRequest(request: ModelReasoningGenerationRequest) {
  return {
    systemInstruction: { parts: [{ text: request.instructions }] },
    contents: [{
      role: "user",
      parts: [{ text: JSON.stringify({
        task: request.task,
        framework: request.framework,
        inputs: request.inputs,
        trustedEvidenceReferences: request.trustedEvidenceReferences ?? []
      }) }]
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1800,
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
  return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
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
