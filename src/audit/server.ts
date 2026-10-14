import "server-only";
import { createServiceRoleClient } from "../../lib/supabase/service";
import type { AuditEventInput } from "./types.js";
import { SupabaseDurableAuditStore } from "./durable-store.js";

/** Server-only writer; browser clients cannot call this module. */
export async function persistEngineeringAuditEvent(input: AuditEventInput) {
  return new SupabaseDurableAuditStore(createServiceRoleClient()).append(input);
}
