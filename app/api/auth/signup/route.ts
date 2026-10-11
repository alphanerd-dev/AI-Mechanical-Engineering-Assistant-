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

    // Never rely on Supabase's Site URL default for production confirmation links.
    // That dashboard value may still point at localhost, so pass an explicit,
    // deployment-controlled redirect URL for every signup.
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const siteUrl = configuredSiteUrl ? new URL(configuredSiteUrl) : new URL(request.url);
    if (siteUrl.protocol !== "https:" && siteUrl.hostname !== "localhost" && siteUrl.hostname !== "127.0.0.1") {
      return NextResponse.redirect(new URL("/signup?error=registration-unavailable", request.url), { status: 303 });
    }
    const emailRedirectTo = new URL("/login?confirmed=1", siteUrl).toString();

    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });
    if (error) {
      // Avoid disclosing whether an email address is already registered.
      return NextResponse.redirect(new URL("/signup?error=registration-failed", request.url), { status: 303 });
    }

    // The confirmation email now targets the configured site, never the local dev origin.
    return NextResponse.redirect(new URL("/login?registered=1", request.url), { status: 303 });
  } catch {
    return NextResponse.redirect(new URL("/signup?error=registration-unavailable", request.url), { status: 303 });
  }
}
