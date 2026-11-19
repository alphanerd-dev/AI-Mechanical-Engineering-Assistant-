import { isRecord } from "./durable.js";
import { isDurableExecutionCanaryProject, isDurableExecutionEnabledForProject } from "../../../src/execution/durable-feature-gate.js";
import { handleDurableExecution } from "./durable-handler.js";
import { legacySynchronousPost } from "./legacy.js";
import { jsonError } from "./response.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsedBody = await request.json().catch(() => ({}));
  const globallyEnabled = process.env.DURABLE_EXECUTION_ENABLED === "true";
  if (!isRecord(parsedBody)) {
    if (globallyEnabled) {
      return jsonError("Request body must be a JSON object.", 400, "INVALID_REQUEST");
    }
    return legacySynchronousPost(request, {});
  }
  if (!isDurableExecutionEnabledForProject(parsedBody.projectId)) return legacySynchronousPost(request, parsedBody);
  if (isDurableExecutionCanaryProject(parsedBody.projectId) && parsedBody.backend !== "typescript-safe") {
    return jsonError("The durable canary project is restricted to the typescript-safe backend.", 403, "DURABLE_EXECUTION_CANARY_BACKEND_BLOCKED");
  }
  return handleDurableExecution(request, parsedBody);
}
