import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicUrl } from "../../../../lib/http/public-origin";
import { getSafeAuthCallbackDestination } from "../../../../src/auth/password-recovery";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = getSafeAuthCallbackDestination(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(getPublicUrl("/login?error=auth-callback-failed", request), { status: 303 });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(getPublicUrl("/login?error=auth-callback-failed", request), { status: 303 });
    }

    return NextResponse.redirect(getPublicUrl(destination, request), { status: 303 });
  } catch {
    return NextResponse.redirect(getPublicUrl("/login?error=auth-callback-failed", request), { status: 303 });
  }
}
