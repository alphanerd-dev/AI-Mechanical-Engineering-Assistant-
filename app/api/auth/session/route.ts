import { NextResponse } from "next/server";
import { getAuthenticatedIdentity } from "../../../../src/auth/supabase-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const identity = await getAuthenticatedIdentity();
    if (!identity) return NextResponse.json({ authenticated: false }, { status: 401 });
    return NextResponse.json({ authenticated: true, identity });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication is not configured." },
      { status: 503 },
    );
  }
}
