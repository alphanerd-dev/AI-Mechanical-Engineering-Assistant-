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
  snapshotRevision: number;
  interpretation: EngineeringIntentInterpretation;
  conversation: ConversationMessage[];
  updatedAt: string;
}

export type SessionSaveOptions =
  | { createOnly: true }
  | { expectedRevision: number };

export class EngineeringIntentSessionConflictError extends Error {
  constructor() {
    super("Engineering intent session changed since it was read. Reload the session before saving.");
    this.name = "EngineeringIntentSessionConflictError";
  }
}

export interface EngineeringIntentSessionStore {
  get(sessionId: string, projectId: string): Promise<EngineeringIntentSession | undefined>;
  save(session: EngineeringIntentSession, options?: SessionSaveOptions): Promise<void>;
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
  if (session.schemaVersion !== ENGINEERING_INTENT_SESSION_SCHEMA_VERSION) {
    throw new Error("schemaVersion is unsupported.");
  }
  if (!Number.isInteger(session.snapshotRevision) || session.snapshotRevision < 1) {
    throw new Error("snapshotRevision must be a positive integer.");
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
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  maybeSingle(): PromiseLike<QueryResult>;
  upsert(values: Record<string, unknown>, options: { onConflict: string }): SupabaseQueryBuilder;
  insert(values: Record<string, unknown>): SupabaseQueryBuilder;
  update(values: Record<string, unknown>): SupabaseQueryBuilder;
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
  snapshot_revision?: unknown;
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

  if (!isInterpretation(row.interpretation)) {
    throw new Error("Stored engineering intent session is invalid.");
  }

  const schemaVersion = row.schema_version === undefined
    ? ENGINEERING_INTENT_SESSION_SCHEMA_VERSION
    : row.schema_version;
  const snapshotRevision = row.snapshot_revision === undefined ? 1 : row.snapshot_revision;
  if (
    typeof schemaVersion !== "number" ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion !== ENGINEERING_INTENT_SESSION_SCHEMA_VERSION ||
    typeof snapshotRevision !== "number" ||
    !Number.isInteger(snapshotRevision) ||
    snapshotRevision < 1
  ) {
    throw new Error("Stored engineering intent session is invalid.");
  }

  let conversation: ConversationMessage[];
  try {
    conversation = parseConversation(row.conversation);
  } catch {
    throw new Error("Stored engineering intent session is invalid.");
  }

  return {
    sessionId,
    projectId,
    schemaVersion,
    snapshotRevision,
    interpretation: cloneInterpretation(row.interpretation),
    conversation,
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

  async save(
    session: EngineeringIntentSession,
    options?: SessionSaveOptions,
  ): Promise<void> {
    assertSession(session);

    let policy = options;
    if (!policy) {
      const current = await this.get(session.sessionId, session.projectId);
      policy = current
        ? { expectedRevision: current.snapshotRevision }
        : { createOnly: true };
    }

    const snapshotRevision = "createOnly" in policy
      ? 1
      : policy.expectedRevision + 1;
    const next: EngineeringIntentSession = {
      ...cloneSession(session),
      snapshotRevision,
    };
    const values: Record<string, unknown> = {
      project_id: next.projectId,
      session_id: next.sessionId,
      interpretation: next.interpretation,
      conversation: next.conversation,
      schema_version: next.schemaVersion,
      snapshot_revision: next.snapshotRevision,
      updated_at: next.updatedAt,
    };

    try {
      let result: QueryResult;
      if ("createOnly" in policy) {
        result = await this.table()
          .insert(values)
          .select("project_id,session_id,snapshot_revision")
          .maybeSingle();
      } else {
        result = await this.table()
          .update(values)
          .eq("project_id", next.projectId)
          .eq("session_id", next.sessionId)
          .eq("snapshot_revision", policy.expectedRevision)
          .select("project_id,session_id,snapshot_revision")
          .maybeSingle();
      }

      if (result.error) {
        const errorCode = isRecord(result.error) ? result.error.code : undefined;
        if ("createOnly" in policy && errorCode === "23505") {
          throw new EngineeringIntentSessionConflictError();
        }
        throw new EngineeringIntentSessionPersistenceError("write");
      }
      if (!result.data) throw new EngineeringIntentSessionConflictError();
    } catch (error) {
      if (
        error instanceof EngineeringIntentSessionConflictError ||
        error instanceof EngineeringIntentSessionPersistenceError
      ) {
        throw error;
      }
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

  async save(
    session: EngineeringIntentSession,
    options?: SessionSaveOptions,
  ): Promise<void> {
    assertSession(session);
    const key = this.key(session.sessionId, session.projectId);
    const current = this.sessions.get(key);
    let policy = options;
    if (!policy) {
      policy = current
        ? { expectedRevision: current.snapshotRevision }
        : { createOnly: true };
    }

    if ("createOnly" in policy) {
      if (current) throw new EngineeringIntentSessionConflictError();
      const created = { ...cloneSession(session), snapshotRevision: 1 };
      this.sessions.set(key, created);
      return;
    }

    if (!current || current.snapshotRevision !== policy.expectedRevision) {
      throw new EngineeringIntentSessionConflictError();
    }
    const updated = {
      ...cloneSession(session),
      snapshotRevision: policy.expectedRevision + 1,
    };
    this.sessions.set(key, updated);
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
    snapshotRevision: 1,
    interpretation: emptyInterpretation(),
    conversation: [],
    updatedAt: new Date().toISOString(),
  };
}
