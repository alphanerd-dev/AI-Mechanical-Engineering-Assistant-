import type { EngineeringIntentInterpretation } from "./types.js";

export const ENGINEERING_INTENT_SESSION_STORAGE_UNAVAILABLE =
  "Engineering intent session storage is unavailable.";
export const ENGINEERING_INTENT_SESSION_PERSISTENCE_FAILED =
  "Engineering intent session could not be persisted.";

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

function cloneSession(session: EngineeringIntentSession): EngineeringIntentSession {
  return {
    ...session,
    interpretation: {
      ...session.interpretation,
      extractedInputs: { ...session.interpretation.extractedInputs },
      missingInputs: [...session.interpretation.missingInputs],
      contextUsed: [...session.interpretation.contextUsed],
      assumptions: [...session.interpretation.assumptions],
    },
  };
}

function assertSessionKey(sessionId: string, projectId: string): void {
  if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.trim().length > 128) {
    throw new Error("sessionId must be a non-empty string of at most 128 characters.");
  }
  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new Error("projectId is required.");
  }
}

export class InMemoryEngineeringIntentSessionStore implements EngineeringIntentSessionStore {
  private readonly sessions = new Map<string, EngineeringIntentSession>();

  private key(sessionId: string, projectId: string): string {
    return sessionId.trim() + "::" + projectId.trim();
  }

  async get(sessionId: string, projectId: string): Promise<EngineeringIntentSession | undefined> {
    assertSessionKey(sessionId, projectId);
    const session = this.sessions.get(this.key(sessionId, projectId));
    return session ? cloneSession(session) : undefined;
  }

  async save(session: EngineeringIntentSession): Promise<void> {
    assertSessionKey(session.sessionId, session.projectId);
    if (!session.updatedAt || Number.isNaN(Date.parse(session.updatedAt))) {
      throw new Error("updatedAt must be a valid timestamp.");
    }
    this.sessions.set(this.key(session.sessionId, session.projectId), cloneSession(session));
  }

  async delete(sessionId: string, projectId: string): Promise<void> {
    assertSessionKey(sessionId, projectId);
    this.sessions.delete(this.key(sessionId, projectId));
  }
}
