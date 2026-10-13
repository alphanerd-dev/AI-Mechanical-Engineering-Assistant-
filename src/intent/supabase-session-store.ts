import type { createClient } from "../../lib/supabase/server.js";
import {
  EngineeringIntentSessionPersistenceError,
  type EngineeringIntentSession,
  type EngineeringIntentSessionStore,
} from "./session.js";
import type { EngineeringIntentInterpretation } from "./types.js";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isInterpretation(value: unknown): value is EngineeringIntentInterpretation {
  if (!isRecord(value) || !isRecord(value.extractedInputs)) return false;
  const validInputs = Object.values(value.extractedInputs).every(
    (item) => typeof item === "string" || (typeof item === "number" && Number.isFinite(item)),
  );
  return (
    typeof value.raw === "string" &&
    typeof value.goal === "string" &&
    (value.completionUnit === undefined || typeof value.completionUnit === "string") &&
    validInputs &&
    isStringArray(value.missingInputs) &&
    (value.confidence === "LOW" || value.confidence === "MEDIUM" || value.confidence === "HIGH") &&
    (value.ambiguity === "LOW" || value.ambiguity === "MEDIUM" || value.ambiguity === "HIGH") &&
    isStringArray(value.contextUsed) &&
    isStringArray(value.assumptions)
  );
}

function isSessionRow(value: unknown): value is {
  project_id: string;
  session_id: string;
  interpretation: EngineeringIntentInterpretation;
  updated_at: string;
} {
  return (
    isRecord(value) &&
    typeof value.project_id === "string" &&
    typeof value.session_id === "string" &&
    typeof value.updated_at === "string" &&
    isInterpretation(value.interpretation)
  );
}

export class SupabaseEngineeringIntentSessionStore implements EngineeringIntentSessionStore {
  constructor(private readonly supabase: SupabaseServerClient) {}

  async get(sessionId: string, projectId: string): Promise<EngineeringIntentSession | undefined> {
    try {
      const { data, error } = await this.supabase
        .from("engineering_intent_sessions")
        .select("project_id,session_id,interpretation,updated_at")
        .eq("project_id", projectId)
        .eq("session_id", sessionId)
        .maybeSingle();

      if (error) throw new EngineeringIntentSessionPersistenceError();
      if (data === null) return undefined;
      if (
        !isSessionRow(data) ||
        data.project_id !== projectId ||
        data.session_id !== sessionId
      ) {
        throw new EngineeringIntentSessionPersistenceError();
      }

      return {
        sessionId: data.session_id,
        projectId: data.project_id,
        interpretation: {
          ...data.interpretation,
          extractedInputs: { ...data.interpretation.extractedInputs },
          missingInputs: [...data.interpretation.missingInputs],
          contextUsed: [...data.interpretation.contextUsed],
          assumptions: [...data.interpretation.assumptions],
        },
        updatedAt: data.updated_at,
      };
    } catch (error) {
      if (error instanceof EngineeringIntentSessionPersistenceError) throw error;
      throw new EngineeringIntentSessionPersistenceError();
    }
  }

  async save(session: EngineeringIntentSession): Promise<void> {
    if (
      !session.sessionId.trim() ||
      session.sessionId.length > 128 ||
      !session.projectId.trim() ||
      !isInterpretation(session.interpretation) ||
      !Number.isFinite(Date.parse(session.updatedAt))
    ) {
      throw new EngineeringIntentSessionPersistenceError();
    }

    try {
      const { error } = await this.supabase.from("engineering_intent_sessions").upsert(
        {
          project_id: session.projectId,
          session_id: session.sessionId,
          interpretation: session.interpretation,
          updated_at: session.updatedAt,
        },
        { onConflict: "project_id,session_id" },
      );
      if (error) throw new EngineeringIntentSessionPersistenceError();
    } catch (error) {
      if (error instanceof EngineeringIntentSessionPersistenceError) throw error;
      throw new EngineeringIntentSessionPersistenceError();
    }
  }

  async delete(sessionId: string, projectId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("engineering_intent_sessions")
        .delete()
        .eq("project_id", projectId)
        .eq("session_id", sessionId);
      if (error) throw new EngineeringIntentSessionPersistenceError();
    } catch (error) {
      if (error instanceof EngineeringIntentSessionPersistenceError) throw error;
      throw new EngineeringIntentSessionPersistenceError();
    }
  }
}
