import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicUrl } from "../../../../lib/http/public-origin";

export const runtime = "nodejs";

function isSameOriginPost(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === getPublicUrl("/", request).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();

    if (!email) {
      return NextResponse.redirect(getPublicUrl("/forgot-password?error=invalid-request", request), { status: 303 });
    }

    const callbackUrl = getPublicUrl("/auth/callback", request);
    callbackUrl.searchParams.set("next", "/update-password");

    const supabase = await createClient();
    // Always return the same browser response to avoid account enumeration.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl.toString(),
    });

    return NextResponse.redirect(getPublicUrl("/forgot-password?sent=1", request), { status: 303 });
  } catch {
    try {
      return NextResponse.redirect(getPublicUrl("/forgot-password?sent=1", request), { status: 303 });
    } catch {
      return NextResponse.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 });
    }
  }
}
