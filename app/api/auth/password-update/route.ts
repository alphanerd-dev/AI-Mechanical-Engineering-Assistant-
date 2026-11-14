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

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const validation = validatePasswordUpdate(form.get("password"), form.get("confirmPassword"));

    if (!validation.ok) {
      return NextResponse.redirect(
        getPublicUrl("/update-password?error=" + validation.reason, request),
        { status: 303 },
      );
    }

    const breachCheck = await checkPasswordBreach(validation.password);
    if (breachCheck.status !== "safe") {
      const error = breachCheck.status === "compromised"
        ? "password-compromised"
        : "password-check-unavailable";
      return NextResponse.redirect(getPublicUrl(`/update-password?error=${error}`, request), { status: 303 });
    }

    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.redirect(getPublicUrl("/login?error=auth-callback-failed", request), { status: 303 });
    }

    const { error } = await supabase.auth.updateUser({ password: validation.password });
    if (error) {
      return NextResponse.redirect(getPublicUrl("/update-password?error=update-failed", request), { status: 303 });
    }

    return NextResponse.redirect(getPublicUrl("/login?passwordUpdated=1", request), { status: 303 });
  } catch {
    return NextResponse.redirect(getPublicUrl("/update-password?error=update-failed", request), { status: 303 });
  }
}
