import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicUrl } from "../../../../lib/http/public-origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();

    if (!email) {
      return NextResponse.redirect(getPublicUrl("/forgot-password?error=missing-email", request), { status: 303 });
    }

    const redirectTo = getPublicUrl(
      "/auth/callback?next=%2Fupdate-password",
      request,
    ).toString();
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    // Keep the response identical for known and unknown email addresses.
    // The user can retry if no message arrives; never expose account existence.
    if (error) {
      return NextResponse.redirect(getPublicUrl("/forgot-password?sent=1", request), { status: 303 });
    }

    return NextResponse.redirect(getPublicUrl("/forgot-password?sent=1", request), { status: 303 });
  } catch {
    try {
      return NextResponse.redirect(getPublicUrl("/forgot-password?error=unavailable", request), { status: 303 });
    } catch {
      return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
    }
  }
}
