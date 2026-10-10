import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Privileged database writer for server-only workflows whose evidence must not be
 * forgeable through direct authenticated-table INSERTs. Authenticate and authorize
 * every user request before calling this client; never return it to a browser.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Server-side Supabase service-role configuration is required for trusted CAD completion writes.");
  }
  if (key.startsWith("sb_publishable_") || key.startsWith("sb_anon_")) {
    throw new Error("A public Supabase key cannot be used for trusted server-side completion writes.");
  }
  if (key.startsWith("eyJ")) {
    try {
      const claims = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8")) as { role?: unknown };
      if (claims.role !== "service_role") throw new Error("wrong role");
    } catch {
      throw new Error("The configured Supabase JWT is not a valid service_role key.");
    }
  } else if (!key.startsWith("sb_secret_")) {
    throw new Error("Configure the Supabase service_role JWT or a current sb_secret_ key; public keys are not allowed.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
