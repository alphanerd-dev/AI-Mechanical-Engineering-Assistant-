import type { EngineeringIntentInterpretation } from "./types.js";

export interface EngineeringIntentSession {
  sessionId: string;
  projectId: string;
  interpretation: EngineeringIntentInterpretation;
  updatedAt: string;
}

export interface EngineeringIntentSessionStore {
  get(sessionId: string, projectId: string): Promise<EngineeringIntentSession | undefined>;
  save(session: EngineeringIntentSession): Promise<void>;
  delete(sessionId: string, projectId: string): Promise<void>;
}

export class EngineeringIntentSessionPersistenceError extends Error {
  constructor(operation: "read" | "write" | "delete") {
    super(`Engineering intent session persistence is unavailable (${operation}).`);
    this.name = "EngineeringIntentSessionPersistenceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isInterpretation(value: unknown): value is EngineeringIntentInterpretation {
  if (!isRecord(value) || typeof value.raw !== "string" || typeof value.goal !== "string") return false;
  if (value.completionUnit !== undefined && typeof value.completionUnit !== "string") return false;
  if (!isRecord(value.extractedInputs)) return false;
  if (!Object.values(value.extractedInputs).every((item) =>
    typeof item === "string" || (typeof item === "number" && Number.isFinite(item))
  )) return false;
  if (!isStringArray(value.missingInputs) || !isStringArray(value.contextUsed) || !isStringArray(value.assumptions)) return false;
  if (!["LOW", "MEDIUM", "HIGH"].includes(String(value.confidence))) return false;
  if (!["LOW", "MEDIUM", "HIGH"].includes(String(value.ambiguity))) return false;
  return true;
}

function cloneInterpretation(value: EngineeringIntentInterpretation): EngineeringIntentInterpretation {
  return {
    ...value,
    extractedInputs: { ...value.extractedInputs },
    missingInputs: [...value.missingInputs],
    contextUsed: [...value.contextUsed],
    assumptions: [...value.assumptions],
  };
}

function cloneSession(session: EngineeringIntentSession): EngineeringIntentSession {
  return { ...session, interpretation: cloneInterpretation(session.interpretation) };
}

function assertSession(session: EngineeringIntentSession): void {
  if (!session.sessionId.trim() || session.sessionId.length > 128) {
    throw new Error("sessionId must be a non-empty string of at most 128 characters.");
  }
  if (!session.projectId.trim()) throw new Error("projectId is required.");
  if (Number.isNaN(Date.parse(session.updatedAt))) throw new Error("updatedAt must be a valid timestamp.");
  if (!isInterpretation(session.interpretation)) throw new Error("Engineering intent interpretation is invalid.");
}

type MutationResult = { error: unknown | null };
type QueryResult = { data: unknown; error: unknown | null };

interface SupabaseQueryBuilder extends PromiseLike<MutationResult> {
  select(columns: string): SupabaseQueryBuilder;
  eq(column: string, value: string): SupabaseQueryBuilder;
  maybeSingle(): PromiseLike<QueryResult>;
  upsert(values: Record<string, unknown>, options: { onConflict: string }): SupabaseQueryBuilder;
  delete(): SupabaseQueryBuilder;
}

interface SupabaseSessionClient {
  from(table: "engineering_intent_sessions"): SupabaseQueryBuilder;
}

interface SessionRow {
  project_id: string;
  session_id: string;
  interpretation: unknown;
  updated_at: string;
}

export class SupabaseEngineeringIntentSessionStore implements EngineeringIntentSessionStore {
  constructor(private readonly client: unknown) {}

  private table(): SupabaseQueryBuilder {
    return (this.client as SupabaseSessionClient).from("engineering_intent_sessions");
  }

  async get(sessionId: string, projectId: string): Promise<EngineeringIntentSession | undefined> {
    let result: QueryResult;
    try {
      result = await this.table()
        .select("project_id,session_id,interpretation,updated_at")
        .eq("project_id", projectId)
        .eq("session_id", sessionId)
        .maybeSingle();
    } catch {
      throw new EngineeringIntentSessionPersistenceError("read");
    }
    if (result.error) throw new EngineeringIntentSessionPersistenceError("read");
    if (result.data === null || result.data === undefined) return undefined;

    const row = result.data as Partial<SessionRow> | null;
    if (
      !row ||
      row.project_id !== projectId ||
      row.session_id !== sessionId ||
      typeof row.updated_at !== "string" ||
      Number.isNaN(Date.parse(row.updated_at)) ||
      !isInterpretation(row.interpretation)
    ) {
      throw new Error("Stored engineering intent session is invalid.");
    }

    return {
      sessionId,
      projectId,
      interpretation: cloneInterpretation(row.interpretation),
      updatedAt: row.updated_at,
    };
  }

  async save(session: EngineeringIntentSession): Promise<void> {
    assertSession(session);
    try {
      const result = await this.table().upsert({
        project_id: session.projectId,
        session_id: session.sessionId,
        interpretation: cloneInterpretation(session.interpretation) as unknown as Record<string, unknown>,
        updated_at: session.updatedAt,
      }, { onConflict: "project_id,session_id" });
      if (result.error) throw new EngineeringIntentSessionPersistenceError("write");
    } catch (error) {
      if (error instanceof EngineeringIntentSessionPersistenceError) throw error;
      throw new EngineeringIntentSessionPersistenceError("write");
    }
  }

  async delete(sessionId: string, projectId: string): Promise<void> {
    try {
      const result = await this.table()
        .delete()
        .eq("project_id", projectId)
        .eq("session_id", sessionId);
      if (result.error) throw new EngineeringIntentSessionPersistenceError("delete");
    } catch (error) {
      if (error instanceof EngineeringIntentSessionPersistenceError) throw error;
      throw new EngineeringIntentSessionPersistenceError("delete");
    }
  }
}

export class InMemoryEngineeringIntentSessionStore implements EngineeringIntentSessionStore {
  private readonly sessions = new Map<string, EngineeringIntentSession>();

  private key(sessionId: string, projectId: string): string {
    return sessionId + "::" + projectId;
  }

  async get(sessionId: string, projectId: string): Promise<EngineeringIntentSession | undefined> {
    const session = this.sessions.get(this.key(sessionId, projectId));
    return session ? cloneSession(session) : undefined;
  }

  async save(session: EngineeringIntentSession): Promise<void> {
    assertSession(session);
    this.sessions.set(this.key(session.sessionId, session.projectId), cloneSession(session));
  }

  async delete(sessionId: string, projectId: string): Promise<void> {
    this.sessions.delete(this.key(sessionId, projectId));
  }
}
