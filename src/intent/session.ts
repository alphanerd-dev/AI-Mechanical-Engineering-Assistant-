import type { EngineeringIntentDecision, EngineeringIntentInterpretation } from "./types.js";

export const ENGINEERING_INTENT_SESSION_SCHEMA_VERSION = 1 as const;
export const MAX_CONVERSATION_MESSAGES = 200;
export const MAX_MESSAGE_TEXT_LENGTH = 8000;

export type ConversationRole = "engineer" | "assistant";

export interface ConversationMessage {
  role: ConversationRole;
  text: string;
  decision?: EngineeringIntentDecision;
  at?: string;
}

export interface EngineeringIntentSession {
  sessionId: string;
  projectId: string;
  schemaVersion: number;
  interpretation: EngineeringIntentInterpretation;
  conversation: ConversationMessage[];
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

function isDecision(value: unknown): value is EngineeringIntentDecision {
  if (!isRecord(value)) return false;
  if (typeof value.status !== "string" || typeof value.validationPassed !== "boolean") return false;
  if (!Array.isArray(value.metrics) || !Array.isArray(value.evidenceIds)) return false;
  if (value.nextAction !== undefined && typeof value.nextAction !== "string") return false;
  if (value.nextQuestion !== undefined && typeof value.nextQuestion !== "string") return false;
  if (!value.evidenceIds.every((id) => typeof id === "string")) return false;
  return true;
}

export function parseConversation(value: unknown): ConversationMessage[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("conversation must be an array.");
  if (value.length > MAX_CONVERSATION_MESSAGES) {
    throw new Error(`conversation must contain at most ${MAX_CONVERSATION_MESSAGES} messages.`);
  }
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`conversation[${index}] must be an object.`);
    if (item.role !== "engineer" && item.role !== "assistant") {
      throw new Error(`conversation[${index}].role must be engineer or assistant.`);
    }
    if (typeof item.text !== "string" || !item.text.trim() || item.text.length > MAX_MESSAGE_TEXT_LENGTH) {
      throw new Error(`conversation[${index}].text must be a non-empty string of at most ${MAX_MESSAGE_TEXT_LENGTH} characters.`);
    }
    if (item.at !== undefined && (typeof item.at !== "string" || Number.isNaN(Date.parse(item.at)))) {
      throw new Error(`conversation[${index}].at must be a valid timestamp when provided.`);
    }
    if (item.decision !== undefined && !isDecision(item.decision)) {
      throw new Error(`conversation[${index}].decision is invalid.`);
    }
    const message: ConversationMessage = {
      role: item.role,
      text: item.text,
    };
    if (item.at) message.at = item.at;
    if (item.decision) message.decision = item.decision;
    return message;
  });
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

function cloneConversation(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.map((message) => ({
    ...message,
    decision: message.decision
      ? {
          ...message.decision,
          metrics: [...message.decision.metrics],
          evidenceIds: [...message.decision.evidenceIds],
        }
      : undefined,
  }));
}

function cloneSession(session: EngineeringIntentSession): EngineeringIntentSession {
  return {
    ...session,
    interpretation: cloneInterpretation(session.interpretation),
    conversation: cloneConversation(session.conversation),
  };
}

export function assertSession(session: EngineeringIntentSession): void {
  if (!session.sessionId.trim() || session.sessionId.length > 128) {
    throw new Error("sessionId must be a non-empty string of at most 128 characters.");
  }
  if (!session.projectId.trim()) throw new Error("projectId is required.");
  if (!Number.isInteger(session.schemaVersion) || session.schemaVersion < 1) {
    throw new Error("schemaVersion must be a positive integer.");
  }
  if (Number.isNaN(Date.parse(session.updatedAt))) throw new Error("updatedAt must be a valid timestamp.");
  if (!isInterpretation(session.interpretation)) throw new Error("Engineering intent interpretation is invalid.");
  parseConversation(session.conversation);
}

function emptyInterpretation(): EngineeringIntentInterpretation {
  return {
    raw: "",
    goal: "engineering task",
    extractedInputs: {},
    missingInputs: [],
    confidence: "LOW",
    ambiguity: "HIGH",
    contextUsed: [],
    assumptions: [],
  };
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
  conversation?: unknown;
  schema_version?: unknown;
  updated_at: string;
}

function rowToSession(row: Partial<SessionRow>, sessionId: string, projectId: string): EngineeringIntentSession {
  if (
    row.project_id !== projectId ||
    row.session_id !== sessionId ||
    typeof row.updated_at !== "string" ||
    Number.isNaN(Date.parse(row.updated_at))
  ) {
    throw new Error("Stored engineering intent session is invalid.");
  }

  const interpretation = isInterpretation(row.interpretation)
    ? cloneInterpretation(row.interpretation)
    : emptyInterpretation();

  const schemaVersion =
    typeof row.schema_version === "number" && Number.isInteger(row.schema_version) && row.schema_version >= 1
      ? row.schema_version
      : ENGINEERING_INTENT_SESSION_SCHEMA_VERSION;

  return {
    sessionId,
    projectId,
    schemaVersion,
    interpretation,
    conversation: parseConversation(row.conversation),
    updatedAt: row.updated_at,
  };
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
        .select("project_id,session_id,interpretation,conversation,schema_version,updated_at")
        .eq("project_id", projectId)
        .eq("session_id", sessionId)
        .maybeSingle();
    } catch {
      throw new EngineeringIntentSessionPersistenceError("read");
    }
    if (result.error) throw new EngineeringIntentSessionPersistenceError("read");
    if (result.data === null || result.data === undefined) return undefined;

    try {
      return rowToSession(result.data as Partial<SessionRow>, sessionId, projectId);
    } catch {
      throw new Error("Stored engineering intent session is invalid.");
    }
  }

  async save(session: EngineeringIntentSession): Promise<void> {
    assertSession(session);
    try {
      const result = await this.table().upsert({
        project_id: session.projectId,
        session_id: session.sessionId,
        interpretation: cloneInterpretation(session.interpretation) as unknown as Record<string, unknown>,
        conversation: cloneConversation(session.conversation) as unknown as Record<string, unknown>[],
        schema_version: session.schemaVersion,
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

export function createEmptySession(sessionId: string, projectId: string): EngineeringIntentSession {
  return {
    sessionId,
    projectId,
    schemaVersion: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
    interpretation: emptyInterpretation(),
    conversation: [],
    updatedAt: new Date().toISOString(),
  };
}
