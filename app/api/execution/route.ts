import { isRecord } from "./durable.js";
import { handleDurableExecution } from "./durable-handler.js";
import { legacySynchronousPost } from "./legacy.js";
import { jsonError } from "./response.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsedBody = await request.json().catch(() => ({}));
  const durableEnabled = process.env.DURABLE_EXECUTION_ENABLED === "true";
  if (!isRecord(parsedBody)) {
    if (durableEnabled) {
      return jsonError("Request body must be a JSON object.", 400, "INVALID_REQUEST");
    }
    return legacySynchronousPost(request, {});
  }
  if (!durableEnabled) return legacySynchronousPost(request, parsedBody);
  return handleDurableExecution(request, parsedBody);
}
