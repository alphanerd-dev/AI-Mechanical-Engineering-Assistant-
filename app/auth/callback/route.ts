import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { getPublicUrl } from "../../../lib/http/public-origin";

export const runtime = "nodejs";

function getSafeNextPath(value: string | null): "/update-password" | "/login" {
  return value === "/update-password" ? "/update-password" : "/login";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeNextPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(getPublicUrl("/login?error=auth-callback-failed", request), { status: 303 });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(getPublicUrl("/login?error=auth-callback-failed", request), { status: 303 });
    }
    return NextResponse.redirect(getPublicUrl(next, request), { status: 303 });
  } catch {
    return NextResponse.redirect(getPublicUrl("/login?error=auth-callback-failed", request), { status: 303 });
  }
}
