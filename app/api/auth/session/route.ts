import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getAuthenticatedIdentity } from "../../../../src/auth/supabase-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return NextResponse.json({ authenticated: false }, { status: 401 });

    // Session presence is distinct from engineering authorization. Roleless or
    // newly registered users must still be able to sign out.
    const identity = await getAuthenticatedIdentity();
    return NextResponse.json({ authenticated: true, identity });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication is not configured." },
      { status: 503 },
    );
  }
}
