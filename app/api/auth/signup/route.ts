import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicUrl } from "../../../../lib/http/public-origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (!email || !password) {
      return NextResponse.redirect(getPublicUrl("/signup?error=missing-fields", request), { status: 303 });
    }
    if (password.length < 10) {
      return NextResponse.redirect(getPublicUrl("/signup?error=password-policy", request), { status: 303 });
    }
    if (password !== confirmPassword) {
      return NextResponse.redirect(getPublicUrl("/signup?error=password-mismatch", request), { status: 303 });
    }

    // Use the trusted public origin and the SSR PKCE callback to establish the cookie session.
    const callbackUrl = getPublicUrl("/auth/callback", request);
    callbackUrl.searchParams.set("next", "/login?confirmed=1");

    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl.toString() },
    });
    if (error) {
      // Avoid disclosing whether an email address is already registered.
      return NextResponse.redirect(getPublicUrl("/signup?error=registration-failed", request), { status: 303 });
    }

    return NextResponse.redirect(getPublicUrl("/login?registered=1", request), { status: 303 });
  } catch {
    try {
      return NextResponse.redirect(getPublicUrl("/signup?error=registration-unavailable", request), { status: 303 });
    } catch {
      return NextResponse.json({ error: "Registration is temporarily unavailable." }, { status: 503 });
    }
  }
}
