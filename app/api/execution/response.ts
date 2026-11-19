import { NextResponse } from "next/server";

export function jsonError(error: string, status: number, code?: string): NextResponse {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, {
    status,
    headers: { "cache-control": "no-store" }
  });
}
