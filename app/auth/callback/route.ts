import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { getPublicUrl } from "../../../lib/http/public-origin";
import {
  getSafeAuthCallbackDestination,
  isSupportedAuthCallbackOtpType,
} from "../../../src/auth/password-recovery";

export const runtime = "nodejs";

type CallbackCredential =
  | { kind: "code"; code: string }
  | { kind: "otp"; tokenHash: string; otpType: "signup" | "recovery" };

function getCallbackCredential(params: URLSearchParams): CallbackCredential | null {
  const code = params.get("code");
  if (code) return { kind: "code", code };

  const tokenHash = params.get("token_hash");
  const otpType = params.get("type");
  if (tokenHash && isSupportedAuthCallbackOtpType(otpType)) {
    return { kind: "otp", tokenHash, otpType };
  }

  return null;
}

async function exchangeCallbackCredential(credential: CallbackCredential): Promise<boolean> {
  try {
    const supabase = await createClient();
    const result = credential.kind === "code"
      ? await supabase.auth.exchangeCodeForSession(credential.code)
      : await supabase.auth.verifyOtp({
          token_hash: credential.tokenHash,
          type: credential.otpType,
        });
    return !result.error;
  } catch {
    return false;
  }
}

async function resolveCallbackDestination(request: NextRequest): Promise<string | null> {
  const params = new URL(request.url).searchParams;
  const credential = getCallbackCredential(params);
  if (!credential) return null;

  const exchanged = await exchangeCallbackCredential(credential);
  if (!exchanged) return null;

  return getSafeAuthCallbackDestination(params.get("next"));
}

export async function GET(request: NextRequest) {
  const destination = await resolveCallbackDestination(request);
  const redirectPath = destination ?? "/login?error=auth-callback-failed";
  return NextResponse.redirect(getPublicUrl(redirectPath, request), { status: 303 });
}
