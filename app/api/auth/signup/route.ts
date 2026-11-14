import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicUrl } from "../../../../lib/http/public-origin";
import { checkPasswordBreach } from "../../../../src/auth/password-breach";
import { validatePasswordUpdate } from "../../../../src/auth/password-recovery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const validation = validatePasswordUpdate(form.get("password"), form.get("confirmPassword"));

    if (!email || !validation.ok) {
      const error = !email ? "missing-fields" : validation.reason;
      return NextResponse.redirect(getPublicUrl(`/signup?error=${error}`, request), { status: 303 });
    }

    const breachCheck = await checkPasswordBreach(validation.password);
    if (breachCheck.status !== "safe") {
      const error = breachCheck.status === "compromised"
        ? "password-compromised"
        : "password-check-unavailable";
      return NextResponse.redirect(getPublicUrl(`/signup?error=${error}`, request), { status: 303 });
    }

    const callbackUrl = getPublicUrl("/auth/callback", request);
    callbackUrl.searchParams.set("next", "/login?confirmed=1");

    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password: validation.password,
      options: { emailRedirectTo: callbackUrl.toString() },
    });
    if (error) {
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
