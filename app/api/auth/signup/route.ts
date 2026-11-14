import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicUrl } from "../../../../lib/http/public-origin";
import { checkPasswordBreach } from "../../../../src/auth/password-breach";
import { validatePasswordUpdate } from "../../../../src/auth/password-recovery";

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

function redirectToSignupError(request: Request, error: string) {
  return NextResponse.redirect(getPublicUrl(`/signup?error=${error}`, request), { status: 303 });
}

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const validation = validatePasswordUpdate(form.get("password"), form.get("confirmPassword"));

    if (!email || !validation.ok) {
      const error = !email ? "missing-fields" : validation.reason;
      return redirectToSignupError(request, error);
    }

    const breachCheck = await checkPasswordBreach(validation.password);
    if (breachCheck.status !== "safe") {
      const error = breachCheck.status === "compromised"
        ? "password-compromised"
        : "password-check-unavailable";
      return redirectToSignupError(request, error);
    }

    const callbackUrl = getPublicUrl("/auth/callback", request);
    callbackUrl.searchParams.set("next", "/login?confirmed=1");

    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password: validation.password,
      options: { emailRedirectTo: callbackUrl.toString() },
    });
    if (error) return redirectToSignupError(request, "registration-failed");

    return NextResponse.redirect(getPublicUrl("/login?registered=1", request), { status: 303 });
  } catch {
    return redirectToSignupError(request, "registration-unavailable");
  }
}
