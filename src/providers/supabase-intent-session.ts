import type { SupabaseClient } from "@supabase/supabase-js";
import type { EngineeringIntentInterpretation } from "../intent/types.js";
import type { EngineeringIntentSession, EngineeringIntentSessionStore } from "../intent/session.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseIdentifier(value: unknown, field: "session_id" | "project_id"): string {
  const maxLength = field === "session_id" ? 128 : 256;
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error("Stored engineering intent session is invalid.");
  }
  return value.trim();
}

function parseTimestamp(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error("Stored engineering intent session is invalid.");
  }
  return value;
}

function parseScalarInputs(value: unknown): Record<string, number | string> {
  if (!isRecord(value)) throw new Error("Stored engineering intent session is invalid.");
  const inputs: Record<string, number | string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key.trim() || (typeof item !== "string" && typeof item !== "number") ||
        (typeof item === "number" && !Number.isFinite(item))) {
      throw new Error("Stored engineering intent session is invalid.");
    }
    inputs[key] = item;
  }
  return inputs;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Stored engineering intent session is invalid.");
  }
  return [...value];
}

function parseInterpretation(value: unknown): EngineeringIntentInterpretation {
  if (!isRecord(value)) throw new Error("Stored engineering intent session is invalid.");
  const raw = value.raw;
  const goal = value.goal;
  const completionUnit = value.completionUnit;
  const confidence = value.confidence;
  const ambiguity = value.ambiguity;
  if (typeof raw !== "string" || !raw.trim() || raw.length > 5000 ||
      typeof goal !== "string" || !goal.trim() ||
      (completionUnit !== undefined && (typeof completionUnit !== "string" || !completionUnit.trim())) ||
      !["LOW", "MEDIUM", "HIGH"].includes(String(confidence)) ||
      !["LOW", "MEDIUM", "HIGH"].includes(String(ambiguity))) {
    throw new Error("Stored engineering intent session is invalid.");
  }

  return {
    raw,
    goal,
    ...(typeof completionUnit === "string" ? { completionUnit } : {}),
    extractedInputs: parseScalarInputs(value.extractedInputs),
    missingInputs: parseStringArray(value.missingInputs),
    confidence: confidence as EngineeringIntentInterpretation["confidence"],
    ambiguity: ambiguity as EngineeringIntentInterpretation["ambiguity"],
    contextUsed: parseStringArray(value.contextUsed),
    assumptions: parseStringArray(value.assumptions),
  };
}

function parseRow(row: unknown, expectedSessionId: string, expectedProjectId: string): EngineeringIntentSession {
  if (!isRecord(row)) throw new Error("Stored engineering intent session is invalid.");
  const sessionId = parseIdentifier(row.session_id, "session_id");
  const projectId = parseIdentifier(row.project_id, "project_id");
  if (sessionId !== expectedSessionId || projectId !== expectedProjectId) {
    throw new Error("Stored engineering intent session is invalid.");
  }
  return {
    sessionId,
    projectId,
    interpretation: parseInterpretation(row.interpretation),
    updatedAt: parseTimestamp(row.updated_at),
  };
}

function validateSession(session: EngineeringIntentSession): EngineeringIntentSession {
  const sessionId = parseIdentifier(session.sessionId, "session_id");
  const projectId = parseIdentifier(session.projectId, "project_id");
  return {
    sessionId,
    projectId,
    interpretation: parseInterpretation(session.interpretation),
    updatedAt: parseTimestamp(session.updatedAt),
  };
}

export class SupabaseEngineeringIntentSessionStore implements EngineeringIntentSessionStore {
  constructor(private readonly client: SupabaseClient) {}

  async get(sessionId: string, projectId: string): Promise<EngineeringIntentSession | undefined> {
    const normalizedSessionId = parseIdentifier(sessionId, "session_id");
    const normalizedProjectId = parseIdentifier(projectId, "project_id");
    const { data, error } = await this.client
      .from("engineering_intent_sessions")
      .select("session_id, project_id, interpretation, updated_at")
      .eq("session_id", normalizedSessionId)
      .eq("project_id", normalizedProjectId)
      .maybeSingle();

    if (error) throw new Error("Engineering intent session lookup failed.");
    if (!data) return undefined;
    return parseRow(data, normalizedSessionId, normalizedProjectId);
  }

  async save(session: EngineeringIntentSession): Promise<void> {
    const validated = validateSession(session);
    const { error } = await this.client
      .from("engineering_intent_sessions")
      .upsert({
        session_id: validated.sessionId,
        project_id: validated.projectId,
        interpretation: validated.interpretation,
        updated_at: validated.updatedAt,
      }, { onConflict: "project_id,session_id" });

    if (error) throw new Error("Engineering intent session save failed.");
  }

  async delete(sessionId: string, projectId: string): Promise<void> {
    const normalizedSessionId = parseIdentifier(sessionId, "session_id");
    const normalizedProjectId = parseIdentifier(projectId, "project_id");
    const { error } = await this.client
      .from("engineering_intent_sessions")
      .delete()
      .eq("session_id", normalizedSessionId)
      .eq("project_id", normalizedProjectId);

    if (error) throw new Error("Engineering intent session delete failed.");
  }
}
