import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isAuthApi(pathname: string) {
  return pathname.startsWith("/api/auth/");
}

function isProtectedApi(pathname: string) {
  return pathname.startsWith("/api/") && !isAuthApi(pathname);
}

function isProtectedPage(pathname: string) {
  return pathname.startsWith("/projects");
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    const pathname = request.nextUrl.pathname;
    if (isProtectedApi(pathname)) {
      return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
    }
    if (isProtectedPage(pathname)) {
      return NextResponse.redirect(new URL("/login?error=auth_not_configured", request.url));
    }
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const pathname = request.nextUrl.pathname;

  if (!claims && isProtectedPage(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!claims && isProtectedApi(pathname)) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  return response;
}
