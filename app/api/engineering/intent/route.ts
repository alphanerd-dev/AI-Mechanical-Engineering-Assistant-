import { NextResponse } from "next/server";
import { CapabilityRegistry } from "../../../../src/capabilities/registry";
import { CapabilityRouter } from "../../../../src/capabilities/router";
import { V2_0_10_CAPABILITIES } from "../../../../src/capabilities/v2-0-10";
import { V2_0_11_CAPABILITIES } from "../../../../src/capabilities/v2-0-11";
import { V2_0_12_CAPABILITIES } from "../../../../src/capabilities/v2-0-12";
import { V2_0_14_CAPABILITIES } from "../../../../src/capabilities/v2-0-14";
import { V2_0_21_CAPABILITIES } from "../../../../src/capabilities/v2-0-21";
import { ENGINEERING_CAPABILITIES } from "../../../../src/capabilities/catalog";
import { NumericalAnalysisProvider } from "../../../../src/providers/numerical";
import { EngineeringCompletionProvider } from "../../../../src/providers/engineering-completion";
import { RiskAdaptiveExperienceProvider } from "../../../../src/providers/experience";
import { EngineeringContextProvider } from "../../../../src/providers/context";
import { EngineeringVerificationProvider } from "../../../../src/providers/engineering-verification";
import { ElectricalAnalysisProvider } from "../../../../src/providers/electrical";
import { ElectricalEngineeringCompletionProvider } from "../../../../src/providers/electrical-completion";
import { AIEngineeringIntentProvider } from "../../../../src/providers/ai-intent";
import { createDefaultDeterministicEngineeringIntentInterpreter } from "../../../../src/intent/deterministic";
import {
  ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
  EngineeringIntentSessionConflictError,
  EngineeringIntentSessionPersistenceError,
  SupabaseEngineeringIntentSessionStore,
  parseConversation,
  type ConversationMessage,
} from "../../../../src/intent/session";
import { createClient } from "../../../../lib/supabase/server";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";

export const runtime = "nodejs";

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { error, ...extra },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function parseSessionId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new Error("sessionId must be a non-empty string of at most 128 characters when provided.");
  }
  return value.trim();
}

function parseProjectId(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim();
}

function parseExpectedRevision(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("expectedRevision must be a positive integer when provided.");
  }
  return value;
}

async function createSessionStore() {
  try {
    return new SupabaseEngineeringIntentSessionStore(await createClient());
  } catch {
    throw new EngineeringIntentSessionPersistenceError("read");
  }
}

/** Restore a durable engineering intent session. Never creates a session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  let sessionId: string | undefined;
  let projectId: string | undefined;
  try {
    sessionId = parseSessionId(url.searchParams.get("sessionId"));
    projectId = parseProjectId(url.searchParams.get("projectId"));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid session identifiers.", 400);
  }

  if (!projectId) return jsonError("projectId is required.", 400);
  if (!sessionId) return jsonError("sessionId is required.", 400);

  let authorization;
  try {
    authorization = await authorizeSupabaseRequest("PROJECT.READ", projectId);
  } catch {
    return jsonError("Authorization service is unavailable.", 503);
  }
  if (!authorization.allowed) return jsonError(authorization.reason, 403);

  try {
    const store = await createSessionStore();
    const session = await store.get(sessionId, projectId);
    if (!session) {
      return jsonError("Engineering intent session was not found for this project.", 404, {
        code: "SESSION_NOT_FOUND",
        recoverable: true,
        lastTurnSaved: false,
      });
    }
    return NextResponse.json({
      sessionId: session.sessionId,
      projectId: session.projectId,
      schemaVersion: session.schemaVersion,
      snapshotRevision: session.snapshotRevision,
      interpretation: session.interpretation,
      conversation: session.conversation,
      updatedAt: session.updatedAt,
      restored: true,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof EngineeringIntentSessionPersistenceError) {
      return jsonError("Engineering intent session storage is unavailable.", 503, {
        code: "SESSION_STORAGE_UNAVAILABLE",
        recoverable: true,
      });
    }
    return jsonError(
      error instanceof Error ? error.message : "Engineering intent session could not be restored.",
      503,
      { code: "SESSION_RESTORE_FAILED", recoverable: true },
    );
  }
}

/** Persist visible conversation for an existing or new session identity. */
export async function PUT(request: Request) {
  const parsedBody = await request.json().catch(() => ({}));
  const body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
    ? parsedBody as Record<string, unknown>
    : {};

  let sessionId: string | undefined;
  let projectId: string | undefined;
  let conversation: ConversationMessage[];
  let expectedRevision: number | undefined;
  try {
    sessionId = parseSessionId(body.sessionId);
    projectId = parseProjectId(body.projectId);
    conversation = parseConversation(body.conversation);
    expectedRevision = parseExpectedRevision(body.expectedRevision);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid conversation payload.", 400);
  }

  if (!projectId) return jsonError("projectId is required.", 400);
  if (!sessionId) return jsonError("sessionId is required.", 400);

  let authorization;
  try {
    authorization = await authorizeSupabaseRequest("TASK.EXECUTE", projectId);
  } catch {
    return jsonError("Authorization service is unavailable.", 503);
  }
  if (!authorization.allowed) return jsonError(authorization.reason, 403);

  try {
    const store = await createSessionStore();
    const existing = await store.get(sessionId, projectId);
    const now = new Date().toISOString();
    let snapshotRevision: number;

    if (existing) {
      if (expectedRevision !== existing.snapshotRevision) {
        return jsonError("The engineering session changed in another request. Restore the latest session before saving.", 409, {
          code: "SESSION_REVISION_CONFLICT",
          snapshotRevision: existing.snapshotRevision,
          recoverable: true,
          lastTurnSaved: false,
        });
      }
      snapshotRevision = existing.snapshotRevision + 1;
      await store.save({
        ...existing,
        snapshotRevision,
        conversation,
        updatedAt: now,
      }, { expectedRevision: existing.snapshotRevision });
    } else {
      if (expectedRevision !== undefined) {
        return jsonError("The engineering session no longer exists. Start a new session explicitly to continue.", 409, {
          code: "SESSION_REVISION_CONFLICT",
          recoverable: true,
          lastTurnSaved: false,
        });
      }
      snapshotRevision = 1;
      await store.save({
        sessionId,
        projectId,
        schemaVersion: ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
        snapshotRevision,
        interpretation: {
          raw: "",
          goal: "engineering task",
          extractedInputs: {},
          missingInputs: [],
          confidence: "LOW",
          ambiguity: "HIGH",
          contextUsed: [],
          assumptions: [],
        },
        conversation,
        updatedAt: now,
      }, { createOnly: true });
    }

    return NextResponse.json({
      sessionId,
      projectId,
      schemaVersion: existing?.schemaVersion ?? ENGINEERING_INTENT_SESSION_SCHEMA_VERSION,
      snapshotRevision,
      conversation,
      updatedAt: now,
      saved: true,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof EngineeringIntentSessionConflictError) {
      return jsonError("The engineering session changed in another request. Restore the latest session before saving.", 409, {
        code: "SESSION_REVISION_CONFLICT",
        recoverable: true,
        lastTurnSaved: false,
      });
    }
    if (error instanceof EngineeringIntentSessionPersistenceError) {
      return jsonError("Engineering intent session storage is unavailable.", 503, {
        code: "SESSION_STORAGE_UNAVAILABLE",
        recoverable: true,
        lastTurnSaved: false,
      });
    }
    return jsonError(
      error instanceof Error ? error.message : "Conversation could not be saved.",
      503,
      { code: "SESSION_SAVE_FAILED", recoverable: true, lastTurnSaved: false },
    );
  }
}

export async function POST(request: Request) {
  const parsedBody = await request.json().catch(() => ({}));
  const body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
    ? parsedBody as Record<string, unknown>
    : {};
  const projectId = parseProjectId(body.projectId);
  let sessionId: string | undefined;
  try {
    sessionId = parseSessionId(body.sessionId);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid sessionId.", 400);
  }

  let authorization;
  try {
    authorization = await authorizeSupabaseRequest("TASK.EXECUTE", projectId);
  } catch {
    return jsonError("Authorization service is unavailable.", 503);
  }
  if (!authorization.allowed) {
    return jsonError(authorization.reason, 403);
  }

  if (typeof body.rawIntent !== "string" || !body.rawIntent.trim()) {
    return jsonError("rawIntent is required.", 400);
  }
  if (!projectId) {
    return jsonError("projectId is required.", 400);
  }

  let sessionStore: SupabaseEngineeringIntentSessionStore | undefined;
  if (sessionId) {
    try {
      sessionStore = await createSessionStore();
    } catch {
      return jsonError("Engineering intent session storage is unavailable.", 503, {
        code: "SESSION_STORAGE_UNAVAILABLE",
        recoverable: true,
      });
    }
  }

  const registry = new CapabilityRegistry();
  registry.registerCatalog(V2_0_10_CAPABILITIES);
  registry.registerCatalog(V2_0_11_CAPABILITIES);
  registry.registerCatalog(V2_0_12_CAPABILITIES);
  registry.registerCatalog(V2_0_14_CAPABILITIES);
  registry.registerCatalog(V2_0_21_CAPABILITIES);
  registry.registerCatalog(ENGINEERING_CAPABILITIES);

  const router = new CapabilityRouter(registry);
  registry.register(new RiskAdaptiveExperienceProvider());
  registry.register(new EngineeringContextProvider());
  registry.register(new NumericalAnalysisProvider());
  registry.register(new EngineeringCompletionProvider(router));
  registry.register(new ElectricalEngineeringCompletionProvider(router));
  registry.register(new ElectricalAnalysisProvider());
  registry.register(new EngineeringVerificationProvider());
  registry.register(new AIEngineeringIntentProvider(
    router,
    createDefaultDeterministicEngineeringIntentInterpreter(),
    sessionStore,
  ));

  let result;
  try {
    result = await router.execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: {
        rawIntent: body.rawIntent.trim(),
        projectId,
        sessionId,
        context: body.context,
        approval: body.approval,
      },
    });
  } catch (error) {
    if (error instanceof EngineeringIntentSessionConflictError) {
      return jsonError("The engineering session changed in another request. Restore the latest session before retrying.", 409, {
        code: "SESSION_REVISION_CONFLICT",
        recoverable: true,
      });
    }
    if (error instanceof EngineeringIntentSessionPersistenceError) {
      return jsonError("Engineering intent session storage is unavailable.", 503, {
        code: "SESSION_STORAGE_UNAVAILABLE",
        recoverable: true,
      });
    }
    return jsonError("Engineering intent execution failed.", 500);
  }

  if (!result.success && result.output) {
    return NextResponse.json(result.output, { status: 422, headers: { "cache-control": "no-store" } });
  }

  return result.success
    ? NextResponse.json(result.output, { headers: { "cache-control": "no-store" } })
    : jsonError(result.error ?? "Engineering intent execution failed.", 500);
}
