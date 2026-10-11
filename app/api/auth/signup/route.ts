import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (!email || !password) {
      return NextResponse.redirect(new URL("/signup?error=missing-fields", request.url), { status: 303 });
    }
    if (password.length < 10) {
      return NextResponse.redirect(new URL("/signup?error=password-policy", request.url), { status: 303 });
    }
    if (password !== confirmPassword) {
      return NextResponse.redirect(new URL("/signup?error=password-mismatch", request.url), { status: 303 });
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      // Avoid disclosing whether an email address is already registered.
      return NextResponse.redirect(new URL("/signup?error=registration-failed", request.url), { status: 303 });
    }

    // Supabase may require email confirmation before a session can be established.
    return NextResponse.redirect(new URL("/login?registered=1", request.url), { status: 303 });
  } catch {
    return NextResponse.redirect(new URL("/signup?error=registration-unavailable", request.url), { status: 303 });
  }
}
