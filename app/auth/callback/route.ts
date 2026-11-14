import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { getPublicUrl } from "../../../lib/http/public-origin";
import {
  getSafeAuthCallbackDestination,
  isSupportedAuthCallbackOtpType,
} from "../../../src/auth/password-recovery";

export const runtime = "nodejs";

function hasValidCallbackCredential(
  code: string | null,
  tokenHash: string | null,
  otpType: string | null,
): boolean {
  if (code) return true;
  if (!tokenHash) return false;
  return isSupportedAuthCallbackOtpType(otpType);
}

async function exchangeCallbackCredential(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: string | null,
  tokenHash: string | null,
  otpType: string | null,
) {
  if (code) {
    return supabase.auth.exchangeCodeForSession(code);
  }

  return supabase.auth.verifyOtp({
    token_hash: tokenHash!,
    type: otpType as "signup" | "recovery",
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  const destination = getSafeAuthCallbackDestination(url.searchParams.get("next"));

  if (!hasValidCallbackCredential(code, tokenHash, otpType)) {
    return NextResponse.redirect(getPublicUrl("/login?error=auth-callback-failed", request), { status: 303 });
  }

  try {
    const supabase = await createClient();
    const result = await exchangeCallbackCredential(supabase, code, tokenHash, otpType);

    if (result.error) {
      return NextResponse.redirect(getPublicUrl("/login?error=auth-callback-failed", request), { status: 303 });
    }

    return NextResponse.redirect(getPublicUrl(destination, request), { status: 303 });
  } catch {
    return NextResponse.redirect(getPublicUrl("/login?error=auth-callback-failed", request), { status: 303 });
  }
}
